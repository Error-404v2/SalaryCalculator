import { $ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { monthLabel, monthList } from '../core/index.js';

/**
 * What to export: All months, or any mix of years and months, chosen from a dropdown laid out like the month
 * dropdowns (years with their months under them). Each click adds or removes a year or month; clicking a year's
 * name chooses the whole year, its arrow only opens or closes it, and every year can be closed.
 */
let selection = 'all';
let open = false;
/** Years the user opened or closed; untouched years follow the default (only the open month's year is open). */
const toggled = new Map();

const CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

export const exportSelection = () => selection;

function label() {
  if (selection === 'all') return 'All months';
  const parts = selection.map((s) => (s.length === 4 ? s : monthLabel(s)));
  return parts.length > 3 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2} more` : parts.join(', ');
}

const isChosen = (key) => selection !== 'all' && selection.includes(key);

/** Adds or removes `key` ("all", a year or a month). Nothing left chosen means All months again. */
function toggle(key) {
  if (key === 'all') { selection = 'all'; return; }
  const current = selection === 'all' ? [] : [...selection];
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
        <button type="button" class="pick-item" data-pick="${y}">${mark(isChosen(y))}<b>${y}</b><span class="hint">${inYear.length}</span></button>
        <button type="button" class="pick-arrow${isOpen ? ' open' : ''}" data-pick-arrow="${y}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Close' : 'Open'} ${y}">${CHEVRON}</button>
      </div>
      ${isOpen ? inYear.map((m) => `<div class="pick-row${isChosen(m) || isChosen(y) ? ' on' : ''}"><button type="button" class="pick-item month" data-pick="${m}">${mark(isChosen(m) || isChosen(y))}${escapeHtml(monthLabel(m, 'long'))}</button></div>`).join('') : ''}
    </div>`;
  }).join('');
  host.innerHTML = `<button type="button" class="pick-btn" data-pick-toggle aria-haspopup="listbox" aria-expanded="${open}"><span>${escapeHtml(label())}</span>${CHEVRON}</button>
    <div class="pick-pop"${open ? '' : ' hidden'}>
      <div class="pick-row all${selection === 'all' ? ' on' : ''}"><button type="button" class="pick-item" data-pick="all">${mark(selection === 'all')}<b>All months</b><span class="hint">${months.length}</span></button></div>
      ${rows || '<div class="hint">No saved months yet.</div>'}
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
      toggled.set(arrow.dataset.pickArrow, arrow.getAttribute('aria-expanded') !== 'true');
      return redraw();
    }
    const item = e.target.closest('[data-pick]');
    if (item) { toggle(item.dataset.pick); redraw(); }
  });
}
