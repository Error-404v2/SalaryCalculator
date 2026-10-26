import { $, $$ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { PERIODS } from '../core/periods.js';
import * as store from '../state/store.js';

export const periodOptions = (selected, periods = PERIODS) =>
  periods.map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${p.label}</option>`).join('');

export const optionList = (items, selected) =>
  items.map(({ value, label }) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');

const readValue = (el) => (el.type === 'checkbox' ? el.checked : el.value);

export function initBindings() {
  document.addEventListener('input', (e) => {
    const path = e.target.dataset.bind;
    if (path) store.set(path, readValue(e.target));
  });
  $$('[data-seg]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]');
      if (btn) store.set(seg.dataset.seg, btn.dataset.v);
    });
  });
}

export function syncBindings(state) {
  $$('[data-bind]').forEach((el) => {
    const value = store.get(el.dataset.bind);
    if (el.type === 'checkbox') el.checked = !!value;
    else if (document.activeElement !== el) el.value = value ?? '';
  });
  $$('[data-seg]').forEach((seg) => {
    const value = store.get(seg.dataset.seg);
    $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  });

  const solvingNet = state.mode === 'net';
  $('#amountLabel').textContent = solvingNet ? 'Desired net pay' : 'Gross salary';
  $('#amountHint').textContent = solvingNet ? 'Target take-home; gross is solved for you.' : 'Basic salary before any deductions.';
}

/** Selects whose options come from state (periods, job types, years, profiles). */
export function fillSelects(state) {
  const profile = store.activeProfile();
  $('#perSel').innerHTML = periodOptions(state.per);
  $('#ovPer').innerHTML = periodOptions(state.overrides.taxablePer);

  if (!profile.jobTypes.some((j) => j.id === state.jobType) && profile.jobTypes[0]) state.jobType = profile.jobTypes[0].id;
  $('#jobSel').innerHTML = optionList(profile.jobTypes.map((j) => ({ value: j.id, label: j.name })), state.jobType);

  const years = new Set(profile.si.caps.map((c) => String(c.year)).filter(Boolean));
  years.add(String(state.year));
  $('#yearSel').innerHTML = optionList([...years].sort().map((y) => ({ value: y, label: y })), String(state.year));

  const profiles = state.profiles.map((p) => ({ value: p.id, label: p.name || 'Untitled' }));
  $$('.profile-select').forEach((el) => (el.innerHTML = optionList(profiles, state.profileId)));
}
