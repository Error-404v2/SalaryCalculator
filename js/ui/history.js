import { $, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { toNumber } from '../utils/number.js';
import {
  HISTORY_FIELDS, HISTORY_GROUPS, historyField, historyGroup, monthKey, monthLabel, valueAt,
  groupRows, monthsInHistory, setEntry, removeRow, removeMonth, moveRow, freeMonth, companionEntries,
  inputForMonth, calculate, withImpacts,
} from '../core/index.js';
import { breakdownLines } from './results/summary.js';
import { stat } from './results/shared.js';
import * as store from '../state/store.js';

/** Where the current value of each tracked field lives, so "Save current" and Save Month can snapshot it. */
const CURRENT = {
  salary: (s) => (s.per === 'month' ? s.amount : ''),
  transport: (s) => s.incomes.find((i) => i.name?.toLowerCase().startsWith('transport'))?.amount ?? '',
  medical: (s) => s.deductions.find((d) => d.name?.toLowerCase().startsWith('medical'))?.amount ?? '',
  esppConst: (s) => s.espp.constPct,
  esppVar: (s) => s.espp.varPct,
};
export const currentValues = (s) => Object.fromEntries(HISTORY_FIELDS.map((f) => [f.id, CURRENT[f.id](s)]));

/** Saved months the user has expanded, so a re-render keeps them open. */
const openMonths = new Set();

const fmt = (field, value, money) => (value === '' ? '—' : field.unit === 'pct' ? `${escapeHtml(value)}%` : money(Number(value) || 0));

const removeBtn = (group, from) => `<button class="btn icon ghost danger" data-hist-del="${group}" data-from="${escapeHtml(from)}" aria-label="Remove" title="Remove">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;

function groupRow(group, row, money) {
  const inputs = group.fields.map((id) => {
    const field = historyField(id);
    return `<input type="text" inputmode="decimal" value="${escapeHtml(row.values[id] ?? '')}" placeholder="${field.unit === 'pct' ? '%' : 'Amount'}"
      data-hist-value="${id}" data-from="${escapeHtml(row.from)}" aria-label="${escapeHtml(field.label)}" title="${escapeHtml(field.label)}">`;
  }).join('');
  const shown = group.fields.map((id) => fmt(historyField(id), row.values[id] ?? '', money)).join(' · ');
  return `<div class="hist-row cols-${group.fields.length}">
    <input type="month" value="${escapeHtml(row.from)}" data-hist-month="${group.id}" data-from="${escapeHtml(row.from)}" aria-label="Effective from">
    ${inputs}<span class="hint">${shown}</span>${removeBtn(group.id, row.from)}</div>`;
}

/** The month's own figures, laid out like the Summary tab: earnings, then deductions, then net. */
function monthSummary(state, month, money) {
  const input = { ...inputForMonth(state, month), profile: store.activeProfile() };
  if (!toNumber(input.amount)) return '<div class="hint">No gross salary saved for this month.</div>';
  const r = withImpacts(input, calculate(input));
  const at = (annual) => money(annual / 12);
  return `<div class="hero"><div class="k">Net pay · ${escapeHtml(monthLabel(month, 'long'))}</div>
      <div class="v">${at(r.net)}</div></div>
    <div class="stats three">
      ${stat('Gross', at(r.grossAnnual), 'pos')}
      ${stat('Deductions', at(r.totalDeductions), 'neg')}
    </div>
    <div class="split"><div class="lines">${breakdownLines(r, input, at)}</div></div>`;
}

const DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>';

function monthBlock(state, month, money) {
  const name = escapeHtml(monthLabel(month, 'long'));
  return `<details class="month" data-month="${month}"${openMonths.has(month) ? ' open' : ''}>
    <summary><span class="month-name">${name}</span>
      <button class="btn icon ghost danger" data-hist-delmonth="${month}" aria-label="Delete ${name}" title="Delete month">${DELETE_ICON}</button></summary>
    <div class="inner">${monthSummary(state, month, money)}</div></details>`;
}

function groupBlock(state, group, money) {
  const rows = groupRows(state.history, group.fields);
  const now = monthKey(new Date());
  const current = group.fields.some((id) => valueAt(state.history, id, now) !== '')
    ? `<span class="hint">now ${group.fields.map((id) => fmt(historyField(id), valueAt(state.history, id, now), money)).join(' · ')}</span>` : '';
  return `<details class="more" data-hist-group="${group.id}"${rows.length ? ' open' : ''}>
    <summary>${escapeHtml(group.label)} <span class="count">${rows.length || ''}</span>${current}</summary>
    <div class="inner">
      ${rows.map((r) => groupRow(group, r, money)).join('') || '<div class="hint">No dated values yet.</div>'}
      <div class="row wrap" style="margin-top:6px">
        <button class="btn sm" data-hist-add="${group.id}">+ Add value</button>
        <button class="btn sm ghost" data-hist-snap="${group.id}" title="Store today's value from the Pay tab, effective this month">Save current</button>
      </div>
    </div></details>`;
}

export function renderHistory(state, money) {
  const host = $('#historyList');
  if (!host) return;
  // Don't redraw while a field inside the list is being typed in; the change event will redraw.
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') return;

  const months = monthsInHistory(state.history);
  const saved = `<div class="section-title">Saved months <span class="count">${months.length || ''}</span></div>
    ${months.map((m) => monthBlock(state, m, money)).join('') || '<div class="hint">No saved months yet. Use <b>Save Month</b> on the Pay tab.</div>'}`;
  host.innerHTML = `${saved}<div class="section-title">Dated values</div>${HISTORY_GROUPS.map((g) => groupBlock(state, g, money)).join('')}`;
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
      else list.push({ ...blank, amount: valueAt(h, field, month) });
      return list;
    };
    setNamed(s.incomes, 'transport', 'transport', { name: 'Transportation', per: 'month', taxable: true, insurable: false });
    setNamed(s.deductions, 'medical', 'medical', { name: 'Medical insurance', per: 'month', pretax: false });
    if (has('esppConst')) s.espp.constPct = valueAt(h, 'esppConst', month);
    if (has('esppVar')) s.espp.varPct = valueAt(h, 'esppVar', month);
    s.ui.inTab = 'pay';
  });
  toast(`Pay tab filled with ${monthLabel(month)} values`);
}

/** Adds a blank row in the first free month at or before this one. Gross also brings Transportation and Medical. */
function add(groupId) {
  const group = historyGroup(groupId);
  store.update((s) => {
    const from = freeMonth(s.history, group.fields, monthKey(new Date()));
    const extra = companionEntries(s.history, groupId === 'salary' ? 'salary' : '', from, currentValues(s));
    s.history.push(...group.fields.map((field) => ({ field, from, value: '' })), ...extra);
  });
}

function snapshotCurrent(groupId) {
  const group = historyGroup(groupId);
  const from = monthKey(new Date());
  const now = currentValues(store.getState());
  if (group.fields.every((id) => now[id] === '')) return toast('Nothing to save — set it on the Pay tab first');
  store.update((s) => {
    const extra = companionEntries(s.history, groupId === 'salary' ? 'salary' : '', from, now);
    let next = s.history;
    for (const id of group.fields) if (now[id] !== '') next = setEntry(next, id, from, now[id]);
    s.history = [...next, ...extra];
  });
  toast(`Saved ${group.label} for ${monthLabel(from)}`);
}

function deleteMonth(month) {
  if (!confirm(`Delete everything saved for ${monthLabel(month, 'long')}?`)) return;
  store.update((s) => { s.history = removeMonth(s.history, month); });
  openMonths.delete(month);
  toast(`Deleted ${monthLabel(month, 'long')}`);
}

export function initHistory(onChanged) {
  $('#histFill')?.addEventListener('click', () => {
    fillPay(monthKey(new Date()));
    onChanged();
  });

  document.addEventListener('toggle', (e) => {
    const month = e.target.dataset?.month;
    if (month) (e.target.open ? openMonths.add(month) : openMonths.delete(month));
  }, true);

  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-hist-delmonth]');
    if (del) {
      e.preventDefault(); // the button sits inside <summary>; don't also toggle the month
      deleteMonth(del.dataset.histDelmonth);
      return onChanged();
    }
    const btn = e.target.closest('[data-hist-add],[data-hist-snap],[data-hist-del]');
    if (!btn) return;
    if (btn.dataset.histAdd) add(btn.dataset.histAdd);
    else if (btn.dataset.histSnap) snapshotCurrent(btn.dataset.histSnap);
    else {
      const group = historyGroup(btn.dataset.histDel);
      store.update((s) => { s.history = removeRow(s.history, group.fields, btn.dataset.from); });
    }
    onChanged();
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.histValue) store.update((s) => { s.history = setEntry(s.history, t.dataset.histValue, t.dataset.from, t.value); });
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.histMonth) {
      const group = historyGroup(t.dataset.histMonth);
      const moved = moveRow(store.getState().history, group.fields, t.dataset.from, t.value);
      if (moved.ok) store.update((s) => { s.history = moved.history; });
      else toast(t.value ? `${monthLabel(t.value)} already has a value here` : 'Pick a month');
      onChanged();
    } else if (t.dataset.histValue) onChanged();
  });
}
