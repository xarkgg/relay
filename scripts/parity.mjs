import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer';

const record = process.argv.includes('--record');
const reference = process.env.RELAY_UI_BASELINE || JSON.parse(await readFile('probe-shots/migration-baseline.json', 'utf8')).directory;
const directory = record ? join(reference, 'export') : resolve('frontend/out');
const captures = record ? join(reference, 'captures') : resolve('probe-shots/vite-parity');
const config = JSON.parse(await readFile(record ? join(reference, 'deployment.json') : '.vercel/output/config.json', 'utf8'));
await mkdir(captures, { recursive: true });

const app = express();
app.use((_req, res, next) => { res.set(config.routes[0].headers); next(); });
for (const route of config.routes.filter(route => route.headers?.Location)) {
  app.use((req, res, next) => new RegExp(route.src).test(req.path)
    ? res.status(route.status).set(route.headers).end() : next());
}
app.use(express.static(directory));
app.use((_req, res) => res.status(404).sendFile('404.html', { root: directory }));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ headless: true,
  timeout: 30_000, protocolTimeout: 30_000,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: ['--disable-dev-shm-usage', '--disable-gpu'] });
const PNG = record ? null : (await import('pngjs')).PNG;
const snapshots = [];
const errors = [];
let frames = 0;

async function frame(page, name, javascript = true) {
  if (record && process.argv.includes('--resume')) {
    try {
      await readFile(join(captures, `${name}.json`));
      frames++;
      return;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (javascript) await page.evaluate(async () => {
    await document.fonts.ready;
    // Stabilize the blinking caret for image comparison only.
    document.querySelectorAll('input').forEach(node => { node.style.caretColor = 'transparent'; });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector('.app-shell, .privacy-page');
    const properties = ['display','position','color','background-color','background-image','font-family','font-size',
      'font-weight','line-height','letter-spacing','padding','margin','gap','grid-template-columns','border','border-radius',
      'box-shadow','outline','opacity','filter','transform','fill','stroke','stroke-width','overflow','text-overflow',
      'white-space','appearance','box-sizing','min-height','max-height','color-scheme'];
    const nodes = root ? [root, ...root.querySelectorAll('*')] : [];
    const active = document.activeElement;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      meta: [...document.head.querySelectorAll('meta')].map(node => Object.fromEntries([...node.attributes]
        .map(attr => [attr.name, attr.value]))),
      icons: [...document.head.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="preload"][as="image"]')]
        .map(node => Object.fromEntries([...node.attributes].map(attr => [attr.name, attr.value]))),
      text: root?.innerText,
      size: [innerWidth, innerHeight, document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      active: active ? [active.tagName, active.getAttribute('class'), active.getAttribute('aria-label')] : null,
      nodes: nodes.map(node => {
        const rect = node.getBoundingClientRect();
        const css = getComputedStyle(node);
        return {
          tag: node.tagName,
          attributes: Object.fromEntries([...node.attributes].filter(attr => attr.name !== 'style')
            .map(attr => [attr.name, attr.value])),
          checked: node instanceof HTMLInputElement ? node.checked : undefined,
          value: node instanceof HTMLInputElement || node instanceof HTMLSelectElement ? node.value : undefined,
          rect: [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10000) / 10000),
          css: Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]))
        };
      })
    };
  });
  snapshots.push({ name, snapshot });
  const filename = `${name}.png`;
  // Chromium can use a transient rounded-border paint on the first capture
  // after a style change. Warm the compositor on both reference and candidate;
  // the comparison remains exact, with no pixel tolerance or masking.
  await page.screenshot({ fullPage: true });
  const image = await page.screenshot({ fullPage: true, path: join(captures, filename) });
  if (!record) {
    const expected = JSON.parse(await readFile(join(reference, 'captures', `${name}.json`), 'utf8'));
    assert.deepEqual(snapshot, expected, `${name}: UI text, attributes, metadata, focus, geometry and computed styles changed`);
    const before = PNG.sync.read(await readFile(join(reference, 'captures', filename)));
    const after = PNG.sync.read(image);
    assert.deepEqual([after.width, after.height], [before.width, before.height], `${name}: image dimensions changed`);
    let changed = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1]
        || before.data[i + 2] !== after.data[i + 2] || before.data[i + 3] !== after.data[i + 3]) changed++;
    }
    assert.equal(changed, 0, `${name}: ${changed} rendered pixels changed`);
  } else {
    await writeFile(join(captures, `${name}.json`), JSON.stringify(snapshot));
  }
  frames++;
  console.log(`${record ? 'record' : 'match'} ${frames} - ${name}${record ? '' : ' (0 changed pixels)'}`);
}

async function pageFor(context, width, javascript = true) {
  const page = await context.newPage();
  await page.setViewport({ width, height: width < 700 ? 844 : 1000, deviceScaleFactor: 1 });
  await page.setJavaScriptEnabled(javascript);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}

async function reset(page) {
  await page.goto(base, { waitUntil: 'networkidle0' });
  // A search/reset proves hydration completed before subsequent interactions.
  await page.type('[aria-label="Search agents"]', 'Domain');
  await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 1);
  await page.type('[aria-label="Search agents"]', ' unlikely-match');
  await page.waitForSelector('.empty-state');
  await page.click('.empty-state button');
  await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 12);
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
}

try {
  for (const width of [320,390,640,900,1000,1250,1280,1600]) {
    const context = await browser.createBrowserContext();
    try {
      const page = await pageFor(context, width);
      await reset(page);
      await frame(page, `${width}-grid`);
      await page.click('[aria-label="List view"]');
      await page.waitForSelector('.agent-grid.list-view');
      await page.evaluate(() => scrollTo(0, 0));
      await frame(page, `${width}-list`);
      await page.click('[aria-label="Grid view"]');
      await page.click('.more-chip');
      await page.waitForSelector('.more-menu');
      await frame(page, `${width}-more-menu`);
      await page.click('.more-chip');
      await page.click('.go-button');
      await page.waitForSelector('.agent-dialog[open]');
      await frame(page, `${width}-details`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.agent-dialog', { hidden: true });
      await frame(page, `${width}-details-closed-focus`);
      if (width <= 900) {
        await page.click('[aria-label="Show filters"]');
        await page.waitForSelector('.filter-panel.filters-open');
        await frame(page, `${width}-mobile-filters`);
        await page.click('[aria-label="Close filters"]');
      }
      await page.goto(base + '/privacy/', { waitUntil: 'networkidle0' });
      await frame(page, `${width}-privacy`);
      const response = await page.goto(base + '/not-a-real-page', { waitUntil: 'networkidle0' });
      assert.equal(response.status(), 404);
      await frame(page, `${width}-404`);
      await page.close();
      const noJs = await pageFor(context, width, false);
      await noJs.goto(base, { waitUntil: 'networkidle0' });
      await frame(noJs, `${width}-no-javascript`, false);
    } finally { await context.close(); }
  }

  const context = await browser.createBrowserContext();
  try {
    const page = await pageFor(context, 1280);
    await reset(page);
    await page.type('[aria-label="Search agents"]', 'Domain');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 1);
    await frame(page, 'behavior-search');
    await page.type('[aria-label="Search agents"]', ' unlikely-match');
    await page.waitForSelector('.empty-state');
    await frame(page, 'behavior-empty');
    await page.click('.empty-state button');
    await page.click('[aria-label="Marketing"]');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 4);
    await frame(page, 'behavior-category');
    await page.click('[aria-label="Premium"]');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 2);
    await frame(page, 'behavior-pricing');
    await page.click('.clear-button');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 12);
    for (const sort of ['Top rated','Most popular']) {
      await page.select('[aria-label="Sort agents"]', sort);
      await page.waitForFunction(() => document.querySelector('.agent-card h2').textContent === 'Domain Idea Generator');
      await frame(page, `behavior-sort-${sort.replaceAll(' ', '-')}`);
    }
    await page.select('[aria-label="Sort agents"]', 'Relevance');
    await page.click('.save-button');
    await page.waitForSelector('.save-button[aria-pressed="true"]');
    await frame(page, 'behavior-saved');
    await page.click('.more-chip');
    await page.click('.more-menu button');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 1);
    await frame(page, 'behavior-saved-view');
    await page.click('.save-button');
    await page.waitForSelector('.empty-state');
    await frame(page, 'behavior-saved-empty');
    await reset(page);
    await page.click('[aria-label="Toggle color theme"]');
    await page.waitForSelector('.topbar.dark-mode');
    await frame(page, 'behavior-theme');
    await reset(page);
    await page.click('.nav-item:nth-child(2)');
    await frame(page, 'behavior-navigation');
    await reset(page);
    for (const section of ['Team','Agent Type','Integrations','Author','Rating','Publish Date']) {
      await page.$$eval('.filter-heading', (nodes, title) => nodes.find(node => node.textContent === title).click(), section);
      await frame(page, `behavior-section-${section.replaceAll(' ', '-')}`);
    }
    await reset(page);
    const chips = await page.$$eval('.quick-filters .chip', nodes => nodes.map(node => node.textContent));
    for (let i = 0; i < chips.length; i++) {
      await reset(page);
      await page.click(`.quick-filters .chip:nth-child(${i + 1})`);
      await frame(page, `behavior-chip-${i}`);
    }
    await reset(page);
    await page.click('.save-button');
    await page.waitForSelector('.save-button[aria-pressed="true"]');
    await page.click('.preview-footer a');
    await page.waitForSelector('.privacy-page');
    // BFCache restores need not emit a fresh network-idle navigation event.
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => Boolean(document.querySelector('.app-shell')));
    await frame(page, 'behavior-browser-back');
    await reset(page);
    await page.keyboard.press('Tab');
    await frame(page, 'behavior-keyboard-focus');
    await reset(page);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await frame(page, 'behavior-system-dark');

    const routes = [];
    for (const path of ['/','/index.html','/privacy','/privacy/','/privacy.html','/privacy/index.html','/404.html','/404/','/_not-found/','/not-a-real-page','/api/workspace','/.env']) {
      const response = await fetch(base + path, { redirect: 'manual' });
      routes.push({ path, status: response.status, location: response.headers.get('location'),
        type: response.headers.get('content-type')?.split(';')[0] || null });
    }
    if (record) await writeFile(join(reference, 'routes.json'), JSON.stringify(routes));
    else assert.deepEqual(routes, JSON.parse(await readFile(join(reference, 'routes.json'), 'utf8'))
      .map(route => ({ ...route, type: route.type ?? null })), 'Public route responses changed');
  } finally { await context.close(); }
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  await writeFile(join(captures, 'summary.json'), JSON.stringify({ frames, changedPixels: 0, routesMatched: !record }, null, 2));
  console.log(`PASS: ${frames} ${record ? 'reference snapshots recorded' : 'snapshots matched with zero pixel or UI-state differences'}.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
