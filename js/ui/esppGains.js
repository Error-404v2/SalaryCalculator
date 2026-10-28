import { $, $$, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import {
  monthKey, monthLabel, monthChoices, addGainMonth, setGain, removeGain, moveGain, freeGainMonth,
} from '../core/index.js';
import { monthPickerHtml, onMonthPick, onMonthBack, onMonthClose, openMonthPicker } from './monthPicker.js';
import * as store from '../state/store.js';

/**
 * ESPP Gains list (ESPP tab, under Assumptions): one compact line per payslip month, newest first.
 *   Month (dropdown like Save Month)  ·  Tax (worked out from that month)  ·  Payslip gain (typed, else History, else 0)
 * A History month that carries an ESPP gain is listed by itself; other months are added with "+ Add entry".
 */
const CUSTOM = 'custom';
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/** The row whose month dropdown is swapped for the themed month picker ("Custom…"). */
let pickerFor = '';

const plain = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const taxText = (row, money) => (row.tax > 0 ? `− ${money(row.tax)}` : money(0));
const takenMonths = () => new Set($$('[data-gain-row]').map((r) => r.dataset.gainRow));

/** Saved History months nearest first (like Save Month), this row's own month, then Custom…, which opens the picker. */
function monthControl(row, taken, historyMonths) {
  if (pickerFor === row.month) return monthPickerHtml('gain', row.month, Object.keys(historyMonths));
  const options = monthChoices(historyMonths, monthKey(new Date()), row.month)
    .filter((c) => c.month === row.month || !taken.has(c.month))
    .map((c) => `<option value="${c.month}"${c.month === row.month ? ' selected' : ''}>${monthLabel(c.month, 'long')}${c.saved ? '' : ' (not saved)'}</option>`)
    .join('');
  const locked = row.derived ? ' disabled title="This month comes from History"' : '';
  return `<select class="sm" data-gain-month="${row.month}" aria-label="Month"${locked}>${options}<option value="${CUSTOM}">Custom…</option></select>`;
}

function rowHtml(row, taken, historyMonths, money) {
  const m = row.month;
  const name = monthLabel(m, 'long');
  const typed = row.typedValue !== '';
  const fromHistory = row.historyGain > 0;
  const title = typed
    ? 'Your value — clear it to use History again'
    : fromHistory
      ? `From History (${monthLabel(m)}) — type a value to override it`
      : 'Nothing in History for this month — type the payslip gain';
  return `<div class="gain-row" data-gain-row="${m}">
    <div class="gain-month">${monthControl(row, taken, historyMonths)}</div>
    <span class="gain-tax" data-gain-tax="${m}" title="Extra income tax this gain causes">${taxText(row, money)}</span>
    <input type="text" inputmode="decimal" data-gain-input="${m}"${typed ? ' class="typed"' : ''} value="${escapeHtml(row.typedValue)}"
      placeholder="${fromHistory ? plain(row.historyGain) : '0'}" aria-label="Payslip gain ${name}" title="${escapeHtml(title)}">
    ${row.derived ? '<span></span>'
    : `<button type="button" class="btn icon ghost danger" data-gain-del="${m}" aria-label="Remove ${name}" title="Remove entry">${CROSS}</button>`}
  </div>`;
}

export function renderGainEntries(rep, money) {
  const host = $('[data-espp-gains]');
  if (!host) return;
  $('[data-gains-count]').textContent = rep.gains.length ? String(rep.gains.length) : '';

  // Typing in a row only refreshes the taxes, so the field keeps focus.
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') {
    rep.gains.forEach((g) => {
      const el = host.querySelector(`[data-gain-tax="${g.month}"]`);
      if (el) el.textContent = taxText(g, money);
    });
    return;
  }

  const taken = new Set(rep.gains.map((g) => g.month));
  const currency = escapeHtml(store.activeProfile().currency);
  host.innerHTML = rep.gains.length
    ? `<div class="gain-list">
        <div class="gain-head"><span>Month</span><span class="r">Gain tax ${currency}</span><span class="r">Payslip gain ${currency}</span><span></span></div>
        ${rep.gains.map((g) => rowHtml(g, taken, rep.historyMonths, money)).join('')}</div>`
    : '<div class="hint">No ESPP gains yet. A History month with an ESPP gain shows up here by itself.</div>';
}

export function initGainEntries(onChanged) {
  const edit = (fn) => { store.update((s) => fn(s.espp)); onChanged(); };

  function moveTo(from, to) {
    if (!from || !to || from === to) return onChanged();
    if (takenMonths().has(to)) {
      toast(`${monthLabel(to, 'long')} already has an entry`);
      return onChanged();
    }
    edit((espp) => moveGain(espp, from, to));
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-gain-add]')) {
      const month = freeGainMonth(takenMonths());
      edit((espp) => addGainMonth(espp, month));
      $(`[data-gain-input="${month}"]`)?.focus();
      return;
    }
    const del = e.target.closest('[data-gain-del]');
    if (del) edit((espp) => removeGain(espp, del.dataset.gainDel));
  });

  document.addEventListener('change', (e) => {
    const select = e.target.closest?.('[data-gain-month]');
    if (!select) return;
    if (select.value !== CUSTOM) return moveTo(select.dataset.gainMonth, select.value);
    pickerFor = select.dataset.gainMonth;
    onChanged();
    openMonthPicker('gain');
  });
  onMonthPick('gain', (month) => {
    const from = pickerFor;
    pickerFor = '';
    moveTo(from, month);
  });
  onMonthBack('gain', () => { pickerFor = ''; onChanged(); });
  onMonthClose('gain', () => { if (pickerFor) { pickerFor = ''; onChanged(); } });

  document.addEventListener('input', (e) => {
    const month = e.target.dataset?.gainInput;
    if (month) store.update((s) => setGain(s.espp, month, e.target.value));
  });
  // Once the field is left, redraw so the row re-sorts and shows whether it holds your value or History's.
  document.addEventListener('focusout', (e) => {
    if (e.target.dataset?.gainInput) setTimeout(onChanged);
  });
}
