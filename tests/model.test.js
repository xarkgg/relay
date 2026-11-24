import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createModel, localEndpoint, parseDraftResponse } from '../server/model.js';
import { createService } from '../server/service.js';
import { openStore } from '../server/store.js';
import { sampleCsv } from '../shared/invoices.js';

// These are wire-protocol fixtures, not simulated proof of local model inference.
async function provider(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/v1`;
}
function workspace(t, model) {
  const store = openStore();
  t.after(() => store.close());
  const service = createService(store,model);
  const input = service.importCsv({name:'Invoice.csv',content:sampleCsv()});
  const grant = service.grant({inputIds:[input.id],tools:['read_invoices','draft_reminders']});
  return { store, service, grant };
}
test('cloud URLs, credentials, and alternate protocols are refused', () => {
  for (const url of ['https://api.example/v1','http://example.org/v1','http://user:secret@localhost/v1','file:///tmp/model','http://localhost/v1?key=x']) {
    assert.throws(() => localEndpoint(url));
  }
  assert.equal(localEndpoint('http://127.0.0.1:12434/engines/v1/'),'http://127.0.0.1:12434/engines/v1');
});
test('partial configuration is refused', () => {
  assert.throws(() => createModel({name:'local'}));
  assert.throws(() => createModel({url:'http://localhost/v1'}));
});
test('unconfigured model health is explicit and makes no request', async () => {
  assert.deepEqual(await createModel().health(), {configured:false,available:false,name:null});
});
test('oversized HTTP model responses are refused without saving drafts', async t => {
  const url = await provider(t, (req,res) => {
    req.resume();
    req.on('end', () => { res.setHeader('Content-Type','application/json'); res.end('x'.repeat(70_000)); });
  });
  const { service, grant } = workspace(t,createModel({url,name:'fixture-model'}));
  await assert.rejects(service.run({grantId:grant.id,mode:'local-model'}), error => error.code === 'MODEL_OUTPUT_INVALID');
  assert.equal(service.snapshot().drafts.length,0);
});
test('malformed, duplicate, and unrelated invoice output is rejected', () => {
  const invoices = [{id:'A'}];
  for (const value of ['not JSON','{"drafts":[]}','{"drafts":[{"invoice_id":"B","text":"A valid long message"}]}']) {
    assert.throws(() => parseDraftResponse(value,invoices));
  }
  assert.throws(() => parseDraftResponse('{"drafts":[{"invoice_id":"A","text":"First long text"},{"invoice_id":"A","text":"Second long text"}]}',[{id:'A'},{id:'B'}]));
});
test('real HTTP adapter checks model IDs and sends only selected invoice fields', async t => {
  let captured;
  const url = await provider(t, async (req,res) => {
    res.setHeader('Content-Type','application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({data:[{id:'fixture-model'}]}));
    let body = '';
    for await (const chunk of req) body += chunk;
    captured = JSON.parse(body);
    const invoices = JSON.parse(captured.messages[1].content);
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({drafts:invoices.map(invoice => ({invoice_id:invoice.invoice_id,text:`A polite draft for invoice ${invoice.invoice_id}.`}))})}}]}));
  });
  const model = createModel({url,name:'fixture-model'});
  assert.equal((await model.health()).available,true);
  const { service, grant } = workspace(t,model);
  await service.run({grantId:grant.id,mode:'local-model'});
  assert.equal(service.snapshot().drafts.length,2);
  assert.equal(JSON.parse(captured.messages[1].content).length,2);
  assert.equal(captured.tools,undefined);
  assert.doesNotMatch(JSON.stringify(captured),/INV-103|INV-104/);
});
test('revocation during inference discards output and wins over concurrent runs', async t => {
  let signalReady;
  const ready = new Promise(resolve => { signalReady = resolve; });
  const url = await provider(t, (req,res) => {
    req.resume();
    req.on('end', () => { signalReady(); res.on('close', () => res.destroy()); });
  });
  const { service, grant } = workspace(t,createModel({url,name:'fixture-model'}));
  const first = service.run({grantId:grant.id,mode:'local-model'});
  const rejected = assert.rejects(first,error => error.code === 'GRANT_REVOKED');
  await ready;
  await assert.rejects(service.run({grantId:grant.id}),error => error.code === 'RUN_BUSY');
  service.revoke(grant.id);
  await rejected;
  assert.equal(service.snapshot().drafts.length,0);
  assert.equal(service.snapshot().runs[0].state,'blocked');
});
