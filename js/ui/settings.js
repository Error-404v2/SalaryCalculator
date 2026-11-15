import { $, downloadJson, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { DEFAULT_STATE } from '../data/defaults.js';
import * as store from '../state/store.js';
import { exportData, importData } from '../state/backup.js';
import { entriesCsv, esppCsv, settingsCsv, applyCsv, jsonChanges, csvKind } from '../core/index.js';
import { hydrate } from '../state/migrate.js';
import { zipFiles, unzipFiles } from '../utils/zip.js';
import { exportSelection, initExportPick, renderExportPick } from './exportPick.js';

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function download(name, bytes, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** The import waiting for "Import" after its list of changes was shown: { state, kind }. */
let pending = null;

function review({ title, changes, problems }) {
  const host = $('#importReview');
  const list = (items, cls) => (items.length ? `<ul class="${cls}">${items.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '');
  host.innerHTML = `<div class="import-review">
    <b>${escapeHtml(title)}</b>
    ${changes.length ? `<div class="hint">This will change:</div>${list(changes, 'changes')}` : '<div class="hint">Nothing in the app changes.</div>'}
    ${problems.length ? `<div class="hint warn-text">Not imported:</div>${list(problems, 'problems')}` : ''}
    <div class="row" style="gap:6px;margin-top:8px">
      ${changes.length ? '<button type="button" class="btn sm danger" data-import-go>Import</button>' : ''}
      <button type="button" class="btn sm ghost" data-import-cancel>Cancel</button>
    </div></div>`;
}

const clearReview = () => { pending = null; $('#importReview').innerHTML = ''; };

export function initSettings(onReplaced) {
  initExportPick(() => store.getState());

  $('#themeBtn').addEventListener('click', () => {
    const { theme } = store.getState().ui;
    const isDark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    store.set('ui.theme', isDark ? 'light' : 'dark');
  });

  $('#exportBtn').addEventListener('click', () => {
    const data = exportData(store.getState());
    downloadJson(`salary-calculator-${data.exportedAt.slice(0, 10)}.json`, data);
  });

  $('#exportCsvBtn').addEventListener('click', () => {
    const state = store.getState();
    const pick = exportSelection();
    const files = [
      { name: 'entries.csv', text: entriesCsv(state.months, pick) },
      { name: 'espp.csv', text: esppCsv(state.espp, pick) },
      { name: 'settings.csv', text: settingsCsv(state, pick) },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    download(`salary-calculator-${stamp}.zip`, zipFiles(files), 'application/zip');
  });

  $('#importCsv').addEventListener('change', async (e) => {
    const chosen = [...e.target.files];
    e.target.value = '';
    if (!chosen.length) return;
    try {
      const files = [];
      for (const f of chosen) {
        if (/\.zip$/i.test(f.name)) files.push(...unzipFiles(new Uint8Array(await f.arrayBuffer())));
        else files.push({ name: f.name, text: await f.text() });
      }
      const usable = files.filter((f) => csvKind(f.text));
      const { state, changes, problems } = applyCsv(store.getState(), files);
      pending = { state: hydrate(state), kind: 'csv' };
      review({ title: `Import ${usable.map((f) => f.name).join(', ') || 'CSV'}`, changes, problems });
    } catch (err) {
      clearReview();
      toast(`Could not read the file: ${err.message}`);
    }
  });

  $('#importFile').addEventListener('change', async (e) => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = importData(await file.text());
      pending = { state: incoming, kind: 'json' };
      review({ title: `Import everything from ${file.name} (replaces the whole app)`, changes: jsonChanges(store.getState(), incoming), problems: [] });
    } catch {
      clearReview();
      toast('Invalid settings file');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-import-cancel]')) return clearReview();
    if (!e.target.closest('[data-import-go]') || !pending) return;
    const { state } = pending;
    clearReview();
    store.replace(state);
    onReplaced();
    const months = Object.keys(store.getState().months).length;
    toast(`Imported${months ? ` · ${months} month${months === 1 ? '' : 's'}` : ''}`);
  });

  $('#resetAll').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Reset all values, extras and tax profiles to defaults?')) return;
    store.replace(structuredClone(DEFAULT_STATE));
    onReplaced();
    toast('Everything reset');
  });
}

export function syncSettings(state) {
  applyTheme(state.ui.theme);
  renderExportPick(store.getState());
}
