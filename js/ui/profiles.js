import { $, $$, toast } from '../utils/dom.js';
import { clone } from '../utils/object.js';
import { newId } from '../utils/id.js';
import { CURRENCIES } from '../data/defaults.js';
import { validateBrackets } from '../core/incomeTax.js';
import { escapeHtml } from '../utils/format.js';
import * as store from '../state/store.js';
import { optionList } from './form.js';

const ACTIONS = {
  edit() {
    store.set('ui.taxEdit', !store.getState().ui.taxEdit);
  },
  new() {
    const source = store.activeProfile();
    const profile = { ...clone(source), id: newId('p'), name: `${source.name} copy` };
    store.update((s) => {
      s.profiles.push(profile);
      s.profileId = profile.id;
      s.ui.taxEdit = true;
    });
    $('#profileEditor input[data-bind="@.name"]')?.select();
    toast('Profile created — rename and edit it');
  },
  delete() {
    const { profiles } = store.getState();
    if (profiles.length <= 1) return;
    const profile = store.activeProfile();
    if (!confirm(`Delete the "${profile.name}" tax profile?`)) return;
    store.update((s) => {
      s.profiles = s.profiles.filter((p) => p.id !== profile.id);
      s.profileId = s.profiles[0].id;
    });
    toast('Profile deleted');
  },
};

const CUSTOM = '__custom';
const normalizeCode = (value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

function renderCurrency(profile, forceCustom = false) {
  const select = $('#currencySel');
  const input = $('#currencyCustom');
  const custom = forceCustom || !CURRENCIES.includes(profile.currency);
  select.innerHTML = optionList([...CURRENCIES.map((c) => ({ value: c, label: c })), { value: CUSTOM, label: 'Custom…' }],
    custom ? CUSTOM : profile.currency);
  input.hidden = !custom;
  if (custom && document.activeElement !== input) input.value = CURRENCIES.includes(profile.currency) ? '' : profile.currency;
}

function initCurrency(onProfileChanged) {
  $('#currencySel').addEventListener('change', (e) => {
    if (e.target.value === CUSTOM) {
      $('#currencyCustom').hidden = false;
      $('#currencyCustom').value = '';
      $('#currencyCustom').focus();
      return;
    }
    store.set('@.currency', e.target.value);
    onProfileChanged();
  });
  $('#currencyCustom').addEventListener('input', (e) => {
    const code = normalizeCode(e.target.value);
    if (code) store.set('@.currency', code);
  });
  $('#currencyCustom').addEventListener('change', (e) => {
    e.target.value = normalizeCode(e.target.value);
    onProfileChanged();
  });
}

/** `onProfileChanged` re-renders everything tied to the active profile (lists, selects). */
export function initProfiles(onProfileChanged) {
  initCurrency(onProfileChanged);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-profile]');
    if (!btn) return;
    ACTIONS[btn.dataset.profile]();
    onProfileChanged();
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-profile-select]')) {
      store.set('profileId', e.target.value);
      onProfileChanged();
    } else if (e.target.matches('[data-bind="@.name"]')) {
      onProfileChanged();
    }
  });
}

export function syncProfiles(state) {
  const editing = !!state.ui.taxEdit;
  $('#profileEditor').hidden = !editing;
  const edit = $('#editProfileBtn');
  edit.textContent = editing ? 'Done' : 'Edit';
  edit.classList.toggle('primary', editing);
  $('#deleteProfileBtn').hidden = state.profiles.length <= 1;

  const issues = validateBrackets(store.activeProfile().tax.brackets);
  $('#bracketWarn').innerHTML = issues.length
    ? `<div class="callout warn" style="margin-top:8px">${issues.map(escapeHtml).join('<br>')}</div>`
    : '';
  $$('[data-profile-select]').forEach((el) => { if (el.value !== state.profileId) el.value = state.profileId; });
  const editingCode = document.activeElement?.id === 'currencyCustom';
  if (document.activeElement?.id !== 'currencySel') renderCurrency(store.activeProfile(), editingCode);
}
