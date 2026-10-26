import { $$ } from '../utils/dom.js';
import * as store from '../state/store.js';

/** One delegated listener, so collapsibles drawn later (e.g. in the History list) also remember their state. */
export function initCollapsibles() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('summary [data-stop]')) e.stopPropagation();
  }, true);
  document.addEventListener('toggle', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.open) return;
    const path = `ui.open.${el.dataset.open}`;
    if (store.get(path) !== el.open) store.set(path, el.open);
  }, true);
}

export function syncCollapsibles(state) {
  $$('details[data-open]').forEach((el) => {
    const open = !!state.ui.open[el.dataset.open];
    if (el.open !== open) el.open = open;
  });
}
