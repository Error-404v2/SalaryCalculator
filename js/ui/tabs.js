import { $, $$ } from '../utils/dom.js';
import * as store from '../state/store.js';

export function initTabs() {
  $('[data-tabs]').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) store.set('ui.resTab', tab.dataset.tab);
  });
}

export function syncTabs(state) {
  const active = state.ui.resTab;
  $$('[data-tabs] .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === active)));
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== active));
}
