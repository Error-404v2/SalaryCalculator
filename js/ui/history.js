import { $, toast } from '../utils/dom.js';
import { clone } from '../utils/object.js';
import { escapeHtml } from '../utils/format.js';
import { HISTORY_FIELDS, historyField, groupHistory, monthKey, monthLabel, valueAt } from '../core/history.js';
import * as store from '../state/store.js';

/** Where the current value of each tracked field lives, so "Save current" can snapshot it. */
const CURRENT = {
  salary: (s) => (s.per === 'month' ? s.amount : ''),
  transport: (s) => s.incomes.find((i) => i.name?.toLowerCase().startsWith('transport'))?.amount ?? '',
  medical: (s) => s.deductions.find((d) => d.name?.toLowerCase().startsWith('medical'))?.amount ?? '',
  esppConst: (s) => s.espp.constPct,
  esppVar: (s) => s.espp.varPct,
};

const removeBtn = (i) => `<button class="btn icon ghost danger" data-hist-del="${i}" aria-label="Remove" title="Remove">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;

function entryRow(e, money) {
  const field = historyField(e.field);
  const shown = field.unit === 'pct' ? `${escapeHtml(e.value)}%` : money(Number(e.value) || 0);
  return `<div class="hist-row">
    <input type="month" value="${escapeHtml(e.from)}" data-hist="${e.index}" data-key="from" aria-label="Effective from">
    <input type="text" inputmode="decimal" value="${escapeHtml(e.value)}" data-hist="${e.index}" data-key="value" aria-label="${escapeHtml(field.label)}">
    <span class="hint">${shown}</span>${removeBtn(e.index)}</div>`;
}

export function renderHistory(state, money) {
  const host = $('#historyList');
  if (!host || host.contains(document.activeElement)) return;
  const now = monthKey(new Date());
  const groups = groupHistory(state.history);
  host.innerHTML = HISTORY_FIELDS.map((f) => {
    const list = groups.get(f.id);
    const current = valueAt(state.history, f.id, now, '');
    const badge = current !== '' ? `<span class="hint">now ${f.unit === 'pct' ? `${escapeHtml(current)}%` : money(Number(current) || 0)}</span>` : '';
    return `<details class="more" data-hist-group="${f.id}"${list.length ? ' open' : ''}>
      <summary>${escapeHtml(f.label)} <span class="count">${list.length || ''}</span>${badge}</summary>
      <div class="inner">
        ${list.map((e) => entryRow(e, money)).join('') || '<div class="hint">No dated values yet.</div>'}
        <div class="row wrap" style="margin-top:6px">
          <button class="btn sm" data-hist-add="${f.id}">+ Add value</button>
          <button class="btn sm ghost" data-hist-snap="${f.id}" title="Store today's value from the Pay tab, effective this month">Save current</button>
        </div>
      </div></details>`;
  }).join('');
}

/** Copies the values in force for `month` into the Pay tab fields (typing there still overrides). */
function fillPay(month) {
  const h = store.getState().history;
  const has = (field) => valueAt(h, field, month, '') !== '';
  if (!['salary', 'transport', 'medical', 'esppConst', 'esppVar'].some(has)) return toast(`No history values for ${monthLabel(month)}`);
  store.update((s) => {
    if (has('salary')) { s.amount = valueAt(h, 'salary', month); s.per = 'month'; s.mode = 'gross'; }
    const setNamed = (list, prefix, field, blank) => {
      if (!has(field)) return list;
      const i = list.findIndex((it) => it.name?.toLowerCase().startsWith(prefix));
      if (i >= 0) list[i] = { ...list[i], amount: valueAt(h, field, month) };
      else list.push({ ...clone(blank), amount: valueAt(h, field, month) });
      return list;
    };
    setNamed(s.incomes, 'transport', 'transport', { name: 'Transportation', per: 'month', taxable: true, insurable: false });
    setNamed(s.deductions, 'medical', 'medical', { name: 'Medical insurance', per: 'month', pretax: false });
    if (has('esppConst')) s.espp.constPct = valueAt(h, 'esppConst', month);
    if (has('esppVar')) s.espp.varPct = valueAt(h, 'esppVar', month);
    if (has('esppConst') || has('esppVar')) s.espp.enabled = true;
    s.ui.inTab = 'pay';
  });
  toast(`Pay tab filled with ${monthLabel(month)} values`);
}

function add(field, value = '') {
  const from = monthKey(new Date());
  store.update((s) => s.history.push({ field, from, value: String(value ?? '') }));
}

export function initHistory(onChanged) {
  const picker = $('#histMonth');
  picker.value = monthKey(new Date());
  $('#histFill').addEventListener('click', () => {
    fillPay(picker.value || monthKey(new Date()));
    onChanged();
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hist-add],[data-hist-snap],[data-hist-del]');
    if (!btn) return;
    if (btn.dataset.histAdd) add(btn.dataset.histAdd);
    else if (btn.dataset.histSnap) {
      const value = CURRENT[btn.dataset.histSnap](store.getState());
      if (value === '') return toast('Nothing to save — set it on the Pay tab first');
      add(btn.dataset.histSnap, value);
      toast(`Saved ${historyField(btn.dataset.histSnap).label} from ${monthLabel(monthKey(new Date()))}`);
    } else store.update((s) => s.history.splice(Number(btn.dataset.histDel), 1));
    onChanged();
  });

  document.addEventListener('input', (e) => {
    const i = e.target.dataset.hist;
    if (i !== undefined) store.set(`history.${i}.${e.target.dataset.key}`, e.target.value);
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.hist !== undefined) onChanged();
  });
}
