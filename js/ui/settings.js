import { $, downloadJson, toast } from '../utils/dom.js';
import { DEFAULT_STATE } from '../data/defaults.js';
import * as store from '../state/store.js';
import { exportData, importData } from '../state/backup.js';

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function initSettings(onReplaced) {
  $('#themeBtn').addEventListener('click', () => {
    const { theme } = store.getState().ui;
    const isDark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    store.set('ui.theme', isDark ? 'light' : 'dark');
  });

  $('#exportBtn').addEventListener('click', () => {
    const data = exportData(store.getState());
    downloadJson(`salary-calculator-${data.exportedAt.slice(0, 10)}.json`, data);
  });

  $('#importFile').addEventListener('change', async (e) => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    try {
      store.replace(importData(await file.text()));
      onReplaced();
      const months = Object.keys(store.getState().months).length;
      toast(`Imported${months ? ` · ${months} month${months === 1 ? '' : 's'}` : ''}`);
    } catch {
      toast('Invalid settings file');
    }
  });

  $('#resetAll').addEventListener('click', () => {
    if (!confirm('Reset all values, extras and tax profiles to defaults?')) return;
    store.replace(structuredClone(DEFAULT_STATE));
    onReplaced();
    toast('Everything reset');
  });
}

export function syncSettings(state) {
  applyTheme(state.ui.theme);
}
