import { $, toast } from '../utils/dom.js';
import { toNumber } from '../utils/number.js';
import { monthKey, monthLabel, monthList, nearestFirst, putMonth, snapshotPay } from '../core/index.js';
import * as store from '../state/store.js';

/**
 * Save Month, in the tab bar on the Pay tab. Stores a full copy of the Pay tab under a month: pick a saved
 * month (nearest first) or "Custom…" for any month. Saving over an existing month asks first, inline.
 */
export function initSaveMonth(onChanged) {
  const panel = $('#saveMonthPanel');
  const select = $('#saveMonthSel');
  const picker = $('#saveMonthPick');
  const ask = $('#saveMonthAsk');
  let pending = '';

  function close() {
    panel.hidden = true;
    ask.hidden = true;
    pending = '';
  }

  function commit(month) {
    const state = store.getState();
    if (!toNumber(state.amount)) return toast('Enter a gross salary first');
    const replaced = !!state.months[month];
    store.update((s) => { s.months = putMonth(s.months, month, snapshotPay(s)); });
    close();
    toast(`${replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
    onChanged();
  }

  function save(month) {
    if (!store.getState().months[month]) return commit(month);
    pending = month;
    $('#saveMonthAskText').textContent = `${monthLabel(month, 'long')} is already saved. Override it?`;
    ask.hidden = false;
  }

  $('#saveMonthBtn').addEventListener('click', () => {
    const now = monthKey(new Date());
    const months = nearestFirst(monthList(store.getState().months), now);
    select.innerHTML = [
      '<option value="custom">Custom…</option>',
      ...months.map((m) => `<option value="${m}">${monthLabel(m, 'long')}</option>`),
    ].join('');
    select.value = 'custom';
    picker.value = now;
    picker.hidden = false;
    ask.hidden = true;
    panel.hidden = !panel.hidden;
  });

  select.addEventListener('change', () => {
    ask.hidden = true;
    picker.hidden = select.value !== 'custom';
    if (select.value === 'custom') picker.showPicker?.();
    else save(select.value);
  });

  picker.addEventListener('change', () => { if (picker.value) save(picker.value); });
  $('#saveMonthGo').addEventListener('click', () => save(select.value === 'custom' ? picker.value : select.value));
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
