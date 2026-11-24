import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { sampleCsv } from '../shared/invoices.js';

async function fixture(t) {
  const store = openStore();
  const { app, service } = createApp({store});
  const server = await new Promise(resolve => { const server = app.listen(0,'127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { service.stop(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const initial = await fetch(`${base}/api/bootstrap`);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const { csrf } = await initial.json();
  async function request(path, {method = 'GET', body, headers = {}} = {}) {
    const response = await fetch(base + path, {method, headers:{ Cookie:cookie,
      ...(body !== undefined ? {'Content-Type':'application/json', Origin:base, 'X-Relay-CSRF':csrf} : {}),
      ...headers }, body:body === undefined ? undefined : JSON.stringify(body)});
    return { status:response.status, headers:response.headers,
      body:response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
  }
  return { base, request, store, service, cookie, csrf };
}

test('local page and bootstrap have security headers and a private session', async t => {
  const { request, cookie } = await fixture(t);
  const page = await request('/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(cookie,/relay_local=/);
  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.body.mode,'local');
  assert.equal(bootstrap.body.runs.length,0);
});
test('anonymous workspace reads are refused', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/api/workspace');
  assert.equal(response.status,401);
});
test('mutations require origin, CSRF, and JSON', async t => {
  const { request } = await fixture(t);
  const body = {name:'Invoice.csv',content:sampleCsv()};
  assert.equal((await request('/api/imports',{method:'POST',body,headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await request('/api/imports',{method:'POST',body,headers:{'X-Relay-CSRF':'wrong'}})).status,403);
  assert.equal((await request('/api/imports',{method:'POST',body,headers:{'Content-Type':'text/plain'}})).status,415);
});
test('DNS rebinding hostnames are refused', async t => {
  const { base } = await fixture(t);
  // Node fetch rewrites Host from the URL. Send the actual hostile header on the wire.
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(base + '/api/bootstrap', {headers:{Host:'attacker.example'}}, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error',reject);
    request.end();
  });
  assert.equal(status,403);
});
test('cross-site fetch metadata blocks workspace reads', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/workspace',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
});
test('invalid arrays, registers, and absent routes return useful errors', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/imports',{method:'POST',body:[]})).status,400);
  assert.equal((await request('/api/imports',{method:'POST',body:{name:'x',content:'invalid'}})).body.code,'BAD_CSV');
  assert.equal((await request('/api/does-not-exist')).status,404);
});
test('real HTTP import, grant, run, approval, export, and revocation loop', async t => {
  const { request } = await fixture(t);
  const input = await request('/api/imports',{method:'POST',body:{name:'Invoices.csv',content:sampleCsv()}});
  assert.equal(input.status,201);
  const grant = await request('/api/grants',{method:'POST',body:{inputIds:[input.body.id],tools:['read_invoices','draft_reminders','export_drafts']}});
  assert.equal(grant.status,201);
  assert.equal((await request('/api/runs',{method:'POST',body:{grantId:grant.body.id}})).status,201);
  const workspace = await request('/api/workspace');
  const draft = workspace.body.drafts[0];
  const selection = {grantId:grant.body.id,draftIds:[draft.id]};
  assert.equal((await request('/api/exports',{method:'POST',body:selection})).status,403);
  assert.equal((await request(`/api/drafts/${draft.id}`,{method:'PATCH',body:{state:'approved'}})).status,200);
  const exported = await request('/api/exports',{method:'POST',body:selection});
  assert.equal(exported.status,201);
  const download = await request(exported.body.url);
  assert.match(download.body,/Invoice INV-101/);
  assert.match(download.headers.get('content-disposition'),/^attachment;/);
  await request(`/api/grants/${grant.body.id}/revoke`,{method:'POST',body:{}});
  assert.equal((await request(exported.body.url)).status,403);
});
test('database content cannot be fetched as a public file', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/data/relay.db')).status,404);
  assert.equal((await request('/server/store.js')).status,404);
});
