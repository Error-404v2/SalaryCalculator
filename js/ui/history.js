import { $, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { toNumber } from '../utils/number.js';
import {
  monthKey, monthLabel, monthList, monthInForce, snapshotPay, putMonth, dropMonth, applyPay, fromAnnual,
  grossPay, withPay, calculate, moveMonth,
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
/**
 * The open entry itself, whatever month the calendar has renamed it to: the month it was opened on (`home`),
 * whether that month was saved, and what it held then (`base`). Renaming never changes it; Save does.
 */
let entry = { home: '', saved: false, base: null };
/** The saved month the open entry was re-dated from with the calendar; Save moves it from there. */
let movingFrom = '';
/** True when the open entry was re-dated onto a month that is already saved: Save then asks before it overrides that month. */
let overriding = false;
/** Showing the "Override it?" question under the month bar. */
let askOverride = false;

const CHEVRON = '<svg class="chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
const RED_MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg>';
const RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';

/** Years the user opened or closed in the Saved months list; others are open only for the newest year and the open month's year. */
const yearToggled = new Map();

const setEntry = (home, saved, base) => { entry = { home, saved, base }; };
function clearRename() {
  movingFrom = '';
  overriding = false;
  askOverride = false;
}

const isSaved = (state, month) => !!state.months[month];
const withProfile = (state) => ({ ...state, profile: store.activeProfile() });
/** A month's final (net) monthly pay, for the saved-months list. */
const finalPay = (state, pay) => (toNumber(pay?.amount) > 0 ? calculate({ ...withPay(withProfile(state), pay), profile: store.activeProfile() }).net / 12 : 0);
const isDirty = (month) => month === store.scopeMonth() ? store.scopeDirty() : drafts.has(month);

/**
 * Keeps unsaved edits of the month being left, so switching back resumes them. An entry that was renamed but not
 * saved goes back under its own month, so it never lands on (or hides) the month it was renamed to.
 */
function stash() {
  const month = store.scopeMonth();
  if (!month) return;
  const renamed = !!entry.home && month !== entry.home;
  const key = renamed ? entry.home : month;
  const base = renamed ? entry.base : store.scopeBase();
  const pay = store.scopePay();
  if (JSON.stringify(pay) !== JSON.stringify(base)) drafts.set(key, pay);
  else drafts.delete(key);
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
  // A new, unsaved entry opened on another unsaved month carries its values there (nothing to stash).
  if (current && !overriding && !isSaved(state, current) && !isSaved(state, month)) {
    const pay = store.scopePay();
    drafts.delete(current);
    clearRename();
    const { base } = contentFor(state, month);
    store.update((s) => { s.ui.histMonth = month; });
    store.setScope(month, pay, base);
    setEntry(month, false, base);
    return;
  }
  stash();
  clearRename();
  askDelete = '';
  const { pay, base } = contentFor(store.getState(), month);
  store.update((s) => { s.ui.histMonth = month; });
  store.setScope(month, pay, base);
  setEntry(month, isSaved(store.getState(), month), base);
}

/**
 * The month picker only renames the open entry: its values carry over untouched to the picked month and Save
 * becomes active. Saving moves it there (the original month is replaced, not duplicated). This holds even when
 * the picked month is already saved: that month's entry is never opened, merged or hidden, and Save asks before
 * it overrides it. Renaming on (e.g. new Oct → May → Oct) keeps May listed and saved as it was.
 * To open an existing month, use the Saved months list.
 */
function pickMonth(month) {
  const state = store.getState();
  const current = store.scopeMonth();
  if (!current || month === current) return open(month);
  const pay = store.scopePay();
  // Only the open entry's own month holds a stale copy of it; another month's draft is that month's, so it stays.
  if (current === entry.home) drafts.delete(current);
  store.update((s) => { s.ui.histMonth = month; });
  store.setScope(month, pay, month === entry.home ? entry.base : contentFor(state, month).base);
  movingFrom = entry.saved && month !== entry.home ? entry.home : '';
  overriding = isSaved(state, month) && !(entry.saved && month === entry.home);
  askOverride = false;
}

/**
 * Reset (the arrow on a month row): back to what is saved. The open entry returns to its saved month, dropping
 * edits and any rename; another month just loses its unsaved draft.
 */
function resetMonth(month) {
  const state = store.getState();
  if (month !== store.scopeMonth()) {
    drafts.delete(month);
    return;
  }
  const target = movingFrom || month;
  const saved = state.months[target];
  if (!saved) return;
  drafts.delete(target);
  drafts.delete(month);
  clearRename();
  store.update((s) => { s.ui.histMonth = target; });
  store.setScope(target, saved, saved);
  setEntry(target, true, saved);
  toast(`${monthLabel(target, 'long')} reset to its saved values`);
}

/** A row offers Reset only while it has changes waiting to be saved and there is a saved state to go back to. */
function canReset(state, month, active) {
  if (month !== active) return isSaved(state, month) && drafts.has(month);
  if (movingFrom) return isSaved(state, movingFrom);
  return isSaved(state, month) && (overriding || store.scopeDirty());
}

/** The month "+ New" opens: this month if it is free, else the month after the latest one in use (saved, drafted or open). */
function nextFreeMonth(state) {
  const taken = new Set([...monthList(state.months), ...drafts.keys(), store.scopeMonth()].filter(Boolean));
  const now = monthKey(new Date());
  if (!taken.has(now)) return now;
  const [y, m] = [...taken].sort().at(-1).split('-').map(Number);
  return monthKey(new Date(y, m, 1));
}

/**
 * "+ New month": the new entry starts from the values currently entered (unsaved edits included) and the month
 * it was opened from goes back to its saved values (or is dropped when it was itself new and unsaved).
 */
function newMonth() {
  const state = store.getState();
  const month = nextFreeMonth(state);
  const current = store.scopeMonth();
  if (!current) return open(month);
  const pay = store.scopePay();
  [current, entry.home].forEach((m) => m && drafts.delete(m));
  clearRename();
  askDelete = '';
  const { base } = contentFor(state, month);
  store.update((s) => { s.ui.histMonth = month; });
  store.setScope(month, pay, base);
  setEntry(month, false, base);
}

/** Enter or leave month editing to match the active input tab. Called on load and on every tab switch. */
export function syncHistoryScope() {
  const s = store.getState();
  if (s.ui.inTab !== 'history') {
    stash();
    clearRename();
    setEntry('', false, null);
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
  const moved = month === active && movingFrom ? `<span class="tag">from ${escapeHtml(monthLabel(movingFrom))}</span>` : '';
  const pending = isDirty(month) || (month === active && overriding);
  const tag = moved || (!isSaved(state, month) ? '<span class="tag">new</span>' : pending ? '<span class="tag">unsaved</span>' : '');
  const now = month === monthKey(new Date()) ? '<span class="hint">now</span>' : '';
  const reset = canReset(state, month, active)
    ? `<button type="button" class="btn icon ghost reset" data-hist-reset="${month}" aria-label="Reset ${name} to saved" title="Reset to saved">${RESET_ICON}</button>`
    : '';
  return `<div class="month-row${month === active ? ' on' : ''}">
    <button type="button" class="month-item" data-hist-pick="${month}"><span>${name}${now}${tag}</span>
      <span class="hint" title="Net pay">${finalPay(state, pay) ? money(finalPay(state, pay)) : '—'}</span></button>
    ${reset}<button type="button" class="btn icon ghost danger" data-hist-del="${month}" aria-label="${isSaved(state, month) ? 'Delete' : 'Discard'} ${name}"
      title="${isSaved(state, month) ? 'Delete month' : 'Discard'}">${RED_MINUS}</button>
  </div>`;
}

function savedList(state, active, money) {
  const months = new Set([...monthList(state.months), ...drafts.keys()]);
  if (movingFrom) months.delete(movingFrom);
  if (active) months.add(active);
  const sorted = [...months].sort((a, b) => b.localeCompare(a));
  const years = [...new Set(sorted.map((m) => m.slice(0, 4)))];
  // One year stays a plain list; several years get a compact header each, only the newest (and the open month's) expanded.
  const rows = years.length < 2
    ? sorted.map((m) => monthRow(state, m, active, money)).join('')
    : years.map((year) => {
      const inYear = sorted.filter((m) => m.startsWith(year));
      const total = inYear.reduce((n, m) => n + finalPay(state, m === active ? store.scopePay() : drafts.get(m) ?? state.months[m]), 0);
      const open = yearToggled.get(year) ?? (year === years[0] || year === active?.slice(0, 4));
      return `<div class="month-year${open ? ' open' : ''}">
        <button type="button" class="month-year-head${year === active?.slice(0, 4) ? ' on' : ''}" data-hist-year="${year}" aria-expanded="${open}"><span class="yr">${year}</span><span class="hint">${inYear.length}</span><span class="yr-total" title="Net pay of the year's months">${total ? money(total) : '—'}</span><span class="yr-chev">${CHEVRON}</span></button>
        ${open ? inYear.map((m) => monthRow(state, m, active, money)).join('') : ''}</div>`;
    }).join('');
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
  const dirty = !saved || store.scopeDirty() || !!movingFrom || overriding;
  const ask = askOverride
    ? `<div class="month-row ask"><span>${escapeHtml(monthLabel(month, 'long'))} is already saved. Override it?</span>
        <span class="row"><button type="button" class="btn sm danger" data-hist-act="override-yes">Override</button>
        <button type="button" class="btn sm ghost" data-hist-act="override-no">Cancel</button></span></div>`
    : '';
  host.innerHTML = `${savedList(state, month, money)}
    <div class="row hist-bar">
      ${monthPickerHtml('hist', month, monthList(state.months))}
      <button type="button" class="btn sm ${dirty ? 'primary' : 'ghost done'}" data-hist-act="save"${dirty ? '' : ' disabled aria-disabled="true"'}>${dirty ? 'Save' : 'Saved'}</button>
    </div>${ask}
    <details class="hist-summary" data-open="histSummary">
      <summary><span class="section-title">Summary of ${escapeHtml(monthLabel(month, 'long'))}</span>${CHEVRON}</summary>
      ${monthSummary(state, money, pay)}
    </details>`;
}

function save() {
  if (!toNumber(store.scopePay()?.amount)) return toast('Enter a gross salary to save this month');
  if (overriding) { askOverride = true; return; }
  commitSave();
}

function commitSave() {
  const month = store.scopeMonth();
  const pay = store.scopePay();
  const replaced = isSaved(store.getState(), month);
  const gross = grossPay(pay, withProfile(store.getState()));
  const from = movingFrom;
  clearRename();
  store.markScopeSaved();
  drafts.delete(month);
  if (from) drafts.delete(from);
  store.update((s) => { s.months = moveMonth(s.months, from, month, gross); });
  setEntry(month, true, store.scopeBase());
  toast(from ? `Moved ${monthLabel(from, 'long')} to ${monthLabel(month, 'long')}` : `${replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
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

/** After an import or a reset the saved months are new: forget drafts and the open entry, then open a month again. */
export function resetHistory() {
  drafts.clear();
  yearToggled.clear();
  clearRename();
  askDelete = '';
  setEntry('', false, null);
  syncHistoryScope();
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
    const yearHead = e.target.closest('[data-hist-year]');
    if (yearHead) {
      const year = yearHead.dataset.histYear;
      yearToggled.set(year, yearHead.getAttribute('aria-expanded') !== 'true');
      return onChanged();
    }
    const pick = e.target.closest('[data-hist-pick]');
    if (pick) { open(pick.dataset.histPick); return onChanged(); }
    const reset = e.target.closest('[data-hist-reset]');
    if (reset) { resetMonth(reset.dataset.histReset); return onChanged(); }
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
    else if (act === 'override-yes') commitSave();
    else if (act === 'override-no') askOverride = false;
    else if (act === 'new') newMonth();
    else if (act === 'delete-yes') remove(askDelete);
    else if (act === 'delete-no') askDelete = '';
    onChanged();
  });
}
