const openRows = new Set();
const key = (path, index) => `${path}:${index}`;

const CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

export const isAdvancedOpen = (path, index) => openRows.has(key(path, index));

/** Wraps rarely-changed options in a muted, collapsed "Advanced" block that peeks out below its toggle. */
export function advanced(path, index, innerHtml, label = 'Advanced') {
  const open = isAdvancedOpen(path, index);
  return `<div class="adv${open ? ' open' : ''}">
    <div class="adv-body"${open ? '' : ' inert'}>${innerHtml}</div>
    <button type="button" class="adv-toggle" data-adv="${path}" data-i="${index}" aria-expanded="${open}">${label}${CHEVRON}</button></div>`;
}

export function handleAdvancedToggle(button) {
  const path = button.dataset.adv;
  const index = Number(button.dataset.i);
  const open = !openRows.delete(key(path, index));
  if (open) openRows.add(key(path, index));

  const wrap = button.closest('.adv');
  wrap.classList.toggle('open', open);
  button.setAttribute('aria-expanded', String(open));
  wrap.querySelector('.adv-body').toggleAttribute('inert', !open);
}

/** Keeps the open/closed state aligned with its row after another row of the same list is removed. */
export function shiftAdvancedAfterRemove(path, removed) {
  const prefix = `${path}:`;
  const indexes = [...openRows].filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)));
  indexes.forEach((n) => openRows.delete(key(path, n)));
  indexes.filter((n) => n !== removed).forEach((n) => openRows.add(key(path, n > removed ? n - 1 : n)));
}
