import { $ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { monthLabel, monthList } from '../core/index.js';

/**
 * What to export: All, or any mix of years and months, chosen from a dropdown laid out like the month dropdowns
 * (years with their months under them). Clicking a year's name chooses the whole year; its arrow only opens or
 * closes it, and every year can be closed. "Select several" is on by default, so each click adds or removes a
 * year or month; with it off, a click chooses one thing and Ctrl/⌘+click adds or removes.
 */
let selection = 'all';
let several = true;
let open = false;
/** Years the user opened or closed; untouched years follow the default (only the open month's year is open). */
const toggled = new Map();

const CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

export const exportSelection = () => selection;

function label() {
  if (selection === 'all') return 'All months';
  if (!selection.length) return 'Nothing chosen';
  const parts = selection.map((s) => (s.length === 4 ? s : monthLabel(s)));
  return parts.length > 3 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2} more` : parts.join(', ');
}

const isChosen = (key) => selection !== 'all' && selection.includes(key);

function toggle(key, add) {
  if (key === 'all') { selection = 'all'; return; }
  const current = selection === 'all' ? [] : [...selection];
  if (!add) { selection = [key]; return; }
  const at = current.indexOf(key);
  if (at === -1) current.push(key); else current.splice(at, 1);
  // A year chosen covers its months; drop months already inside a chosen year.
  const years = current.filter((k) => k.length === 4);
  selection = current.filter((k) => k.length === 4 || !years.includes(k.slice(0, 4)));
  if (!selection.length) selection = 'all';
}

export function renderExportPick(state, activeMonth = '') {
  const host = $('#exportPick');
  if (!host) return;
  const months = monthList(state.months);
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const now = String(new Date().getFullYear());
  const defaultYear = activeMonth.slice(0, 4) || (years.includes(now) ? now : years[0]);
  const isYearOpen = (y) => toggled.get(y) ?? y === defaultYear;
  const mark = (on) => `<span class="pick-box${on ? ' on' : ''}" aria-hidden="true"></span>`;
  const rows = years.map((y) => {
    const inYear = months.filter((m) => m.startsWith(y));
    const isOpen = isYearOpen(y);
    return `<div class="pick-year">
      <div class="pick-row year${isChosen(y) ? ' on' : ''}">
        <button type="button" class="pick-item" data-pick="${y}">${several ? mark(isChosen(y)) : ''}<b>${y}</b><span class="hint">${inYear.length}</span></button>
        <button type="button" class="pick-arrow${isOpen ? ' open' : ''}" data-pick-arrow="${y}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Close' : 'Open'} ${y}">${CHEVRON}</button>
      </div>
      ${isOpen ? inYear.map((m) => `<div class="pick-row${isChosen(m) || isChosen(y) ? ' on' : ''}"><button type="button" class="pick-item month" data-pick="${m}">${several ? mark(isChosen(m) || isChosen(y)) : ''}${escapeHtml(monthLabel(m, 'long'))}</button></div>`).join('') : ''}
    </div>`;
  }).join('');
  host.innerHTML = `<button type="button" class="pick-btn" data-pick-toggle aria-haspopup="listbox" aria-expanded="${open}"><span>${escapeHtml(label())}</span>${CHEVRON}</button>
    <div class="pick-pop"${open ? '' : ' hidden'}>
      <label class="check pick-several"><input type="checkbox" data-pick-several${several ? ' checked' : ''}> Select several</label>
      <div class="pick-row all${selection === 'all' ? ' on' : ''}"><button type="button" class="pick-item" data-pick="all">${several ? mark(selection === 'all') : ''}<b>All months</b><span class="hint">${months.length}</span></button></div>
      ${rows || '<div class="hint">No saved months yet.</div>'}
      ${several ? '' : '<div class="hint pick-tip">Ctrl / ⌘ + click to choose several.</div>'}
    </div>`;
}

export function initExportPick(getState, getMonth = () => '') {
  const redraw = () => renderExportPick(getState(), getMonth());
  document.addEventListener('click', (e) => {
    const host = $('#exportPick');
    if (!host) return;
    if (!host.contains(e.target)) { if (open) { open = false; redraw(); } return; }
    if (e.target.closest('[data-pick-toggle]')) { open = !open; return redraw(); }
    const arrow = e.target.closest('[data-pick-arrow]');
    if (arrow) {
      const y = arrow.dataset.pickArrow;
      toggled.set(y, arrow.getAttribute('aria-expanded') !== 'true');
      return redraw();
    }
    const item = e.target.closest('[data-pick]');
    if (item) {
      const add = several || e.ctrlKey || e.metaKey;
      toggle(item.dataset.pick, add && item.dataset.pick !== 'all');
      if (!add) open = false;
      return redraw();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-pick-several]')) { several = e.target.checked; redraw(); }
  });
}
