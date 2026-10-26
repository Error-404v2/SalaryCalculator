import { $, toast } from '../utils/dom.js';
import { monthKey, monthLabel, monthsInHistory, nearestFirst, hasMonth, saveMonth } from '../core/index.js';
import * as store from '../state/store.js';
import { currentValues } from './history.js';

/**
 * Save Month, on the Pay tab. Opens a dropdown of saved months (nearest first) plus "Custom…", which shows a
 * calendar. Saving over an existing month asks first, inline.
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
    const result = saveMonth(state.history, month, currentValues(state));
    if (!result.saved) return toast('Nothing to save — fill the Pay tab first');
    store.update((s) => { s.history = result.history; });
    close();
    toast(`${result.replaced ? 'Updated' : 'Saved'} ${monthLabel(month, 'long')}`);
    onChanged();
  }

  function save(month) {
    if (!hasMonth(store.getState().history, month)) return commit(month);
    pending = month;
    $('#saveMonthAskText').textContent = `${monthLabel(month, 'long')} is already saved. Override it?`;
    ask.hidden = false;
  }

  $('#saveMonthBtn').addEventListener('click', () => {
    const now = monthKey(new Date());
    const months = nearestFirst(monthsInHistory(store.getState().history), now);
    select.innerHTML = [
      '<option value="custom">Custom…</option>',
      ...months.map((m) => `<option value="${m}">${monthLabel(m, 'long')}</option>`),
    ].join('');
    select.value = 'custom';
    picker.value = now;
    picker.hidden = true;
    ask.hidden = true;
    panel.hidden = false;
  });

  select.addEventListener('change', () => {
    ask.hidden = true;
    if (select.value === 'custom') {
      picker.hidden = false;
      picker.showPicker?.();
    } else save(select.value);
  });

  picker.addEventListener('change', () => { if (picker.value) save(picker.value); });
  $('#saveMonthYes').addEventListener('click', () => { if (pending) commit(pending); });
  $('#saveMonthNo').addEventListener('click', () => { ask.hidden = true; pending = ''; });
  $('#saveMonthCancel').addEventListener('click', close);
}
