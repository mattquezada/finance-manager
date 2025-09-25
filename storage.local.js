// LocalStorage-only adapter (supports `savings`)
function load(key, fb) { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let txns    = load('transactions', []);
let budgets = load('budgets', {});

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function rowsToCsv(head, rows) {
  const esc = s => {
    s = String(s ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\n');
}

export const storage = {
  async listTxns({ month }) {
    let res = [...txns];
    if (month) res = res.filter(t => t.date.startsWith(month));
    return res.sort((a, b) => a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date.localeCompare(b.date));
  },

  async upsertTxn(t) {
    if (t.id) {
      txns = txns.map(x => x.id === t.id ? t : x);
    } else {
      t.id = uid();
      txns.push(t);
    }
    save('transactions', txns);
    return t;
  },

  async deleteTxn(id) {
    txns = txns.filter(t => t.id !== id);
    save('transactions', txns);
  },

  async exportCSV() {
    const head = ['id', 'date', 'note', 'type', 'category', 'amount', 'savings'];
    return rowsToCsv(head, txns);
  },

  async importCSV(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(Boolean);
    if (!lines.length) return;

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

    const parse = (line) => {
      const o = []; let i = 0, cur = '', q = false;
      while (i < line.length) {
        const ch = line[i];
        if (q) {
          if (ch == '"') { if (line[i + 1] == '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; }
          cur += ch; i++; continue;
        } else {
          if (ch == '"') { q = true; i++; continue; }
          if (ch == ',') { o.push(cur); cur = ''; i++; continue; }
          cur += ch; i++; continue;
        }
      }
      o.push(cur); return o;
    };

    const rows = lines.slice(1).map(parse);
    rows.forEach(cols => {
      const get = (name) => cols[idx[name]] ?? '';
      const txn = {
        id: get('id') || uid(),
        date: String(get('date') || '').slice(0, 10),
        note: String(get('note') || '').trim(),
        type: get('type') === 'income' ? 'income' : 'expense',
        category: String(get('category') || '').trim() || 'General',
        amount: Number(get('amount') || 0),
        savings: Number(get('savings') || 0)
      };
      const i = txns.findIndex(x => x.id === txn.id);
      if (i >= 0) txns[i] = txn; else txns.push(txn);
    });
    save('transactions', txns);
  },

  async getBudget(month) { return Number(budgets[month] || 0); },
  async setBudget(month, amount) { budgets[month] = Math.max(0, Number(amount) || 0); save('budgets', budgets); return budgets[month]; },

  get theme() { return localStorage.getItem('theme') || 'light'; },
  set theme(v)  { localStorage.setItem('theme', v); }
};
