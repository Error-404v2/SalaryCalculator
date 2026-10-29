import { $, $$ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { SAVINGS_COLORS } from '../core/index.js';
import { newId } from '../utils/id.js';
import * as store from '../state/store.js';

/**
 * Savings editor (Savings tab, collapsible): one line per saving — drag handle, name, %, colour, remove.
 * Rows are rebuilt only when the list changes; typing updates the state (and the chart) in place.
 * Reordering uses pointer events on the handle, so it works with mouse and touch alike.
 */
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const GRIP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';

const host = () => $('[data-savings-list]');
const idOf = (el) => el.closest('[data-sv]')?.dataset.sv;

function rowHtml(s) {
  const name = escapeHtml(s.name || 'saving');
  return `<div class="sv-row" data-sv="${escapeHtml(s.id)}">
    <button type="button" class="sv-grip" data-sv-grip aria-label="Drag to reorder ${name}" title="Drag to reorder">${GRIP}</button>
    <input type="text" data-sv-name value="${escapeHtml(s.name)}" placeholder="Name" maxlength="40" aria-label="Saving name">
    <input type="text" inputmode="decimal" data-sv-pct value="${escapeHtml(s.pct)}" placeholder="0" aria-label="Percentage of net pay">
    <input type="color" data-sv-color value="${escapeHtml(s.color)}" aria-label="Colour for ${name}">
    <button type="button" class="btn icon ghost danger" data-sv-del aria-label="Remove ${name}" title="Remove">${CROSS}</button>
  </div>`;
}

export function renderSavingsEditor(state = store.getState()) {
  const el = host();
  if (!el) return;
  // Typing in a row must not rebuild it (the field would lose focus).
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const list = state.savings;
  $('[data-savings-count]').textContent = list.length ? String(list.length) : '';
  el.innerHTML = list.length
    ? `<div class="sv-head"><span></span><span>Name</span><span class="r">%</span><span>Colour</span><span></span></div>${list.map(rowHtml).join('')}`
    : '<div class="hint">No savings yet.</div>';
}

export function initSavingsEditor(onChanged) {
  const edit = (id, fn) => store.update((s) => { const item = s.savings.find((x) => x.id === id); if (item) fn(item); });

  document.addEventListener('input', (e) => {
    const id = e.target.closest?.('[data-sv]') && idOf(e.target);
    if (!id) return;
    if (e.target.matches('[data-sv-name]')) edit(id, (i) => { i.name = e.target.value; });
    else if (e.target.matches('[data-sv-pct]')) {
      e.target.value = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      edit(id, (i) => { i.pct = e.target.value; });
    } else if (e.target.matches('[data-sv-color]')) edit(id, (i) => { i.color = e.target.value; });
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sv-add]')) {
      store.update((s) => {
        const color = SAVINGS_COLORS[s.savings.length % SAVINGS_COLORS.length];
        s.savings.push({ id: newId('sv'), name: '', pct: '', color });
      });
      onChanged();
      host().querySelector('.sv-row:last-child [data-sv-name]')?.focus();
      return;
    }
    const del = e.target.closest('[data-sv-del]');
    if (del) {
      const id = idOf(del);
      store.update((s) => { s.savings = s.savings.filter((x) => x.id !== id); });
      onChanged();
    }
  });

  // Drag to reorder: the lifted row follows the pointer (transform only, so capture is never lost),
  // the other rows slide out of its way, and on release it settles into its slot before the order is saved.
  document.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-sv-grip]');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = grip.closest('.sv-row');
    const rows = $$('.sv-row', host());
    const from = rows.indexOf(row);
    const tops = rows.map((r) => r.offsetTop);
    const startY = e.clientY;
    const min = tops[0] - tops[from];
    const max = tops[rows.length - 1] - tops[from];
    let target = from;
    let dy = 0;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    host().classList.add('sorting');
    row.classList.add('dragging');

    const place = () => {
      row.style.transform = `translateY(${dy}px) scale(1.015)`;
      const mid = tops[from] + dy + row.offsetHeight / 2;
      target = tops.reduce((best, top, i) => (mid >= top ? i : best), 0);
      rows.forEach((r, i) => {
        if (r === row) return;
        const shift = from < target && i > from && i <= target ? tops[i - 1] - tops[i]
          : from > target && i < from && i >= target ? tops[i + 1] - tops[i] : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const move = (ev) => {
      dy = Math.min(Math.max(ev.clientY - startY, min), max);
      place();
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      row.classList.remove('dragging');
      row.classList.add('settling');
      row.style.transform = `translateY(${tops[target] - tops[from]}px)`;
      const done = () => {
        const id = row.dataset.sv;
        store.update((s) => {
          const [item] = s.savings.splice(from, 1);
          s.savings.splice(target, 0, item);
        });
        onChanged();
        host().querySelector(`[data-sv="${id}"] [data-sv-grip]`)?.focus({ preventScroll: true });
      };
      setTimeout(done, 170);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });

  // Keyboard: arrows on the handle move the saving up or down.
  document.addEventListener('keydown', (e) => {
    const grip = e.target.closest?.('[data-sv-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const id = idOf(grip);
    store.update((s) => {
      const i = s.savings.findIndex((x) => x.id === id);
      const j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (i < 0 || j < 0 || j >= s.savings.length) return;
      [s.savings[i], s.savings[j]] = [s.savings[j], s.savings[i]];
    });
    onChanged();
    host().querySelector(`[data-sv="${id}"] [data-sv-grip]`)?.focus();
  });
}
