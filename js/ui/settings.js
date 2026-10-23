import { $, downloadJson, toast } from '../utils/dom.js';
import { DEFAULT_STATE } from '../data/defaults.js';
import * as store from '../state/store.js';

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

  $('#exportBtn').addEventListener('click', () => downloadJson('salary-settings.json', store.getState()));

  $('#importFile').addEventListener('change', async (e) => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    try {
      store.replace(JSON.parse(await file.text()));
      onReplaced();
      toast('Settings imported');
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
