import { $, $$, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { clone } from '../utils/object.js';
import { newId } from '../utils/id.js';
import { PRESETS, BLANK_ROWS } from '../data/presets.js';
import { DEFAULT_PROFILE } from '../data/defaults.js';
import { sortOvertime, nextOvertimeType } from '../core/overtime.js';
import * as store from '../state/store.js';
import { fillSelects } from './form.js';
import { ROW_TEMPLATES } from './rows.js';
import { handleAdvancedToggle, shiftAdvancedAfterRemove } from './advanced.js';

const RESET_PATHS = { brackets: ['@.tax.brackets', 'tax.brackets'], caps: ['@.si.caps', 'si.caps'], jobTypes: ['@.jobTypes', 'jobTypes'] };
const AFFECTS_SELECTS = ['@.jobTypes', '@.si.caps'];
const IMPACT_LISTS = ['overtime', 'cashAwards'];

let ctx = { currency: '', money: String, factor: 1, impacts: { overtime: [], cashAwards: [] } };

export function setListContext(next) {
  ctx = next;
  IMPACT_LISTS.forEach(renderList);
}

export function renderList(path) {
  const host = $(`[data-list="${path}"]`);
  if (!host || host.contains(document.activeElement)) return;
  const items = store.get(path);
  if (items.length) host.innerHTML = items.map((item, i) => ROW_TEMPLATES[path](item, i, ctx)).join('');
  else if (host.tagName === 'TBODY') host.innerHTML = '<tr><td colspan="6" class="hint">No rows</td></tr>';
  else host.innerHTML = host.hasAttribute('data-quiet') ? '' : '<div class="empty">Nothing added yet</div>';
  host.hidden = !items.length && host.hasAttribute('data-quiet');
  updateCounts();
}

/** A badge can count several lists, e.g. data-count="incomes,cashAwards". */
function updateCounts() {
  $$('[data-count]').forEach((badge) => {
    const total = badge.dataset.count.split(',').reduce((n, path) => n + store.get(path).length, 0);
    badge.textContent = total ? String(total) : '';
  });
}

export const renderAllLists = () => Object.keys(ROW_TEMPLATES).forEach(renderList);

function renderPresets() {
  $$('[data-presets]').forEach((host) => {
    const kind = host.dataset.presets;
    host.innerHTML = PRESETS[kind]
      .map((p, i) => `<button class="chip" data-preset="${kind}" data-i="${i}">+ ${escapeHtml(p.name)}</button>`)
      .join('');
  });
}

function focusFirstEmpty(path) {
  const inputs = $$(`[data-list="${path}"] input[type="text"]:not([disabled])`);
  (inputs.reverse().find((el) => !el.value) ?? inputs[0])?.focus();
}

function refresh(path) {
  const host = $(`[data-list="${path}"]`);
  if (host?.contains(document.activeElement)) document.activeElement.blur();
  renderList(path);
  if (AFFECTS_SELECTS.includes(path)) fillSelects(store.view());
}

function newRow(path) {
  if (path === 'overtime') {
    const type = nextOvertimeType(store.get('overtime'));
    return type ? { type: type.id, mult: type.mult, hours: '' } : { type: 'custom', mult: '1.5', hours: '' };
  }
  if (path === 'cashAwards') return { ...clone(BLANK_ROWS.cashAwards), currency: store.activeProfile().currency === 'USD' ? 'EGP' : 'USD' };
  const row = clone(BLANK_ROWS[path]);
  if (path === '@.jobTypes') row.id = newId('j');
  return row;
}

const ACTIONS = {
  add(path) {
    store.update(() => {
      store.get(path).push(newRow(path));
      if (path === 'overtime') sortOvertime(store.get(path));
    });
    refresh(path);
    focusFirstEmpty(path);
  },
  del(path, index) {
    if (path === '@.jobTypes' && store.get(path).length <= 1) return toast('Keep at least one job type');
    store.update(() => store.get(path).splice(index, 1));
    shiftAdvancedAfterRemove(path, index);
    refresh(path);
  },
  preset(kind, index) {
    store.update(() => store.get(kind).push(clone(PRESETS[kind][index])));
    refresh(kind);
    focusFirstEmpty(kind);
  },
  reset(key) {
    const [path, profileKey] = RESET_PATHS[key];
    const source = profileKey.split('.').reduce((o, k) => o[k], DEFAULT_PROFILE);
    store.set(path, clone(source));
    refresh(path);
    toast('Restored Egypt defaults');
  },
};

function onOvertimeTypeChange(index, type) {
  store.update(() => {
    const list = store.get('overtime');
    const item = list[index];
    if (type !== 'custom') item.mult = '';
    sortOvertime(list);
  });
  refresh('overtime');
  if (type === 'custom') {
    const row = store.get('overtime').findIndex((o) => o.type === 'custom' && !o.mult);
    $(`[data-path="overtime.${row >= 0 ? row : 0}.mult"]`)?.focus();
  }
}

export function initLists() {
  renderPresets();
  renderAllLists();

  // Selects are saved on `change` only: saving on `input` re-renders the row and the `change` event would be lost.
  document.addEventListener('input', (e) => {
    const path = e.target.dataset.path;
    if (path && e.target.tagName !== 'SELECT') store.set(path, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  });

  document.addEventListener('change', (e) => {
    const path = e.target.dataset.path ?? '';
    if (path && e.target.tagName === 'SELECT') store.set(path, e.target.value);
    const ot = path.match(/^overtime\.(\d+)\.(type|mult)$/);
    if (ot) {
      if (ot[2] === 'type') return onOvertimeTypeChange(Number(ot[1]), e.target.value);
      store.update(() => sortOvertime(store.get('overtime')));
      return refresh('overtime');
    }
    if (/^cashAwards\.\d+\.currency$/.test(path)) return refresh('cashAwards');
    if (AFFECTS_SELECTS.some((src) => path.startsWith(`${src}.`))) fillSelects(store.view());
  });

  document.addEventListener('focusout', (e) => {
    const host = e.target.closest?.('[data-list]');
    if (host && IMPACT_LISTS.includes(host.dataset.list)) setTimeout(() => renderList(host.dataset.list));
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.adv) return handleAdvancedToggle(btn);
    const { add, del, preset, reset, i } = btn.dataset;
    if (add) ACTIONS.add(add);
    else if (del) ACTIONS.del(del, Number(i));
    else if (preset) ACTIONS.preset(preset, Number(i));
    else if (reset) ACTIONS.reset(reset);
  });
}
