export const todayISO = () => new Date().toISOString().slice(0, 10);

export function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const fmt = (n) => Number(n || 0).toFixed(2);

export function parseMoney(input) {
  if (typeof input !== 'string') input = String(input ?? '');
  const sanitized = input.trim().replace(/[^0-9,.\-]/g, '');
  let s = sanitized;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const sanitizeText = (s, max = 120) =>
  String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function assertTxnShape(txn) {
  if (!txn) return { ok: false, msg: 'Missing transaction' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txn.date || '')) return { ok: false, msg: 'Invalid date' };
  if (txn.type !== 'income' && txn.type !== 'expense') return { ok: false, msg: 'Invalid type' };
  if (!Number.isFinite(txn.amount)) return { ok: false, msg: 'Invalid amount' };
  if (txn.type === 'income' && !Number.isFinite(txn.savings)) return { ok: false, msg: 'Invalid savings' };
  if (!txn.category) return { ok: false, msg: 'Category required' };
  if (!txn.note) return { ok: false, msg: 'Note required' };
  return { ok: true };
}

export function niceCeil(n) {
  if (n <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const d = n / p;
  for (const b of [1, 2, 5, 10]) if (d <= b) return b * p;
  return 10 * p;
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
