import { $$ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { CURRENCIES } from '../data/defaults.js';

/**
 * Themed dropdowns that sit on top of native selects (a native popup can't be height-capped or grouped).
 * A `<select data-dd>` stays in the page, hidden, and remains the source of truth: choosing a row sets its value
 * and fires the same `input` and `change` events a native select would, so every existing listener keeps working.
 *
 *  - The list shows at most 5½ rows and scrolls, so the half-visible row hints at more.
 *  - Options whose value is a month ("YYYY-MM") are grouped under expandable year headers once they span more
 *    than one year; only the most recent year (and the year of the current choice) starts expanded.
 *  - `data-dd="currency"` adds a free-text mode: EGP, USD, SAR, AED, EUR, then Custom, which turns the field into
 *    a text box while the arrow on the right stays, to get back to the list.
 */
const CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
const MONTH = /^(\d{4})-\d{2}$/;
const CUSTOM_ROW = '__custom';

const isCurrency = (select) => select.dataset.dd === 'currency';
const wrapperOf = (select) => (select.nextElementSibling?.classList.contains('dd') ? select.nextElementSibling : null);
const selectOf = (wrap) => wrap.previousElementSibling;
const normalizeCode = (value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const optionsOf = (select) => [...select.options].map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }));

function create(select) {
  const wrap = document.createElement('div');
  wrap.className = `dd ${select.className}`.trim();
  const label = select.getAttribute('aria-label') ?? '';
  wrap.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(label)}">
      <span class="dd-label"></span>${CHEVRON}</button>
    ${isCurrency(select) ? `<input class="dd-input" type="text" maxlength="6" placeholder="Code" autocapitalize="characters" spellcheck="false" aria-label="${escapeHtml(label)} code" hidden>` : ''}
    <div class="dd-pop" role="listbox" hidden></div>`;
  select.after(wrap);
  return wrap;
}

/** Month rows grouped by year (newest year first) when they span several years; everything else follows as plain rows. */
function listHtml(select, wrap) {
  const current = select.value;
  const rows = optionsOf(select).filter((o) => !(o.disabled && o.value === '') && (!isCurrency(select) || CURRENCIES.includes(o.value)));
  if (isCurrency(select)) rows.push({ value: CUSTOM_ROW, label: 'Custom' });
  const row = (o, text = o.label) => `<button type="button" class="dd-opt" role="option" data-v="${escapeHtml(o.value)}" aria-selected="${o.value === current}">${escapeHtml(text)}</button>`;

  const months = rows.filter((o) => MONTH.test(o.value));
  const years = [...new Set(months.map((o) => o.value.slice(0, 4)))].sort().reverse();
  if (years.length < 2) return rows.map((o) => row(o)).join('');

  const open = wrap._open;
  const groups = years.map((year) => {
    const inYear = months.filter((o) => o.value.startsWith(year));
    const expanded = open.has(year);
    return `<div class="dd-group"><button type="button" class="dd-year" data-year="${year}" aria-expanded="${expanded}">
        <span>${year}</span><span class="dd-n">${inYear.length}</span>${CHEVRON}</button>
      <div class="dd-items"${expanded ? '' : ' hidden'}>${inYear.map((o) => row(o, o.label.replace(` ${year}`, ''))).join('')}</div></div>`;
  });
  return groups.concat(rows.filter((o) => !MONTH.test(o.value)).map((o) => row(o))).join('');
}

function closeAll(except) {
  $$('.dd-pop:not([hidden])').forEach((pop) => {
    const wrap = pop.parentElement;
    if (wrap === except) return;
    pop.hidden = true;
    wrap.querySelector('.dd-btn').setAttribute('aria-expanded', 'false');
  });
}

function openList(wrap) {
  const select = selectOf(wrap);
  closeAll(wrap);
  const years = optionsOf(select).map((o) => o.value.match(MONTH)?.[0]?.slice(0, 4)).filter(Boolean);
  wrap._open = new Set([years.sort().at(-1), select.value.match(MONTH)?.[0]?.slice(0, 4)].filter(Boolean));
  const pop = wrap.querySelector('.dd-pop');
  pop.innerHTML = listHtml(select, wrap);
  pop.hidden = false;
  wrap.querySelector('.dd-btn').setAttribute('aria-expanded', 'true');
  pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function commit(select, value) {
  if (select.value !== value) {
    if (![...select.options].some((o) => o.value === value)) select.append(new Option(value, value));
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function enterTyping(wrap, select, focus) {
  const input = wrap.querySelector('.dd-input');
  wrap.classList.add('typing');
  input.hidden = false;
  if (focus) {
    input.value = CURRENCIES.includes(select.value) ? '' : select.value;
    input.focus();
  }
}

function leaveTyping(wrap) {
  wrap.classList.remove('typing');
  wrap.querySelector('.dd-input').hidden = true;
}

/** Commits what was typed in the currency field; an empty field goes back to the list. */
function finishTyping(wrap) {
  const select = selectOf(wrap);
  const input = wrap.querySelector('.dd-input');
  const code = normalizeCode(input.value);
  if (!code) {
    if (CURRENCIES.includes(select.value)) leaveTyping(wrap);
    else input.value = select.value;
    return;
  }
  input.value = code;
  if (CURRENCIES.includes(code)) leaveTyping(wrap);
  commit(select, code);
}

function choose(wrap, value) {
  const select = selectOf(wrap);
  closeAll();
  if (value === CUSTOM_ROW) return enterTyping(wrap, select, true);
  if (isCurrency(select)) leaveTyping(wrap);
  commit(select, value);
  update(select, wrap);
  wrap.querySelector('.dd-btn').focus();
}

function update(select, wrap) {
  const selected = select.selectedOptions[0];
  const label = wrap.querySelector('.dd-label');
  label.textContent = selected?.textContent ?? '';
  label.classList.toggle('placeholder', !select.value);
  const btn = wrap.querySelector('.dd-btn');
  btn.disabled = select.disabled;
  btn.title = select.title;
  if (!isCurrency(select)) return;
  const input = wrap.querySelector('.dd-input');
  const custom = !!select.value && !CURRENCIES.includes(select.value);
  if (custom && !wrap.classList.contains('typing')) enterTyping(wrap, select, false);
  if (wrap.classList.contains('typing') && document.activeElement !== input && custom) input.value = select.value;
}

/** Wraps every `select[data-dd]` under `root` and brings each one's label, state and visibility up to date. */
export function syncDropdowns(root = document) {
  $$('select[data-dd]', root).forEach((select) => {
    const wrap = wrapperOf(select) ?? create(select);
    wrap.hidden = select.hidden;
    update(select, wrap);
  });
}

export function initDropdowns() {
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.dd');
    if (!wrap) return closeAll();
    const year = e.target.closest('.dd-year');
    const opt = e.target.closest('.dd-opt');
    if (year) {
      const items = year.nextElementSibling;
      items.hidden = !items.hidden;
      year.setAttribute('aria-expanded', String(!items.hidden));
    } else if (opt) {
      choose(wrap, opt.dataset.v);
    } else if (e.target.closest('.dd-btn')) {
      if (wrap.querySelector('.dd-pop').hidden) openList(wrap);
      else closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
    if (e.key === 'Enter' && e.target.classList?.contains('dd-input')) e.target.blur();
  });

  document.addEventListener('input', (e) => {
    if (e.target.classList?.contains('dd-input')) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.classList?.contains('dd-input')) finishTyping(e.target.closest('.dd'));
  });
}
