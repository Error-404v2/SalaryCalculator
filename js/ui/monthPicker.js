import { $$ } from '../utils/dom.js';
import { monthKey, monthLabel } from '../core/index.js';

/**
 * A month picker drawn in the app's own theme (the browser's calendar popup can't be styled).
 * `monthPickerHtml` returns the markup; the page-wide listeners below open it, change year and report a pick.
 */
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

const open = { id: '', year: 0 };
const handlers = new Map();

export const onMonthPick = (id, fn) => handlers.set(id, fn);

function popHtml(year, value, saved) {
  const now = monthKey(new Date());
  const cells = SHORT.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const cls = ['mpick-cell', key === value ? 'on' : '', saved.includes(key) ? 'has' : '', key === now ? 'now' : ''].join(' ');
    return `<button type="button" class="${cls}" data-mp-pick="${key}" aria-label="${monthLabel(key, 'long')}">${name}</button>`;
  }).join('');
  return `<div class="mpick-year">
      <button type="button" class="btn icon ghost" data-mp-year="-1" aria-label="Previous year">‹</button>
      <b>${year}</b>
      <button type="button" class="btn icon ghost" data-mp-year="1" aria-label="Next year">›</button>
    </div><div class="mpick-grid">${cells}</div>`;
}

/** `saved` lists months to mark with a dot (months that already hold something). */
export function monthPickerHtml(id, value, saved = []) {
  const shown = value || monthKey(new Date());
  const isOpen = open.id === id;
  const year = isOpen ? open.year : Number(shown.slice(0, 4));
  return `<div class="mpick" data-mpick="${id}" data-value="${shown}" data-saved="${saved.join(',')}">
    <button type="button" class="mpick-btn" data-mp-toggle="${id}" aria-haspopup="true" aria-expanded="${isOpen}">
      <span>${monthLabel(shown, 'long')}</span>${CHEVRON}</button>
    <div class="mpick-pop"${isOpen ? '' : ' hidden'}>${popHtml(year, shown, saved)}</div>
  </div>`;
}

export function renderMonthPicker(host, id, value, saved = []) {
  host.innerHTML = monthPickerHtml(id, value, saved);
}

function closeAll() {
  open.id = '';
  $$('.mpick-pop').forEach((p) => (p.hidden = true));
  $$('.mpick-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function refill(root) {
  root.querySelector('.mpick-pop').innerHTML = popHtml(open.year, root.dataset.value, root.dataset.saved.split(',').filter(Boolean));
}

export function initMonthPickers() {
  document.addEventListener('click', (e) => {
    const root = e.target.closest('.mpick');
    if (!root) return closeAll();
    const id = root.dataset.mpick;

    if (e.target.closest('[data-mp-toggle]')) {
      const wasOpen = open.id === id;
      closeAll();
      if (wasOpen) return;
      open.id = id;
      open.year = Number(root.dataset.value.slice(0, 4));
      refill(root);
      root.querySelector('.mpick-pop').hidden = false;
      root.querySelector('.mpick-btn').setAttribute('aria-expanded', 'true');
      return;
    }
    const step = e.target.closest('[data-mp-year]');
    if (step) {
      open.year += Number(step.dataset.mpYear);
      return refill(root);
    }
    const pick = e.target.closest('[data-mp-pick]');
    if (pick) {
      closeAll();
      handlers.get(id)?.(pick.dataset.mpPick);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}
