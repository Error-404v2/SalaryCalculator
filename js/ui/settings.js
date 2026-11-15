import { $, downloadJson, toast } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { DEFAULT_STATE } from '../data/defaults.js';
import * as store from '../state/store.js';
import { exportData, importData } from '../state/backup.js';
import { entriesCsv, esppCsv, settingsCsv, applyCsv, jsonChanges, csvKind } from '../core/index.js';
import { hydrate } from '../state/migrate.js';
import { zipFiles, unzipFiles } from '../utils/zip.js';
import { exportSelection, initExportPick, renderExportPick, settingsGroups, initGroupsPick, renderGroupsPick } from './exportPick.js';

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

/**
 * The confirmation before an import. A full .json backup can always be imported (it replaces everything, so it is
 * offered even when it matches what the app holds); CSV is only offered when it would change something.
 */
function review({ title, changes, problems, always = false }) {
  const host = $('#importReview');
  const list = (items, cls) => (items.length ? `<ul class="${cls}">${items.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '');
  const nothing = always ? 'The file holds the same data as the app.' : 'Nothing in the app changes.';
  host.innerHTML = `<div class="import-review">
    <b>${escapeHtml(title)}</b>
    ${changes.length ? `<div class="hint">This will change:</div>${list(changes, 'changes')}` : `<div class="hint">${nothing}</div>`}
    ${problems.length ? `<div class="hint warn-text">Not imported:</div>${list(problems, 'problems')}` : ''}
    <div class="row" style="gap:6px;margin-top:8px">
      ${changes.length || always ? `<button type="button" class="btn sm danger" data-import-go>${changes.length ? 'Import' : 'Import anyway'}</button>` : ''}
      <button type="button" class="btn sm ghost" data-import-cancel>Cancel</button>
    </div></div>`;
}

const clearReview = () => { pending = null; $('#importReview').innerHTML = ''; };

export function initSettings(onReplaced) {
  initExportPick(() => store.getState(), () => store.scopeMonth());
  initGroupsPick();

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
    if (!settingsGroups().length) toast('No settings chosen: settings.csv will be empty');
    const pick = exportSelection();
    const files = [
      { name: 'entries.csv', text: entriesCsv(state.months, pick) },
      { name: 'espp.csv', text: esppCsv(state.espp, pick) },
      { name: 'settings.csv', text: settingsCsv(state, pick, settingsGroups()) },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    download(`salary-calculator-${stamp}.zip`, zipFiles(files), 'application/zip');
  });

  /**
   * One Import button: a .json backup replaces everything; CSV files and the .zip only add or change what they hold.
   * The type is worked out from each file's content (a CSV header, a zip, or JSON), not only its name.
   */
  $('#importFile').addEventListener('change', (e) => {
    const chosen = [...e.target.files];
    e.target.value = '';
    importFiles(chosen);
  });
  initDropZone();

  async function importFiles(chosen) {
    if (!chosen.length) return;
    try {
      const csv = [];
      const json = [];
      for (const f of chosen) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) { csv.push(...unzipFiles(bytes)); continue; }
        const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
        if (/^\s*[{[]/.test(text)) json.push({ name: f.name, text });
        else csv.push({ name: f.name, text });
      }
      if (json.length && csv.length) throw new Error('choose either a .json backup or CSV files, not both');
      if (json.length > 1) throw new Error('choose one .json backup');
      if (json.length) {
        const incoming = importData(json[0].text);
        pending = { state: incoming, kind: 'json' };
        return review({ title: `Import everything from ${json[0].name} (replaces the whole app)`, changes: jsonChanges(store.getState(), incoming), problems: [], always: true });
      }
      const usable = csv.filter((f) => csvKind(f.text));
      const { state, changes, problems } = applyCsv(store.getState(), csv);
      pending = { state: hydrate(state), kind: 'csv' };
      review({ title: `Import ${usable.map((f) => f.name).join(', ') || 'CSV'}`, changes, problems });
    } catch (err) {
      clearReview();
      toast(`Could not import: ${err.message}`);
    }
  }

  /**
   * Dropping files: while a file is held over the page, the drop zone shows under Import (opening Settings and
   * Export / Import if needed); dropping it there imports it like Choose file…. It hides again when the file leaves.
   */
  function initDropZone() {
    const zone = $('#importDrop');
    let depth = 0;
    const holdsFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const show = (on) => {
      zone.hidden = !on;
      if (!on) zone.classList.remove('over');
    };
    document.addEventListener('dragenter', (e) => {
      if (!holdsFiles(e)) return;
      depth++;
      if (depth === 1) {
        document.querySelector('details[data-open="options"]').open = true;
        document.querySelector('details[data-open="transfer"]').open = true;
        show(true);
      }
    });
    document.addEventListener('dragleave', (e) => {
      if (!holdsFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) show(false);
    });
    document.addEventListener('dragover', (e) => {
      if (!holdsFiles(e)) return;
      e.preventDefault();
      zone.classList.toggle('over', zone.contains(e.target));
      e.dataTransfer.dropEffect = zone.contains(e.target) ? 'copy' : 'none';
    });
    document.addEventListener('drop', (e) => {
      if (!holdsFiles(e)) return;
      e.preventDefault();
      depth = 0;
      const onZone = zone.contains(e.target);
      show(false);
      if (onZone) importFiles([...e.dataTransfer.files]);
    });
  }

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
  renderExportPick(store.getState(), store.scopeMonth());
  renderGroupsPick();
}
