import { $, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { toNumber } from '../utils/number.js';
import {
  monthKey, monthLabel, monthList, monthInForce, snapshotPay, putMonth, dropMonth, applyPay, fromAnnual,
  grossPay, withPay, calculate,
} from '../core/index.js';
import { breakdownLines } from './results/summary.js';
import { monthPickerHtml, onMonthPick } from './monthPicker.js';
import * as store from '../state/store.js';

/**
 * History tab: a saved-month list, a month picker with Save, then the month's summary and the Pay tab's own
 * form, moved here and pointed at that month (see `store.setScope`). Unsaved edits are kept per month.
 */
const drafts = new Map();
let askDelete = '';

const RED_MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg>';

const isSaved = (state, month) => !!state.months[month];
const withProfile = (state) => ({ ...state, profile: store.activeProfile() });
/** A month's final (net) monthly pay, for the saved-months list. */
const finalPay = (state, pay) => (toNumber(pay?.amount) > 0 ? calculate({ ...withPay(withProfile(state), pay), profile: store.activeProfile() }).net / 12 : 0);
const isDirty = (month) => month === store.scopeMonth() ? store.scopeDirty() : drafts.has(month);

/** Keeps unsaved edits of the month being left, so switching back resumes them. */
function stash() {
  const month = store.scopeMonth();
  if (!month) return;
  if (store.scopeDirty()) drafts.set(month, store.scopePay());
  else drafts.delete(month);
}

/** A month opens with its unsaved draft, else what is saved, else a copy of the month before it (or the Pay tab). */
function contentFor(state, month) {
  const saved = state.months[month];
  if (saved) return { pay: drafts.get(month) ?? saved, base: saved };
  const before = monthInForce(state.months, month);
  const start = before ? state.months[before] : grossPay(snapshotPay(state), withProfile(state));
  return { pay: drafts.get(month) ?? start, base: start };
}

function open(month) {
  if (month === store.scopeMonth()) return;
  const current = store.scopeMonth();
  const state = store.getState();
  if (current && !isSaved(state, current) && !isSaved(state, month)) {
    const pay = store.scopePay();
    drafts.delete(current);
    store.update((s) => { s.ui.histMonth = month; });
    store.setScope(month, pay, contentFor(state, month).base);
    return;
  }
  stash();
  askDelete = '';
  const { pay, base } = contentFor(store.getState(), month);
  store.update((s) => { s.ui.histMonth = month; });
  store.setScope(month, pay, base);
}

/**
 * The month picker: a saved month opens normally; a month not saved yet takes over the open form (its values
 * carry over) instead of adding another row, and Save becomes active to store it under the picked month.
 */
function pickMonth(month) {
  const state = store.getState();
  const current = store.scopeMonth();
  if (isSaved(state, month) || !current || month === current) return open(month);
  const pay = store.scopePay();
  drafts.delete(current);
  store.update((s) => { s.ui.histMonth = month; });
  store.setScope(month, pay, contentFor(state, month).base);
}

/** The month "+ New" opens: this month if it isn't saved, else the month after the newest saved one. */
function nextFreeMonth(state) {
  const now = monthKey(new Date());
  if (!state.months[now]) return now;
  const [y, m] = monthList(state.months)[0].split('-').map(Number);
  return monthKey(new Date(y, m, 1));
}

/** Enter or leave month editing to match the active input tab. Called on load and on every tab switch. */
export function syncHistoryScope() {
  const s = store.getState();
  if (s.ui.inTab !== 'history') {
    stash();
    if (store.scopeMonth()) store.setScope('');
    return;
  }
  const month = s.ui.histMonth && (isSaved(s, s.ui.histMonth) || drafts.has(s.ui.histMonth))
    ? s.ui.histMonth
    : monthList(s.months)[0] ?? monthKey(new Date());
  open(month);
}

/** The Pay form lives on the Pay tab and moves under the History summary while a month is open. */
export function placePayForm(state) {
  const form = $('#payForm');
  const target = state.ui.inTab === 'history' && store.scopeMonth() ? $('#payFormSlot') : $('#payFormHome');
  if (form && target && form.parentElement !== target) target.appendChild(form);
}

function monthRow(state, month, active, money) {
  const name = escapeHtml(monthLabel(month, 'long'));
  if (askDelete === month) {
    return `<div class="month-row ask"><span>Delete ${name}?</span>
      <span class="row"><button class="btn sm danger" data-hist-act="delete-yes">Delete</button>
      <button class="btn sm ghost" data-hist-act="delete-no">Keep</button></span></div>`;
  }
  const pay = month === active ? store.scopePay() : drafts.get(month) ?? state.months[month];
  const tag = !isSaved(state, month) ? '<span class="tag">new</span>' : isDirty(month) ? '<span class="tag">unsaved</span>' : '';
  const now = month === monthKey(new Date()) ? '<span class="hint">now</span>' : '';
  return `<div class="month-row${month === active ? ' on' : ''}">
    <button type="button" class="month-item" data-hist-pick="${month}"><span>${name}${now}${tag}</span>
      <span class="hint" title="Net pay">${finalPay(state, pay) ? money(finalPay(state, pay)) : '—'}</span></button>
    <button type="button" class="btn icon ghost danger" data-hist-del="${month}" aria-label="${isSaved(state, month) ? 'Delete' : 'Discard'} ${name}"
      title="${isSaved(state, month) ? 'Delete month' : 'Discard'}">${RED_MINUS}</button>
  </div>`;
}

function savedList(state, active, money) {
  const months = new Set([...monthList(state.months), ...drafts.keys()]);
  if (active) months.add(active);
  const rows = [...months].sort((a, b) => b.localeCompare(a)).map((m) => monthRow(state, m, active, money)).join('');
  return `<details class="more" data-open="histSaved">
    <summary>Saved months <span class="count">${monthList(state.months).length || ''}</span></summary>
    <div class="inner month-list">
      <button type="button" class="month-item add" data-hist-act="new">+ New month</button>
      ${rows}
    </div>
  </details>`;
}

/** The open month's net pay, then its pay items and deductions as compact lines (the form below holds the inputs). */
function monthSummary(state, money, pay) {
  const r = pay.result;
  if (!r) return '<div class="hint">Enter a gross salary below to see this month’s figures.</div>';
  const at = (annual) => money(fromAnnual(annual, 'month', state.schedule, pay.factor));
  return `<div class="hist-net"><span>Net pay</span><b>${at(r.net)}</b></div>
    <div class="lines compact">${breakdownLines(r, state, at, { net: false, entered: true })}</div>`;
}

export function renderHistory(state, money, pay) {
  const host = $('#historyList');
  if (!host) return;
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') return;

  const month = store.scopeMonth();
  const saved = isSaved(state, month);
  const dirty = !saved || store.scopeDirty();
  host.innerHTML = `${savedList(state, month, money)}
    <div class="row hist-bar">
      ${monthPickerHtml('hist', month, monthList(state.months))}
      <button type="button" class="btn sm ${dirty ? 'primary' : 'ghost done'}" data-hist-act="save"${dirty ? '' : ' disabled aria-disabled="true"'}>${dirty ? 'Save' : 'Saved'}</button>
    </div>
    <div class="section-title">Summary of ${escapeHtml(monthLabel(month, 'long'))}</div>
    ${monthSummary(state, money, pay)}`;
}

function save() {
  const month = store.scopeMonth();
  const pay = store.scopePay();
  if (!toNumber(pay?.amount)) return toast('Enter a gross salary to save this month');
  const replaced = isSaved(store.getState(), month);
  const gross = grossPay(pay, withProfile(store.getState()));
  store.markScopeSaved();
  drafts.delete(month);
  store.update((s) => { s.months = putMonth(s.months, month, gross); });
  toast(`${replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
}

/** Switches the input tab and enters or leaves month editing to match. */
export function showTab(tab, month = '') {
  stash();
  store.update((s) => {
    s.ui.inTab = tab;
    if (month) s.ui.histMonth = month;
  });
  syncHistoryScope();
}

/** Fill Pay: copy the open month (with any unsaved edits) into the Pay tab, then show the Pay tab. */
function fillPay() {
  const month = store.scopeMonth();
  const pay = store.scopePay();
  if (!pay) return;
  store.update((s) => applyPay(s, pay));
  drafts.delete(month);
  showTab('pay');
  toast(`Pay tab filled with ${monthLabel(month, 'long')}`);
}

function remove(month) {
  const saved = isSaved(store.getState(), month);
  drafts.delete(month);
  askDelete = '';
  if (saved) store.update((s) => { s.months = dropMonth(s.months, month); });
  toast(`${saved ? 'Deleted' : 'Discarded'} ${monthLabel(month, 'long')}`);
  if (store.scopeMonth() !== month) return;
  store.setScope('');
  open(monthList(store.getState().months)[0] ?? monthKey(new Date()));
}

export function syncHistoryBar(state) {
  $('#fillPayBtn').hidden = state.ui.inTab !== 'history' || !store.scopeMonth();
}

export function initHistory(onChanged) {
  syncHistoryScope();
  onMonthPick('hist', (month) => { pickMonth(month); onChanged(); });
  $('#fillPayBtn').addEventListener('click', () => { fillPay(); onChanged(); });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-in-tabs] .tab')) {
      syncHistoryScope();
      return onChanged();
    }
    const pick = e.target.closest('[data-hist-pick]');
    if (pick) { open(pick.dataset.histPick); return onChanged(); }
    const del = e.target.closest('[data-hist-del]');
    if (del) {
      const month = del.dataset.histDel;
      if (isSaved(store.getState(), month)) askDelete = month;
      else remove(month);
      return onChanged();
    }
    const act = e.target.closest('[data-hist-act]')?.dataset.histAct;
    if (!act) return;
    if (act === 'save') save();
    else if (act === 'new') open(nextFreeMonth(store.getState()));
    else if (act === 'delete-yes') remove(askDelete);
    else if (act === 'delete-no') askDelete = '';
    onChanged();
  });
}
