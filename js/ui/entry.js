import { $, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { toNumber } from '../utils/number.js';
import {
  monthKey, monthLabel, monthList, monthInForce, snapshotPay, dropMonth, fromAnnual,
  grossPay, withPay, moveMonth, periodNet, resolvePayPeriod, monthChoices,
} from '../core/index.js';
import { breakdownLines } from './results/summary.js';
import { monthPickerHtml, onMonthPick, onMonthBack, onMonthClose, openMonthPicker } from './monthPicker.js';
import { syncDropdowns } from './dropdown.js';
import * as store from '../state/store.js';

/**
 * One input panel (the old Pay and History tabs together). There is always one entry being worked on: a month's
 * values, edited in the form below. The Saved months list loads a month into it; the "save to" dropdown next to
 * Gross → Net only renames the entry (its values never change), with Custom… opening the month picker; Save in the
 * top bar stores the entry under that month, asking first before it overrides a month that is already saved.
 * Unsaved edits are kept per month as drafts, and the entry and drafts are kept on this device, so a reload picks up
 * where it was left. Nothing is stored in a month until it is saved.
 */
const drafts = new Map();
let askDelete = '';
/**
 * The entry itself, whatever month the dropdown has renamed it to: the month it was opened on (`home`), whether
 * that month was saved, and what it held then (`base`). Renaming never changes it; Save does.
 */
let entry = { home: '', saved: false, base: null };
/** The saved month the entry was renamed from; Save moves it from there. */
let movingFrom = '';
/** True when the entry was renamed onto a month that is already saved: Save then asks before it overrides that month. */
let overriding = false;
/** Showing the "Override it?" question. */
let askOverride = false;
/** The month dropdown is swapped for the themed month picker (Custom…). */
let picking = false;

const CUSTOM = 'custom';
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
/** A month's final (net) pay for its own pro-rata period, under its own tax year, for the Saved months list. */
const finalPay = (state, pay, month) =>
  (toNumber(pay?.amount) > 0 ? periodNet(withPay(withProfile(state), pay, month)) : 0);
const isDirty = (month) => (month === store.scopeMonth() ? store.scopeDirty() : drafts.has(month));
/** Values of a month as shown in the list: the open entry, an unsaved draft, or what is saved. */
const payOf = (state, month, active) => (month === active ? store.scopePay() : drafts.get(month) ?? state.months[month]);

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

/** A month opens with its unsaved draft, else what is saved, else a copy of the month before it (or the starting values). */
function contentFor(state, month) {
  const saved = state.months[month];
  if (saved) return { pay: drafts.get(month) ?? saved, base: saved };
  const before = monthInForce(state.months, month);
  const start = before ? state.months[before] : grossPay(snapshotPay(state), withProfile(state));
  return { pay: drafts.get(month) ?? start, base: start };
}

/** Loads `month` into the form (its draft, else what is saved, else a starting copy). */
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
 * The "save to" dropdown only renames the entry: its values carry over untouched to the picked month and Save
 * becomes active. Saving moves it there (the original month is replaced, not duplicated). This holds even when the
 * picked month is already saved: that month's entry is never opened, merged or hidden, and Save asks before it
 * overrides it. Renaming on (e.g. new Oct → May → Oct) keeps May listed and saved as it was.
 * To open an existing month, use the Saved months list.
 */
function rename(month) {
  const state = store.getState();
  const current = store.scopeMonth();
  if (!current || month === current) return open(month);
  const pay = store.scopePay();
  // Only the entry's own month holds a stale copy of it; another month's draft is that month's, so it stays.
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

/** The month "+ New month" opens: this month if it is free, else the month after the latest one in use (saved, drafted or open). */
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

function monthRow(state, month, active, money) {
  const name = escapeHtml(monthLabel(month, 'long'));
  if (askDelete === month) {
    return `<div class="month-row ask"><span>Delete ${name}?</span>
      <span class="row"><button class="btn sm danger" data-hist-act="delete-yes">Delete</button>
      <button class="btn sm ghost" data-hist-act="delete-no">Keep</button></span></div>`;
  }
  const pay = payOf(state, month, active);
  const moved = month === active && movingFrom ? `<span class="tag">from ${escapeHtml(monthLabel(movingFrom))}</span>` : '';
  const pending = isDirty(month) || (month === active && overriding);
  const tag = moved || (!isSaved(state, month) ? '<span class="tag">new</span>' : pending ? '<span class="tag">unsaved</span>' : '');
  const now = month === monthKey(new Date()) ? '<span class="hint">now</span>' : '';
  const reset = canReset(state, month, active)
    ? `<button type="button" class="btn icon ghost reset" data-hist-reset="${month}" aria-label="Reset ${name} to saved" title="Reset to saved">${RESET_ICON}</button>`
    : '';
  const net = finalPay(state, pay, month);
  return `<div class="month-row${month === active ? ' on' : ''}">
    <button type="button" class="month-item" data-hist-pick="${month}"><span>${name}${now}${tag}</span>
      <span class="hint" title="Net pay for this month's own pro-rata period">${net ? money(net) : '—'}</span></button>
    ${reset}<button type="button" class="btn icon ghost danger" data-hist-del="${month}" aria-label="${isSaved(state, month) ? 'Delete' : 'Discard'} ${name}"
      title="${isSaved(state, month) ? 'Delete month' : 'Discard'}">${RED_MINUS}</button>
  </div>`;
}

/** Saved months grouped by year (newest first). Each year has a compact header with its total, even when there is only one year. */
function savedList(state, active, money) {
  const months = new Set([...monthList(state.months), ...drafts.keys()]);
  if (movingFrom) months.delete(movingFrom);
  if (active) months.add(active);
  const sorted = [...months].sort((a, b) => b.localeCompare(a));
  const years = [...new Set(sorted.map((m) => m.slice(0, 4)))];
  const rows = years.map((year) => {
    const inYear = sorted.filter((m) => m.startsWith(year));
    const total = inYear.reduce((n, m) => n + finalPay(state, payOf(state, m, active), m), 0);
    const opened = yearToggled.get(year) ?? (year === years[0] || year === active?.slice(0, 4));
    return `<div class="month-year${opened ? ' open' : ''}">
      <button type="button" class="month-year-head${year === active?.slice(0, 4) ? ' on' : ''}" data-hist-year="${year}" aria-expanded="${opened}"><span class="yr">${year}</span><span class="hint">${inYear.length}</span><span class="yr-total" title="Total of the year's months, each for its own pro-rata period">${total ? money(total) : '—'}</span><span class="yr-chev">${CHEVRON}</span></button>
      ${opened ? inYear.map((m) => monthRow(state, m, active, money)).join('') : ''}</div>`;
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
  return `<div class="hist-net"><span>Net pay${pay.factor === 1 ? '' : ' · ' + escapeHtml(resolvePayPeriod(state.payPeriod).label)}</span><b>${at(r.net)}</b></div>
    <div class="lines compact">${breakdownLines(r, state, at, { net: false, entered: true })}</div>`;
}

/** The "save to" month: saved months nearest first, this entry's month, then Custom…, which opens the month picker. */
function saveToHtml(state, month) {
  if (picking) return monthPickerHtml('entry', month, monthList(state.months));
  const choices = monthChoices(state.months, monthKey(new Date()), month);
  const options = choices
    .map((c) => `<option value="${c.month}"${c.month === month ? ' selected' : ''}>${escapeHtml(monthLabel(c.month, 'long'))}${c.saved ? '' : ' (not saved)'}</option>`)
    .join('');
  return `<select class="sm" data-dd data-entry-month aria-label="Month to save this entry to">${options}<option value="${CUSTOM}">Custom…</option></select>`;
}

const needsSave = (state, month) => !isSaved(state, month) || store.scopeDirty() || !!movingFrom || overriding;

export function renderEntry(state, money, pay) {
  const month = store.scopeMonth();
  if (!month) return;
  const save = $('#saveBtn');
  const dirty = needsSave(state, month);
  save.textContent = dirty ? 'Save' : 'Saved';
  save.disabled = !dirty;
  save.classList.toggle('primary', dirty);
  save.classList.toggle('done', !dirty);
  save.title = dirty ? `Save this entry as ${monthLabel(month, 'long')}` : `${monthLabel(month, 'long')} is saved`;

  const slot = $('#saveToSlot');
  if (!slot.contains(document.activeElement) && !slot.querySelector('.mpick-pop:not([hidden])')) {
    slot.innerHTML = saveToHtml(state, month);
  }

  const host = $('#entryHead');
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') return;
  const ask = askOverride
    ? `<div class="month-row ask"><span>${escapeHtml(monthLabel(month, 'long'))} is already saved. Override it?</span>
        <span class="row"><button type="button" class="btn sm danger" data-hist-act="override-yes">Override</button>
        <button type="button" class="btn sm ghost" data-hist-act="override-no">Cancel</button></span></div>`
    : '';
  host.innerHTML = `${savedList(state, month, money)}${ask}
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

function remove(month) {
  const saved = isSaved(store.getState(), month);
  drafts.delete(month);
  askDelete = '';
  if (saved) store.update((s) => { s.months = dropMonth(s.months, month); });
  toast(`${saved ? 'Deleted' : 'Discarded'} ${monthLabel(month, 'long')}`);
  if (store.scopeMonth() !== month) return;
  store.setScope('');
  setEntry('', false, null);
  start();
}

/** What a reload needs to pick up where it was left: the entry, its rename and the drafts. */
function work() {
  const month = store.scopeMonth();
  if (!month) return null;
  return {
    month, pay: store.scopePay(), base: store.scopeBase(), entry, movingFrom, overriding,
    drafts: Object.fromEntries(drafts),
  };
}

const MONTH = /^\d{4}-\d{2}$/;
const isPay = (p) => p && typeof p === 'object' && !Array.isArray(p);

/** Restores the entry and drafts from the last visit, or opens a month: the last one worked on, else this month. */
function start(saved = null) {
  const state = store.getState();
  if (saved && MONTH.test(saved.month) && isPay(saved.pay)) {
    drafts.clear();
    for (const [m, p] of Object.entries(saved.drafts ?? {})) if (MONTH.test(m) && isPay(p)) drafts.set(m, p);
    const e = saved.entry ?? {};
    setEntry(MONTH.test(e.home) ? e.home : saved.month, !!(e.saved && state.months[e.home]), isPay(e.base) ? e.base : null);
    movingFrom = MONTH.test(saved.movingFrom) && state.months[saved.movingFrom] ? saved.movingFrom : '';
    overriding = !!saved.overriding && isSaved(state, saved.month);
    store.update((s) => { s.ui.histMonth = saved.month; });
    store.setScope(saved.month, saved.pay, isPay(saved.base) ? saved.base : (state.months[saved.month] ?? saved.pay));
    return;
  }
  const last = state.ui.histMonth;
  open(MONTH.test(last) && (isSaved(state, last) || drafts.has(last)) ? last : monthKey(new Date()));
}

/** After an import or a reset the saved months are new: forget drafts and the entry, then open a month again. */
export function resetEntry() {
  drafts.clear();
  yearToggled.clear();
  clearRename();
  askDelete = '';
  picking = false;
  setEntry('', false, null);
  store.setScope('');
  start();
}

export function initEntry(onChanged) {
  store.setWorkProvider(work);
  start(store.loadedWork);

  onMonthPick('entry', (month) => { picking = false; rename(month); onChanged(); });
  onMonthBack('entry', () => { picking = false; onChanged(); });
  onMonthClose('entry', () => { if (picking) { picking = false; onChanged(); } });

  document.addEventListener('change', (e) => {
    const select = e.target.closest?.('[data-entry-month]');
    if (!select) return;
    if (select.value === CUSTOM) {
      picking = true;
      onChanged();
      openMonthPicker('entry');
      return;
    }
    rename(select.value);
    onChanged();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-entry-save]')) { save(); return onChanged(); }
    const yearHead = e.target.closest('[data-hist-year]');
    if (yearHead) {
      yearToggled.set(yearHead.dataset.histYear, yearHead.getAttribute('aria-expanded') !== 'true');
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
    if (act === 'override-yes') commitSave();
    else if (act === 'override-no') askOverride = false;
    else if (act === 'new') newMonth();
    else if (act === 'delete-yes') remove(askDelete);
    else if (act === 'delete-no') askDelete = '';
    onChanged();
  });
}

export { syncDropdowns };
