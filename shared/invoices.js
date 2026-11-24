export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_INVOICES = 500;
export const CSV_HEADER = ['invoice_id', 'customer', 'amount_pi', 'due_date', 'status'];

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

export function parseAmount(value) {
  requireValue(typeof value === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,7})?$/.test(value),
    'Pi amounts must be positive decimals with at most seven decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
  requireValue(amount > 0n, 'Invoice amounts must be greater than zero.');
  return amount.toString();
}

export function formatAmount(stroops) {
  const value = BigInt(stroops);
  const fraction = (value % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${value / 10_000_000n}${fraction ? `.${fraction}` : ''}`;
}

export function dateDay(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Dates must use YYYY-MM-DD.');
  const time = Date.parse(`${value}T00:00:00.000Z`);
  requireValue(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value,
    `Invalid date: ${value}.`);
  return time / 86_400_000;
}

export function parseCsv(text) {
  requireValue(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_IMPORT_BYTES,
    'Choose a CSV smaller than 256 KB.');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => {
    finishCell();
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    requireValue(rows.length <= MAX_INVOICES + 1, 'A register can contain at most 500 invoices.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"') {
      requireValue(cell === '' && !closed, 'A CSV quote must start a field.');
      quoted = true;
    } else {
      requireValue(!closed, 'Unexpected text after a quoted CSV field.');
      cell += char;
    }
    requireValue(cell.length <= 2048, 'A CSV field is too long.');
  }
  requireValue(!quoted, 'A quoted CSV field was not closed.');
  if (cell || row.length || closed) finishRow();
  requireValue(rows.length > 1, 'Add at least one invoice below the header.');
  const header = rows.shift().map(value => value.trim());
  requireValue(header.length === CSV_HEADER.length && CSV_HEADER.every((key, i) => key === header[i]),
    `Use this CSV header: ${CSV_HEADER.join(',')}`);
  const seen = new Set();
  return rows.map((values, index) => {
    requireValue(values.length === header.length, `Row ${index + 2} has the wrong number of fields.`);
    const [id, customer, amount, dueDate, status] = values.map(value => value.trim());
    requireValue(/^[\p{L}\p{N}_.-]{1,64}$/u.test(id), `Row ${index + 2} needs a valid invoice ID.`);
    requireValue(!seen.has(id), `Invoice ${id} appears more than once.`);
    seen.add(id);
    requireValue(customer.length > 0 && customer.length <= 160 && !/[\x00-\x1f\x7f]/.test(customer),
      `Invoice ${id} needs a customer label of at most 160 characters.`);
    requireValue(['unpaid', 'paid', 'void'].includes(status), `Invoice ${id} has an unknown status.`);
    dateDay(dueDate);
    return { id, customer, amountStroops: parseAmount(amount), dueDate, status, sourceRow: index + 2 };
  });
}

export function followUps(invoices, today) {
  const day = dateDay(today);
  const due = invoices.filter(invoice => invoice.status === 'unpaid' && dateDay(invoice.dueDate) <= day)
    .map(invoice => ({ ...invoice, overdueDays: day - dateDay(invoice.dueDate) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.id.localeCompare(b.id));
  return {
    today, due,
    totalStroops: due.reduce((sum, invoice) => sum + BigInt(invoice.amountStroops), 0n).toString(),
    paidCount: invoices.filter(invoice => invoice.status === 'paid').length,
    futureCount: invoices.filter(invoice => invoice.status === 'unpaid' && dateDay(invoice.dueDate) > day).length
  };
}

export function sampleCsv(today = new Date().toISOString().slice(0, 10)) {
  const day = dateDay(today);
  const date = offset => new Date((day + offset) * 86_400_000).toISOString().slice(0, 10);
  return `${CSV_HEADER.join(',')}\nINV-101,Studio North,12.5,${date(-7)},unpaid\nINV-102,Amara,8,${date(0)},unpaid\nINV-103,Blue Room,25,${date(-2)},paid\nINV-104,Weekend Works,6.75,${date(5)},unpaid\n`;
}
