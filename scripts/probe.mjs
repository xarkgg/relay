import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';

await readFile('frontend/out/index.html');
const deployment = JSON.parse(await readFile('.vercel/output/config.json', 'utf8'));
let puppeteer;
try { puppeteer = (await import(process.env.RELAY_PUPPETEER_PATH || 'puppeteer')).default; }
catch {
  const root = execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  puppeteer = (await import(pathToFileURL(`${root}/puppeteer/lib/puppeteer/puppeteer.js`).href)).default;
}
const browser = await puppeteer.launch({headless:true, pipe:true, timeout:30_000, protocolTimeout:30_000,
  executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
await mkdir('probe-shots',{recursive:true});
const store = openStore();
const { app, service } = createApp({store});
const server = await new Promise(resolve => { const server = app.listen(0,'127.0.0.1',() => resolve(server)); });
const base = `http://127.0.0.1:${server.address().port}`;
let checks = 0;
function verify(value,message) { assert.ok(value,message); checks++; console.log(`ok ${checks} - ${message}`); }
const errors = [];

async function checkMarketplace(url, label) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.setViewport({width:1280,height:1000});
    await page.goto(url,{waitUntil:'networkidle0'});
    verify(await page.$$eval('link[rel="icon"]', icons => icons.length === 1 &&
      icons[0].getAttribute('href') === '/favicon.png' && icons[0].type === 'image/png'), `${label}: browser tab uses the supplied PNG favicon`);
    const favicon = await fetch(url + '/favicon.png');
    verify(favicon.ok && favicon.headers.get('content-type')?.startsWith('image/png'), `${label}: favicon is served as PNG`);
    verify((await page.$$('.agent-card')).length === 12, `${label}: sample marketplace renders`);
    verify(await page.$eval('.results-count strong', node => node.textContent === '12'), `${label}: count reflects the displayed listings`);
    verify(await page.$eval('.preview-footer', node => node.textContent.includes('Sample listings')), `${label}: preview status is explicit`);

    const searchInput = 'input[aria-label="Search agents"]';
    verify(await page.$eval(searchInput, node => node.closest('.search-box').nextElementSibling.matches('.filter-toggle')), `${label}: search and Filters sit together above the results`);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Control');
    await page.waitForSelector(`${searchInput}[aria-expanded="true"]`);
    verify(await page.$eval(searchInput, node => node === document.activeElement), `${label}: the keyboard shortcut opens and focuses search`);
    await page.type(searchInput, 'Domain');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 1);
    verify(await page.$eval('.agent-card h2', node => node.textContent === 'Domain Idea Generator'), `${label}: the search field updates the agent grid as you type`);
    verify(await page.$eval('.search-suggestion-list [role="option"] strong', node => node.textContent === 'Domain Idea Generator'), `${label}: live agent suggestions appear below the search field`);
    await page.type(searchInput, ' no-such-agent');
    await page.waitForSelector('.empty-state');
    verify(await page.$eval('.empty-state', node => node.textContent.includes('No agents found')), `${label}: empty search results are handled`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.search-suggestions', {hidden:true});
    await page.click('.empty-state button');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 12);

    await page.click('[aria-label="Show filters"]');
    await page.waitForSelector('.filters-popover:not([hidden])', {visible:true});
    await page.click('.filter-option input[aria-label="Marketing"]');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 4);
    await page.click('.filter-option input[aria-label="Premium"]');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 2);
    verify(await page.$$eval('.pricing-badge', nodes => nodes.every(node => node.textContent === 'Premium')), `${label}: category and pricing filters combine`);
    await page.click('.clear-button');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 12);
    await page.click('.filter-actions button:nth-child(2)');
    await page.waitForSelector('.filters-popover', {hidden:true});
    verify(await page.$eval('.sort-value span', node => node.textContent === 'Top rated'), `${label}: Filters offers the Top rated shortcut`);

    async function selectSort(value) {
      await page.click('.sort-value');
      const option = await page.waitForSelector(`.sort-menu button[aria-label="${value}"]`, {visible:true});
      await option.click();
      await page.waitForSelector('.sort-menu', {hidden:true});
    }
    for (const sort of ['Top rated', 'Most popular']) {
      await selectSort(sort);
      await page.waitForFunction(() => document.querySelector('.agent-card h2').textContent === 'Domain Idea Generator');
      verify(await page.$eval('.agent-card h2', node => node.textContent === 'Domain Idea Generator'), `${label}: ${sort} sorting works`);
    }
    await selectSort('Relevance');
    await page.waitForFunction(() => document.querySelector('.agent-card h2').textContent === 'Buyer Persona Builder');
    await page.click('.save-button');
    await page.waitForSelector('.save-button[aria-pressed="true"]');
    await page.click('[aria-label="Show filters"]');
    await page.waitForSelector('.filters-popover:not([hidden])', {visible:true});
    await page.click('.filter-actions button');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 1);
    verify(await page.$eval('.agent-card h2', node => node.textContent === 'Buyer Persona Builder'), `${label}: saved view shows only saved agents`);
    await page.click('.save-button');
    await page.waitForSelector('.empty-state');
    await page.click('.clear-saved');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 12);

    await page.click('[aria-label="List view"]');
    await page.waitForSelector('.agent-grid.list-view');
    verify(await page.$eval('[aria-label="List view"]', node => node.getAttribute('aria-pressed') === 'true'), `${label}: list view is interactive`);
    await page.click('[aria-label="Grid view"]');
    await page.waitForSelector('.agent-grid:not(.list-view)');

    for (const width of [320,390,900,1280,1600]) {
      await page.setViewport({width,height:width < 600 ? 844 : 1000});
      await page.evaluate(() => scrollTo(0, 0));
      verify(await page.$eval('.topbar', node => {
        const { top, left, right } = node.getBoundingClientRect();
        return top === 0 && left === 0 && right === document.documentElement.clientWidth;
      }), `${label}: header reaches the top and both sides at ${width}px`);
      verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no horizontal overflow at ${width}px`);
      await page.screenshot({path:`probe-shots/${label}-${width}.png`,fullPage:true});
      await page.click('.go-button');
      await page.waitForSelector('.agent-dialog[open]');
      verify(await page.$eval('.agent-dialog', node => node.scrollWidth <= node.clientWidth), `${label}: details fit at ${width}px`);
      verify(await page.$eval('.dialog-launch', node => node.disabled), `${label}: preview does not pretend to launch an agent`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.agent-dialog', {hidden:true});
    }

    await page.setViewport({width:390,height:844});
    await page.click('[aria-label="Show filters"]');
    await page.waitForSelector('.filters-popover:not([hidden])', {visible:true});
    await page.click('.filter-option input[aria-label="Marketing"]');
    await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 4);
    await page.click('[aria-label="Close filters"]');
    verify(await page.$eval('.filters-popover', node => node.hidden), `${label}: mobile filters open and close`);

    await page.click('.preview-footer a');
    await page.waitForSelector('.privacy-page');
    verify(await page.$eval('main', node => node.textContent.includes('not encrypted')), `${label}: footer privacy link opens the privacy page`);
    verify(!requests.some(value => new URL(value).pathname.startsWith('/api/')), `${label}: preview makes no backend API requests`);
    // Embedded data: SVGs are assets, not third-party network requests.
    const externalRequests = requests.filter(value => {
      const request = new URL(value);
      return ['http:', 'https:'].includes(request.protocol) && request.origin !== new URL(url).origin;
    });
    verify(externalRequests.length === 0, `${label}: no third-party requests or analytics`);
  } finally { await context.close(); }
}

try {
  await checkMarketplace(base, 'local');
  verify(service.snapshot().runs.length === 0 && service.snapshot().imports.length === 0, 'browsing the marketplace does not run backend work');

  const staticApp = express();
  const staticRoot = resolve('.vercel/output/static');
  staticApp.use((_req, res, next) => { res.set(deployment.routes[0].headers); next(); });
  staticApp.use(express.static(staticRoot));
  staticApp.use((_req, res) => res.status(404).sendFile('404.html', { root: staticRoot }));
  const staticServer = await new Promise(resolve => { const server = staticApp.listen(0,'127.0.0.1',() => resolve(server)); });
  try {
    const previewBase = process.env.RELAY_PREVIEW_URL || `http://127.0.0.1:${staticServer.address().port}`;
    if (process.env.RELAY_PREVIEW_URL) assert.equal(new URL(previewBase).protocol,'https:');
    await checkMarketplace(previewBase, 'catalogue');
    for (const path of ['/api/workspace','/data/relay.db','/server/store.js','/frontend/app/page.tsx','/.env','/.relay-csp.json']) {
      const response = await fetch(previewBase + path);
      verify(response.status === 404, `public preview refuses ${path}`);
      verify((await response.text()).includes('Page not found'), `public preview returns its actual 404 page for ${path}`);
    }
    const response = await fetch(previewBase);
    const policy = response.headers.get('content-security-policy');
    verify(policy?.includes("script-src 'self';") && !policy.includes('unsafe-inline') && !policy.includes('unsafe-eval'), 'static frontend permits self-hosted modules, not arbitrary inline scripts');
    verify(response.headers.get('x-content-type-options') === 'nosniff', 'static frontend prevents MIME sniffing');
  } finally { await new Promise(resolve => staticServer.close(resolve)); }
  verify(errors.length === 0,`browser errors: ${errors.join(' | ') || 'none'}`);
  console.log(`PASS: ${checks} real-browser checks.`);
} finally {
  await browser.close();
  service.stop();
  await new Promise(resolve => server.close(resolve));
  store.close();
}
