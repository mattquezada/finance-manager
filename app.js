import {
  todayISO, currentMonthStr, parseMoney, fmt,
  sanitizeText, assertTxnShape, niceCeil, escapeHTML
} from './utils.js';
import { storage } from './storage.local.js';

window.render = render; // for parity with earlier versions
let editId = null;

/* ------------ Elements ------------ */
const form          = document.getElementById('txn-form');
const dateEl        = document.getElementById('date');
const noteEl        = document.getElementById('note');
const amountEl      = document.getElementById('amount');
const typeEl        = document.getElementById('type');
const categoryEl    = document.getElementById('category');
const savingsEl     = document.getElementById('savings');
const savingsLabel  = document.getElementById('savingsLabel');

const submitBtn     = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formError     = document.getElementById('formError');
const formTitle     = document.getElementById('formTitle');

const tbody         = document.getElementById('txn-tbody');
const incomeEl      = document.getElementById('income');
const expensesEl    = document.getElementById('expenses');
const savingsTotalEl= document.getElementById('savingsTotal');
const balanceEl     = document.getElementById('balance');
const catSummaryEl  = document.getElementById('category-summary');

const monthFilter   = document.getElementById('monthFilter');
const budgetInput   = document.getElementById('budgetInput');
const saveBudgetBtn = document.getElementById('saveBudgetBtn');
const progressBar   = document.getElementById('progressBar');
const progressText  = document.getElementById('progressText');

const exportBtn     = document.getElementById('exportBtn');
const importBtn     = document.getElementById('importBtn');
const fileInput     = document.getElementById('fileInput');

const darkToggle    = document.getElementById('darkToggle');
const svg           = document.getElementById('trendChart');

/* ------------ Behaviors ------------ */

// Toggle savings field based on type
typeEl.addEventListener('change', () => {
  if (typeEl.value === 'income') {
    savingsLabel.hidden = false;
  } else {
    savingsLabel.hidden = true;
    savingsEl.value = '';
  }
});

// Form submit (Add / Update)
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const txn = {
    id: editId ?? undefined,
    date: dateEl.value,
    note: sanitizeText(noteEl.value, 80),
    amount: parseMoney(String(amountEl.value)),
    type: typeEl.value,
    category: sanitizeText(categoryEl.value, 40),
    savings: typeEl.value === 'income' ? parseMoney(String(savingsEl.value || 0)) : 0
  };

  const check = assertTxnShape(txn);
  if (!check.ok) {
    formError.textContent = check.msg;
    formError.hidden = false;
    return;
  }

  await storage.upsertTxn(txn);
  resetForm();
  render();
});

// Cancel edit
cancelEditBtn.addEventListener('click', () => resetForm());

// Month change re-renders
monthFilter.addEventListener('change', render);

// Save budget
saveBudgetBtn.addEventListener('click', async () => {
  const m = monthFilter.value || currentMonthStr();
  const val = parseMoney(String(budgetInput.value || '0'));
  await storage.setBudget(m, Number.isFinite(val) ? Math.max(0, val) : 0);
  render();
});

// CSV import/export
exportBtn.addEventListener('click', async () => {
  const csv = await storage.exportCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'transactions.csv' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const text = await f.text();
  await storage.importCSV(text);
  fileInput.value = '';
  render();
});

// Theme
function applyTheme(t) {
  if (t === 'dark') { document.documentElement.classList.add('dark'); darkToggle.checked = true; }
  else { document.documentElement.classList.remove('dark'); darkToggle.checked = false; }
}
function setTheme(t) { storage.theme = t; applyTheme(t); }
darkToggle.addEventListener('change', () => setTheme(darkToggle.checked ? 'dark' : 'light'));

/* ------------ Rendering ------------ */

async function render() {
  try {
    if (!monthFilter.value) monthFilter.value = currentMonthStr();
    const month = monthFilter.value;

    const txns = await storage.listTxns({ month });

    let income = 0, expenses = 0, savings = 0;
    const cats = {};

    for (const t of txns) {
      const amt = Number(t.amount || 0);
      if (t.type === 'income') {
        income += amt;
        savings += Number(t.savings || 0);
      } else {
        expenses += amt;
        cats[t.category] = (cats[t.category] || 0) + amt;
      }
    }

    incomeEl.textContent = fmt(income);
    expensesEl.textContent = fmt(expenses);
    savingsTotalEl.textContent = fmt(savings);
    balanceEl.textContent = fmt(income - expenses);

    // Budget/progress
    const budget = await storage.getBudget(month);
    budgetInput.value = budget ? budget : '';
    const pct = budget > 0 ? Math.min(100, Math.round((expenses / budget) * 100)) : 0;
    progressBar.style.width = `${pct}%`;
    progressBar.classList.remove('over', 'near');
    if (budget > 0) {
      if (expenses > budget) progressBar.classList.add('over');
      else if (expenses > 0.8 * budget) progressBar.classList.add('near');
      progressText.textContent = `${pct}% of $${fmt(budget)}`;
      document.querySelector('.progress').setAttribute('aria-valuenow', String(pct));
    } else {
      progressText.textContent = 'No budget set';
      document.querySelector('.progress').setAttribute('aria-valuenow', '0');
    }

    // Table
    tbody.innerHTML = '';
    for (const t of txns) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.date}</td>
        <td>${escapeHTML(t.note)}</td>
        <td>${t.type}</td>
        <td>${escapeHTML(t.category)}</td>
        <td class="num">$${fmt(t.amount)}</td>
        <td class="num">$${fmt(t.savings || 0)}</td>
        <td class="rowActions">
          <button type="button" class="ghost" data-edit="${t.id}">Edit</button>
          <button type="button" class="danger" data-del="${t.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startEdit(b.dataset.edit)));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteTxn(b.dataset.del)));

    // Category summary (expenses only)
    catSummaryEl.innerHTML = '';
    Object.keys(cats).sort().forEach(cat => {
      const li = document.createElement('li');
      li.textContent = `${cat}: $${fmt(cats[cat])}`;
      catSummaryEl.appendChild(li);
    });

    renderTrendChart(txns, month);
  } catch (e) {
    console.warn(e);
  }
}

function renderTrendChart(txns, month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const dailyExpense = Array.from({ length: daysInMonth }, () => 0);
  const dailySavings = Array.from({ length: daysInMonth }, () => 0);

  for (const t of txns) {
    const d = Number(String(t.date).slice(-2));
    if (!(d >= 1 && d <= daysInMonth)) continue;
    if (t.type === 'expense') dailyExpense[d - 1] += Number(t.amount || 0);
    if (t.type === 'income')  dailySavings[d - 1] += Number(t.savings || 0);
  }

  const maxVal = Math.max(
    dailyExpense.reduce((mx, v) => Math.max(mx, v), 0),
    dailySavings.reduce((mx, v) => Math.max(mx, v), 0)
  );
  const yMax = niceCeil(maxVal);

  const vbW = 640, vbH = 280;
  const pad = { l: 44, r: 10, t: 18, b: 32 };
  const iw = vbW - pad.l - pad.r;
  const ih = vbH - pad.t - pad.b;

  const x = i => pad.l + (daysInMonth === 1 ? iw / 2 : (i / (daysInMonth - 1)) * iw);
  const yFn = v => pad.t + (yMax === 0 ? ih : ih - (v / yMax) * ih);

  const path = (arr) => arr.reduce((acc, v, i) =>
    acc + (i ? ` L ${x(i)} ${yFn(v)}` : `M ${x(i)} ${yFn(v)}`), '');

  const area = (arr) => {
    if (!arr.length) return '';
    return `M ${x(0)} ${yFn(arr[0])} ${
      arr.map((v, i) => `L ${x(i)} ${yFn(v)}`).join(' ')
    } L ${x(arr.length - 1)} ${yFn(0)} L ${x(0)} ${yFn(0)} Z`;
  };

  const gridYs = [0, .25, .5, .75, 1].map(p => pad.t + ih - p * ih);
  const tickVals = [0, yMax * .25, yMax * .5, yMax * .75, yMax].map(v => Math.round(v));
  const xtIdx = Array.from(new Set([0, 9, 19, daysInMonth - 1].filter(i => i >= 0 && i < daysInMonth)));

  const dExpense = path(dailyExpense);
  const aExpense = area(dailyExpense);
  const dSavings = path(dailySavings);
  const aSavings = area(dailySavings);

  svg.innerHTML = `
    <line class="chart-axis-main" x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}"></line>
    <line class="chart-axis-main" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ih}"></line>

    ${gridYs.map(gy => `<line class="chart-grid" x1="${pad.l}" y1="${gy}" x2="${pad.l + iw}" y2="${gy}"></line>`).join('')}

    ${aExpense ? `<path class="chart-area-expense" d="${aExpense}"></path>` : ''}
    ${dExpense ? `<path class="chart-line-expense" d="${dExpense}"></path>` : ''}

    ${aSavings ? `<path class="chart-area-savings" d="${aSavings}"></path>` : ''}
    ${dSavings ? `<path class="chart-line-savings" d="${dSavings}"></path>` : ''}

    ${dailyExpense.map((v, i) => v > 0 ? `<circle class="chart-line-expense chart-dot" cx="${x(i)}" cy="${yFn(v)}"></circle>` : '').join('')}
    ${dailySavings.map((v, i) => v > 0 ? `<circle class="chart-line-savings chart-dot" cx="${x(i)}" cy="${yFn(v)}"></circle>` : '').join('')}

    ${gridYs.map((gy, i) => `<text class="chart-label" x="${pad.l - 6}" y="${gy - 2}" text-anchor="end">$${fmt(tickVals[i])}</text>`).join('')}

    ${xtIdx.map(i => `
      <line class="chart-axis" x1="${x(i)}" y1="${pad.t + ih}" x2="${x(i)}" y2="${pad.t + ih + 4}"></line>
      <text class="chart-label" x="${x(i)}" y="${pad.t + ih + 14}" text-anchor="middle">${i + 1}</text>
    `).join('')}

    <text class="chart-label" x="${pad.l}" y="${pad.t - 4}">
      ${new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
    </text>
  `;
}

// Helpers: edit/delete/reset
function resetForm() {
  form.reset();
  editId = null;
  submitBtn.textContent = 'Add';
  formTitle.textContent = 'Add Transaction';
  cancelEditBtn.hidden = true;
  formError.hidden = true;
  savingsLabel.hidden = typeEl.value !== 'income';
  if (!dateEl.value) dateEl.value = todayISO();
}

async function startEdit(id) {
  const all = await storage.listTxns({ month: null });
  const t = all.find(x => String(x.id) === String(id));
  if (!t) return;

  editId = id;
  dateEl.value = t.date;
  noteEl.value = t.note;
  amountEl.value = String(t.amount);
  typeEl.value = t.type;
  categoryEl.value = t.category;
  savingsEl.value = String(t.savings || 0);
  savingsLabel.hidden = t.type !== 'income';

  submitBtn.textContent = 'Update';
  formTitle.textContent = 'Edit Transaction';
  cancelEditBtn.hidden = false;
}

async function deleteTxn(id) {
  await storage.deleteTxn(id);
  render();
}

/* ------------ Init ------------ */
(function init() {
  applyTheme(storage.theme || 'light');
  dateEl.value = todayISO();
  savingsLabel.hidden = typeEl.value !== 'income';
  render();
})();
