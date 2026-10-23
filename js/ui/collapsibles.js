import { $$ } from '../utils/dom.js';
import * as store from '../state/store.js';

export function initCollapsibles() {
  $$('details[data-open]').forEach((el) => {
    el.addEventListener('toggle', () => {
      const path = `ui.open.${el.dataset.open}`;
      if (store.get(path) !== el.open) store.set(path, el.open);
    });
  });
}

export function syncCollapsibles(state) {
  $$('details[data-open]').forEach((el) => {
    const open = !!state.ui.open[el.dataset.open];
    if (el.open !== open) el.open = open;
  });
}
