import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { createCommerceApp } from '../server/commerce/app.js';
import { commerceConfig } from '../server/commerce/config.js';

let puppeteer;
try { puppeteer = (await import(process.env.RELAY_PUPPETEER_PATH || 'puppeteer')).default; }
catch {
  const root = execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  puppeteer = (await import(pathToFileURL(`${root}/puppeteer/lib/puppeteer/puppeteer.js`).href)).default;
}
const browser = await puppeteer.launch({headless:true, pipe:true, timeout:30_000, protocolTimeout:30_000,
  executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium-browser',
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
await mkdir('probe-shots',{recursive:true});
const store = openStore();
let activationRecord={configured:true,active:false};
const activation={configured:true,status:()=>activationRecord,sync:async()=>activationRecord,
  async claim(code,name){assert.equal(code,'ABCD-EFGH-JKLM-NPQR');assert.equal(name,'Probe phone');
    activationRecord={configured:true,active:true,expiresAt:Date.now()+86_400_000,deviceId:'probe-device',agent:'follow-up-desk',offline:false};return activationRecord;},
  require(){if(!activationRecord.active)throw new Error('not active');}};
const { app, service } = createApp({store,activation});
const server = await new Promise(resolve => { const server = app.listen(0,'127.0.0.1',() => resolve(server)); });
const base = `http://127.0.0.1:${server.address().port}`;
let checks = 0;
function verify(value,message) { assert.ok(value,message); checks++; console.log(`ok ${checks} - ${message}`); }
const errors = [];

try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({width:390,height:844});
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base,{waitUntil:'networkidle0'});
  verify(await page.$eval('#events',node => node.textContent.includes('No activity')),'opening the workspace does not run an agent');
  await page.click('#preview-open');
  await page.waitForSelector('#preview-dialog[open]');
  verify(await page.$eval('#preview-results',node => node.textContent.includes('20.5 Pi')),'sample preview calculates exact Pi totals');
  await page.click('#preview-dialog [data-close]');
  await page.click('#import-sample');
  await page.waitForSelector('.input-item');
  verify(service.snapshot().imports.length === 1,'sample import reaches the real local database');
  await page.click('#grant-open');
  await page.waitForSelector('#grant-dialog[open]');
  verify(await page.$eval('.permission-warning',node => node.textContent.includes('No payments')),'permission card discloses prohibited actions');
  await page.click('#grant-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('.grant .state')?.textContent === 'active');
  await page.click('#run');
  await page.waitForSelector('.draft');
  verify(service.snapshot().runs[0].state === 'completed','real grant and run complete');
  verify(service.snapshot().drafts.length === 2,'only due unpaid invoices receive drafts');
  verify(await page.$eval('#drafts',node => node.textContent.includes('Template · no AI call')),'template provenance is explicit');
  verify(await page.$eval('#model-choice',node => node.disabled),'missing local model is not faked');
  verify(await page.$('#workspace [data-action=export]') === null,'unapproved drafts have no export action');
  await page.click('[data-action=approve]');
  await page.waitForSelector('[data-action=export]');
  verify(service.snapshot().drafts.filter(draft => draft.state === 'approved').length === 1,'approval is persisted');
  await page.click('[data-action=export]');
  await page.waitForFunction(() => document.querySelector('#events').textContent.includes('Approved drafts exported'));
  const exported = store.db.prepare('SELECT * FROM exports').get();
  verify(exported.content.includes('INV-101') && !exported.content.includes('INV-102'),'export contains only the approved draft');
  const runsBefore = service.snapshot().runs.length;
  await page.reload({waitUntil:'networkidle0'});
  verify(service.snapshot().runs.length === runsBefore,'reload does not replay a stored run');
  await page.click('[data-action=revoke]');
  await page.waitForFunction(() => document.querySelector('.grant .state')?.textContent === 'revoked');
  verify(await page.$eval('#run',node => node.disabled),'revocation disables future runs');
  verify(await page.$('[data-action=export]') === null,'revocation removes the export action');
  await page.type('#activation-code','ABCD-EFGH-JKLM-NPQR');
  await page.$eval('#device-name',node=>{node.value='Probe phone';});
  await page.click('#activation-form button[type=submit]');
  try {
    await page.waitForFunction(()=>document.querySelector('#activation-state').textContent==='Active',{timeout:8000});
  } catch (error) {
    console.error('activation state:',await page.$eval('#activation-state',node=>node.textContent),
      '| error:',await page.$eval('#error',node=>node.textContent),
      '| copy:',await page.$eval('#activation-copy',node=>node.textContent));
    throw error;
  }
  verify(activationRecord.active,'local activation form updates the workspace');
  verify(await page.$eval('#activation-copy',node=>node.textContent.includes('Local AI is unlocked')),'active device explains the unlocked boundary');
  for (const width of [320,390,1280]) {
    await page.setViewport({width,height:width < 600 ? 844 : 1000});
    await page.screenshot({path:`probe-shots/local-${width}.png`,fullPage:true});
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`local workspace has no horizontal overflow at ${width}px`);
    await page.click('#grant-open');
    await page.waitForSelector('#grant-dialog[open]');
    verify(await page.$eval('#grant-dialog',node => node.scrollWidth <= node.clientWidth),`permission dialog fits at ${width}px`);
    await page.click('#grant-dialog [data-close]');
  }
  await page.goto(base + '/privacy.html',{waitUntil:'networkidle0'});
  verify(await page.$eval('main',node => node.textContent.includes('not encrypted')),'privacy page states the real local-storage limitation');
  await context.close();

  const staticApp = express();
  const config=commerceConfig({});
  staticApp.use('/api/commerce',createCommerceApp({config}));
  staticApp.use(express.static('dist'));
  const staticServer = await new Promise(resolve => { const server = staticApp.listen(0,'127.0.0.1',() => resolve(server)); });
  config.origins.add(`http://127.0.0.1:${staticServer.address().port}`);
  try {
    const previewBase = process.env.RELAY_PREVIEW_URL || `http://127.0.0.1:${staticServer.address().port}`;
    if (process.env.RELAY_PREVIEW_URL) assert.equal(new URL(previewBase).protocol,'https:');
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const requests = [];
    page.on('request',request => requests.push(request.url()));
    page.on('pageerror',error => errors.push(error.message));
    for (const width of [390,1280]) {
      await page.setViewport({width,height:900});
      await page.goto(previewBase,{waitUntil:'networkidle0'});
      verify(await page.$eval('#workspace',node => node.hidden),'storefront build does not expose local controls');
      await page.click('#preview-open');
      await page.waitForSelector('#preview-dialog[open]');
      verify(await page.$eval('#preview-results',node => node.textContent.includes('20.5 Pi')),'storefront sample preview works without a workspace runtime');
      await page.click('#preview-dialog [data-close]');
      verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`storefront has no overflow at ${width}px`);
      await page.screenshot({path:`probe-shots/catalogue-${width}.png`,fullPage:true});
    }
    verify(!requests.some(url => new URL(url).pathname.startsWith('/api/') && !new URL(url).pathname.startsWith('/api/commerce/')),'public preview makes no workspace API requests');
    for (const path of ['/api/workspace','/data/relay.db','/server/store.js','/.env']) {
      const response = await fetch(previewBase + path);
      verify(response.status === 404,`public preview refuses ${path}`);
    }
    if (process.env.RELAY_PREVIEW_URL) {
      const response = await fetch(previewBase);
      verify(response.headers.get('content-security-policy')?.includes("script-src 'self'"),'live preview enforces its content security policy');
      verify(response.headers.get('x-content-type-options') === 'nosniff','live preview prevents MIME sniffing');
    }
    await context.close();
  } finally { await new Promise(resolve => staticServer.close(resolve)); }
  verify(errors.length === 0,`browser errors: ${errors.join(' | ') || 'none'}`);
  verify((await readFile('dist/index.html','utf8')).includes('data-mode="storefront"'),'Vercel output explicitly excludes the workspace');
  console.log(`PASS: ${checks} real-browser checks.`);
} finally {
  await browser.close();
  service.stop();
  await new Promise(resolve => server.close(resolve));
  store.close();
}
