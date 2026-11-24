import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createService } from '../server/service.js';
import { createModel } from '../server/model.js';
import { checkGrant, permittedInput } from '../server/grants.js';
import { sampleCsv } from '../shared/invoices.js';

function fixture(t) {
  const store = openStore();
  t.after(() => store.close());
  const service = createService(store, createModel());
  const input = service.importCsv({ name:'Invoices.csv', content:sampleCsv() });
  const grant = service.grant({ inputIds:[input.id], tools:['read_invoices','draft_reminders','export_drafts'] });
  return { store, service, input, grant };
}
const code = expected => error => error.code === expected;

test('grant captures immutable hashes and rejects unsupported tools', t => {
  const { service, input, grant } = fixture(t);
  assert.equal(grant.inputs[0].digest, input.digest);
  assert.throws(() => service.grant({ inputIds:[input.id], tools:['read_invoices','send_email'] }), code('BAD_TOOLS'));
});
test('grant limits cannot be widened beyond the reviewed manifest', t => {
  const { service, input } = fixture(t);
  const base = {inputIds:[input.id],tools:['read_invoices']};
  for (const change of [{days:8},{maxRuns:51},{maxDrafts:6},{days:0},{maxRuns:-1},{maxDrafts:0}]) {
    assert.throws(() => service.grant({...base,...change}));
  }
});
test('a read-only grant cannot generate drafts', async t => {
  const { service, input } = fixture(t);
  const grant = service.grant({ inputIds:[input.id], tools:['read_invoices'] });
  await assert.rejects(service.run({grantId:grant.id}), code('TOOL_DENIED'));
  assert.equal(service.snapshot().drafts.length, 0);
});
test('out-of-scope imports cannot be read', t => {
  const { store, service, grant } = fixture(t);
  const other = service.importCsv({ name:'Other.csv', content:sampleCsv() });
  assert.throws(() => permittedInput(store, grant.id, other.id), code('INPUT_DENIED'));
});
test('expiry is evaluated from the clock without a sweep', t => {
  const { store, grant } = fixture(t);
  assert.throws(() => checkGrant(store, grant.id, 'read_invoices', grant.expires_at), code('GRANT_EXPIRED'));
});
test('revocation blocks the next run and records the refusal', async t => {
  const { service, grant } = fixture(t);
  service.revoke(grant.id);
  await assert.rejects(service.run({grantId:grant.id}), code('GRANT_REVOKED'));
  assert.equal(service.snapshot().events[0].detail.code, 'GRANT_REVOKED');
});
test('changed content is refused even if its stored digest is unchanged', async t => {
  const { store, service, grant, input } = fixture(t);
  store.db.prepare('UPDATE imports SET content=? WHERE id=?').run(sampleCsv('2026-10-01'), input.id);
  await assert.rejects(service.run({grantId:grant.id}), code('INPUT_CHANGED'));
});
test('template runs make deterministic drafts with source rows', async t => {
  const { service, grant } = fixture(t);
  await service.run({grantId:grant.id});
  const snapshot = service.snapshot();
  assert.equal(snapshot.runs[0].mode, 'template');
  assert.equal(snapshot.runs[0].state, 'completed');
  assert.equal(snapshot.drafts.length, 2);
  assert.equal(snapshot.drafts[0].source_row, 2);
});
test('run and draft limits are enforced', async t => {
  const { service, input } = fixture(t);
  const grant = service.grant({inputIds:[input.id], tools:['read_invoices','draft_reminders'], maxRuns:1, maxDrafts:1});
  await service.run({grantId:grant.id});
  assert.equal(service.snapshot().drafts.length, 1);
  assert.equal(service.snapshot().runs[0].report.omittedDrafts, 1);
  await assert.rejects(service.run({grantId:grant.id}), code('RUN_LIMIT'));
});
test('exports require approval, then contain only selected drafts', async t => {
  const { service, grant } = fixture(t);
  await service.run({grantId:grant.id});
  const draft = service.snapshot().drafts[0];
  assert.throws(() => service.exportDrafts({grantId:grant.id,draftIds:[draft.id]}), code('APPROVAL_REQUIRED'));
  service.review(draft.id, 'approved');
  const exported = service.exportDrafts({grantId:grant.id,draftIds:[draft.id]});
  const content = service.download(exported.id).content;
  assert.match(content, /INV-101/);
  assert.doesNotMatch(content, /INV-102/);
});
test('changed approved text is refused', async t => {
  const { store, service, grant } = fixture(t);
  await service.run({grantId:grant.id});
  const draft = service.snapshot().drafts[0];
  service.review(draft.id, 'approved');
  store.db.prepare('UPDATE drafts SET body=? WHERE id=?').run('Replaced text', draft.id);
  assert.throws(() => service.exportDrafts({grantId:grant.id,draftIds:[draft.id]}), code('APPROVAL_REQUIRED'));
});
test('one grant cannot export another grant\'s drafts', async t => {
  const { service, input, grant } = fixture(t);
  await service.run({grantId:grant.id});
  const draft = service.snapshot().drafts[0];
  service.review(draft.id, 'approved');
  const other = service.grant({inputIds:[input.id],tools:['read_invoices','export_drafts']});
  assert.throws(() => service.exportDrafts({grantId:other.id,draftIds:[draft.id]}), code('DRAFT_DENIED'));
});
test('revocation also blocks a previously created export download', async t => {
  const { service, grant } = fixture(t);
  await service.run({grantId:grant.id});
  const draft = service.snapshot().drafts[0];
  service.review(draft.id, 'approved');
  const exported = service.exportDrafts({grantId:grant.id,draftIds:[draft.id]});
  service.revoke(grant.id);
  assert.throws(() => service.download(exported.id), code('GRANT_REVOKED'));
});
test('missing model never falls back to templates', async t => {
  const { service, grant } = fixture(t);
  await assert.rejects(service.run({grantId:grant.id,mode:'local-model'}), code('MODEL_UNAVAILABLE'));
  assert.equal(service.snapshot().drafts.length, 0);
  assert.equal(service.snapshot().runs[0].state, 'failed');
});
test('overlapping registers are refused without creating drafts', async t => {
  const { service, input } = fixture(t);
  const other = service.importCsv({name:'Copy.csv',content:sampleCsv()});
  const grant = service.grant({inputIds:[input.id,other.id], tools:['read_invoices','draft_reminders']});
  await assert.rejects(service.run({grantId:grant.id}), code('DUPLICATE_INVOICE'));
  assert.equal(service.snapshot().drafts.length, 0);
});
test('restart preserves data and marks in-flight work interrupted without replay', t => {
  const dir = mkdtempSync(join(tmpdir(),'relay-test-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  let store = openStore(join(dir,'workspace.db'));
  let service = createService(store, createModel());
  const input = service.importCsv({name:'Saved.csv',content:sampleCsv()});
  const grant = service.grant({inputIds:[input.id],tools:['read_invoices']});
  store.db.prepare("INSERT INTO runs(id,grant_id,mode,state,started_at) VALUES('interrupted',?,'template','running',?)").run(grant.id,Date.now());
  store.close();
  store = openStore(join(dir,'workspace.db'));
  service = createService(store, createModel());
  assert.equal(service.snapshot().imports.length,1);
  assert.equal(service.snapshot().runs[0].state,'interrupted');
  assert.equal(service.snapshot().drafts.length,0);
  store.close();
});
