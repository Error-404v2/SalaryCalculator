import { $$ } from '../utils/dom.js';
import * as store from '../state/store.js';

/** Each tab bar names its state key and its panel attribute. */
const GROUPS = [
  { nav: '[data-tabs]', key: 'ui.resTab', panel: 'data-panel' },
  { nav: '[data-in-tabs]', key: 'ui.inTab', panel: 'data-in-panel' },
];

export function initTabs() {
  GROUPS.forEach(({ nav, key }) => {
    $$(nav).forEach((bar) => bar.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) store.set(key, tab.dataset.tab);
    }));
  });
}

export function syncTabs() {
  GROUPS.forEach(({ nav, key, panel }) => {
    const active = store.get(key);
    $$(`${nav} .tab`).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === active)));
    $$(`[${panel}]`).forEach((p) => (p.hidden = p.getAttribute(panel) !== active));
  });
}
