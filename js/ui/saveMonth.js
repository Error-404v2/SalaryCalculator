import { $, toast } from '../utils/dom.js';
import { toNumber } from '../utils/number.js';
import { monthKey, monthLabel, monthList, nearestFirst, putMonth, snapshotPay, grossPay } from '../core/index.js';
import { monthPickerHtml, onMonthPick, onMonthBack, openMonthPicker } from './monthPicker.js';
import * as store from '../state/store.js';

const CUSTOM = 'custom';

/**
 * Save Month, in the tab bar on the Pay tab. One line: Done, Cancel, and on the right a dropdown of saved
 * months (nearest first) ending in "Custom…", which swaps the dropdown for the themed month picker.
 * Done stores a full copy of the Pay tab under the chosen month (asking first before overriding one) and
 * then opens that month on the History tab.
 */
export function initSaveMonth(onChanged, onSaved) {
  const panel = $('#saveMonthPanel');
  const select = $('#saveMonthSel');
  const pickHost = $('#saveMonthPickHost');
  const ask = $('#saveMonthAsk');
  let custom = '';
  let pending = '';

  function close() {
    panel.hidden = true;
    ask.hidden = true;
    pending = '';
  }

  const chosen = () => (select.value === CUSTOM ? custom : select.value);

  function drawPicker() {
    pickHost.innerHTML = monthPickerHtml('save', custom, monthList(store.getState().months));
    pickHost.hidden = false;
    select.hidden = true;
  }

  /** Back to the dropdown, starting over from its first choice. */
  function showList() {
    pickHost.hidden = true;
    pickHost.innerHTML = '';
    select.hidden = false;
    select.selectedIndex = 0;
    ask.hidden = true;
  }

  function commit(month) {
    const state = store.getState();
    if (!toNumber(state.amount)) return toast('Enter a gross salary first');
    const replaced = !!state.months[month];
    const pay = grossPay(snapshotPay(state), { ...state, profile: store.activeProfile() });
    store.update((s) => { s.months = putMonth(s.months, month, pay); s.ui.histMonth = month; });
    close();
    toast(`${replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
    onSaved(month);
  }

  function done() {
    const month = chosen();
    if (!month) return;
    if (!store.getState().months[month]) return commit(month);
    pending = month;
    $('#saveMonthAskText').textContent = `${monthLabel(month, 'long')} is already saved. Override it?`;
    ask.hidden = false;
  }

  function open() {
    const now = monthKey(new Date());
    const months = nearestFirst(monthList(store.getState().months), now);
    select.innerHTML = [
      `<option value="" disabled>Choose a month…</option>`,
      ...months.map((m) => `<option value="${m}">${monthLabel(m, 'long')}</option>`),
      `<option value="${CUSTOM}">Custom…</option>`,
    ].join('');
    select.value = months.includes(now) ? now : '';
    custom = now;
    pickHost.hidden = true;
    select.hidden = false;
    ask.hidden = true;
    panel.hidden = false;
  }

  $('#saveMonthBtn').addEventListener('click', () => (panel.hidden ? open() : close()));

  select.addEventListener('change', () => {
    ask.hidden = true;
    if (select.value !== CUSTOM) return;
    drawPicker();
    openMonthPicker('save');
  });
  onMonthBack('save', showList);

  onMonthPick('save', (month) => {
    custom = month;
    drawPicker();
    ask.hidden = true;
  });

  $('#saveMonthGo').addEventListener('click', done);
  $('#saveMonthYes').addEventListener('click', () => { if (pending) commit(pending); });
  $('#saveMonthNo').addEventListener('click', () => { ask.hidden = true; pending = ''; });
  $('#saveMonthCancel').addEventListener('click', close);
}

/** Save Month belongs to the Pay tab; the History tab has its own Save. */
export function syncSaveMonth(state) {
  const onPay = state.ui.inTab === 'pay';
  $('#saveMonthBtn').hidden = !onPay;
  if (!onPay) $('#saveMonthPanel').hidden = true;
}
