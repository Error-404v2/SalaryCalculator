import { $, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { toNumber } from '../utils/number.js';
import {
  HISTORY_FIELDS, historyField, monthKey, monthLabel, monthValues, savedMonths, saveMonth, removeMonth, valueAt,
  inputForMonth, calculate, withImpacts,
} from '../core/index.js';
import { breakdownLines } from './results/summary.js';
import * as store from '../state/store.js';

/** Where each tracked field lives on the Pay tab, so Save Month can snapshot it. */
const CURRENT = {
  salary: (s) => (s.per === 'month' ? s.amount : ''),
  transport: (s) => s.incomes.find((i) => i.name?.toLowerCase().startsWith('transport'))?.amount ?? '',
  medical: (s) => s.deductions.find((d) => d.name?.toLowerCase().startsWith('medical'))?.amount ?? '',
  esppConst: (s) => s.espp.constPct,
  esppVar: (s) => s.espp.varPct,
};
export const currentValues = (s) => Object.fromEntries(HISTORY_FIELDS.map((f) => [f.id, CURRENT[f.id](s)]));

/** Edits to the selected month that haven't been saved yet, field id → value. */
let draft = null;
let draftMonth = '';
let confirmDelete = false;

const fmt = (field, value, money) => (value === '' ? '—' : field.unit === 'pct' ? `${escapeHtml(value)}%` : money(toNumber(value)));

/** The month being viewed: the selected one if it still exists, else the newest saved month. */
function selectedMonth(state, months) {
  const chosen = state.ui.histMonth;
  if (chosen && (months.some((m) => m.month === chosen) || chosen === draftMonth)) return chosen;
  return months[0]?.month ?? '';
}

function savedList(state, months, active, money) {
  const now = monthKey(new Date());
  const rows = months.map(({ month, fields }) => {
    const salary = valueAt(state.history, 'salary', month);
    const tag = month === now ? ' <span class="hint">now</span>' : '';
    return `<button type="button" class="month-item${month === active ? ' on' : ''}" data-hist-pick="${month}">
      <span>${escapeHtml(monthLabel(month, 'long'))}${tag}</span>
      <span class="hint">${salary ? money(toNumber(salary)) : '—'} · ${fields.length} saved</span></button>`;
  }).join('');
  return `<details class="more" data-open="histSaved">
    <summary>Saved months <span class="count">${months.length || ''}</span></summary>
    <div class="inner month-list">${rows || '<div class="hint">No saved months yet. Use <b>Save Month</b> on the Pay tab, or + New.</div>'}</div>
  </details>`;
}

/** The selected month's own values, in the Pay tab's order and field style. */
function editor(state, month, money) {
  if (draftMonth !== month) {
    draft = monthValues(state.history, month);
    draftMonth = month;
    confirmDelete = false;
  }
  const own = new Set(savedMonths(state.history).find((m) => m.month === month)?.fields ?? []);
  const field = (id, label, unit) => {
    const inherited = !own.has(id) && draft[id] !== '';
    return `<label class="hist-field${inherited ? ' inherited' : ''}" title="${inherited ? 'Carried over from an earlier month' : ''}">
      <span>${label}</span>
      <input type="text" inputmode="decimal" data-hist-edit="${id}" value="${escapeHtml(draft[id] ?? '')}" placeholder="${unit === 'pct' ? '%' : 'Amount'}">
      <small>${fmt(historyField(id), draft[id] ?? '', money)}</small></label>`;
  };
  const isSaved = savedMonths(state.history).some((m) => m.month === month);
  const actions = confirmDelete
    ? `<span class="confirm">Delete ${escapeHtml(monthLabel(month, 'long'))}?
         <button class="btn sm danger" data-hist-act="delete-yes">Delete</button>
         <button class="btn sm ghost" data-hist-act="delete-no">Keep</button></span>`
    : `<button class="btn sm primary" data-hist-act="save">Save</button>
       ${isSaved ? '<button class="btn sm ghost danger" data-hist-act="delete">Delete month</button>' : ''}`;
  return `<div class="hist-editor">
    <div class="hist-head"><b>${escapeHtml(monthLabel(month, 'long'))}</b>${isSaved ? '' : '<span class="hint">not saved yet</span>'}</div>
    ${field('salary', 'Gross salary', 'money')}
    ${field('transport', 'Transportation', 'money')}
    ${field('medical', 'Medical insurance', 'money')}
    <div class="hist-pair">${field('esppConst', 'ESPP constant %', 'pct')}${field('esppVar', 'ESPP variable %', 'pct')}</div>
    <div class="row wrap hist-actions">${actions}</div>
  </div>`;
}

/** The month's figures as plain line items, in the Summary tab's order. */
function monthSummary(state, month, money) {
  const base = { ...state, history: draftHistory(state, month), profile: store.activeProfile() };
  const input = { ...inputForMonth(base, month), profile: store.activeProfile() };
  if (!toNumber(input.amount)) return '<div class="hint">Add a gross salary to see this month’s figures.</div>';
  const r = withImpacts(input, calculate(input));
  return `<div class="lines compact">${breakdownLines(r, input, (annual) => money(annual / 12))}</div>`;
}

/** The history as it would be if the draft were saved, so the summary shows unsaved edits live. */
const draftHistory = (state, month) => (draft && draftMonth === month ? saveMonth(state.history, month, draft).history : state.history);

export function renderHistory(state, money) {
  const host = $('#historyList');
  if (!host) return;
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') return;

  const months = savedMonths(state.history);
  const active = selectedMonth(state, months);
  host.innerHTML = `${savedList(state, months, active, money)}
    <div class="row hist-new">
      <input type="month" id="histNewMonth" value="${monthKey(new Date())}" aria-label="Month to add">
      <button class="btn sm" data-hist-act="new">+ New month</button>
    </div>
    ${active ? `${editor(state, active, money)}<div class="section-title">Summary</div><div id="histSummary">${monthSummary(state, active, money)}</div>` : ''}`;
  lastMoney = money;
}

/** Redraws only the summary, so typing in the editor keeps focus while the figures update. */
let lastMoney = String;
function refreshSummary() {
  const host = $('#histSummary');
  if (host && draftMonth) host.innerHTML = monthSummary(store.getState(), draftMonth, lastMoney);
}

function select(month) {
  store.set('ui.histMonth', month);
}

function save(onChanged) {
  const month = draftMonth;
  const result = saveMonth(store.getState().history, month, draft);
  if (!result.saved) return toast('Enter at least one value to save');
  store.update((s) => { s.history = result.history; s.ui.histMonth = month; });
  draftMonth = '';
  toast(`${result.replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
  onChanged();
}

function addMonth(onChanged) {
  const month = $('#histNewMonth')?.value || monthKey(new Date());
  if (savedMonths(store.getState().history).some((m) => m.month === month)) {
    select(month);
    toast(`${monthLabel(month, 'long')} is already saved — opened it`);
    return onChanged();
  }
  draft = { ...currentValues(store.getState()) };
  draftMonth = month;
  confirmDelete = false;
  select(month);
  onChanged();
}

export function initHistory(onChanged) {
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-hist-pick]');
    if (pick) { select(pick.dataset.histPick); return onChanged(); }

    const act = e.target.closest('[data-hist-act]')?.dataset.histAct;
    if (!act) return;
    if (act === 'save') return save(onChanged);
    if (act === 'new') return addMonth(onChanged);
    if (act === 'delete') confirmDelete = true;
    else if (act === 'delete-no') confirmDelete = false;
    else if (act === 'delete-yes') {
      const month = draftMonth;
      store.update((s) => { s.history = removeMonth(s.history, month); s.ui.histMonth = ''; });
      draftMonth = '';
      toast(`Deleted ${monthLabel(month, 'long')}`);
    }
    onChanged();
  });

  document.addEventListener('input', (e) => {
    const id = e.target.dataset.histEdit;
    if (!id || !draft) return;
    draft[id] = e.target.value;
    const small = e.target.parentElement.querySelector('small');
    if (small) small.innerHTML = fmt(historyField(id), e.target.value, lastMoney);
    refreshSummary();
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.histEdit) onChanged();
  });
}
