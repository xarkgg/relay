import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseAmount, formatAmount, dateDay, followUps, sampleCsv, CSV_HEADER } from '../shared/invoices.js';

const register = row => `${CSV_HEADER.join(',')}\n${row}\n`;
test('Pi arithmetic preserves all seven decimal places', () => {
  assert.equal(parseAmount('12.0000001'), '120000001');
  assert.equal(formatAmount('120000001'), '12.0000001');
  assert.equal(formatAmount('125000000'), '12.5');
});
test('invalid and imprecise amounts are rejected', () => {
  for (const amount of ['0','-1','1e5','NaN','1.00000001','01','9999999999']) assert.throws(() => parseAmount(amount));
});
test('real calendar dates are validated, including leap days', () => {
  assert.equal(dateDay('2024-02-29') + 1, dateDay('2024-03-01'));
  for (const date of ['2026-02-29','2026-04-31','2026-13-01','11/24/2026']) assert.throws(() => dateDay(date));
});
test('quoted commas, escaped quotes, BOM, and CRLF parse correctly', () => {
  const text = '\uFEFF' + register('A,"Studio, ""North""",12.5,2026-11-20,unpaid').replaceAll('\n','\r\n');
  assert.equal(parseCsv(text)[0].customer, 'Studio, "North"');
});
test('malformed quotes and field counts are rejected', () => {
  for (const row of ['A,"North,1,2026-11-20,unpaid','A,"North"x,1,2026-11-20,unpaid','A,No"rth,1,2026-11-20,unpaid','A,North,1']) {
    assert.throws(() => parseCsv(register(row)));
  }
});
test('headers and unique invoice IDs are required', () => {
  assert.throws(() => parseCsv('id,customer,amount,date,status\nA,N,1,2026-11-20,unpaid'));
  assert.throws(() => parseCsv(register('A,N,1,2026-11-20,unpaid\nA,N,2,2026-11-20,unpaid')));
});
test('unknown statuses and control characters are rejected', () => {
  assert.throws(() => parseCsv(register('A,N,1,2026-11-20,confirmed')));
  assert.throws(() => parseCsv(register('A,"N\nX",1,2026-11-20,unpaid')));
});
test('UTF-8 byte and row limits are enforced', () => {
  assert.throws(() => parseCsv('あ'.repeat(90_000)));
  const rows = Array.from({length:501}, (_, i) => `A${i},N,1,2026-11-20,unpaid`).join('\n');
  assert.throws(() => parseCsv(register(rows)));
});
test('due calculations exclude paid, void, and future records', () => {
  const records = parseCsv(sampleCsv('2026-11-24'));
  const report = followUps(records, '2026-11-24');
  assert.deepEqual(report.due.map(row => row.id), ['INV-101','INV-102']);
  assert.equal(report.totalStroops, '205000000');
  assert.equal(report.paidCount, 1);
  assert.equal(report.futureCount, 1);
  assert.equal(report.due[0].overdueDays, 7);
});
