import { OT_TYPES } from '../data/presets.js';
import { isLocalSchedule } from './months.js';

/**
 * Spreadsheet (CSV) export and import of the app's data, in three files:
 *
 *  - entries.csv   one row per saved month, the raw inputs of that month as a clean sheet: the salary, then one
 *                  set of columns per item ever seen (an overtime type, an allowance, a deduction, a cash award),
 *                  so a new item adds columns and a month without it leaves them blank.
 *  - espp.csv      one row per ESPP ledger month: the values typed in the ledger, the ESPP Gains entries and the
 *                  fetched USD rates.
 *  - settings.csv  one row per setting (section, setting, month, profile, value): the global settings, the ESPP
 *                  assumptions, every tax profile (brackets, exemption, levies, SI rates and caps, job types),
 *                  and each month's own settings (the advanced item flags, a local work schedule, overrides).
 *
 * Savings stay JSON-only. Months chosen in the export picker limit entries.csv, espp.csv and the month rows of
 * settings.csv; the global rows are always included.
 */

// ---------- CSV text ----------
const quote = (value) => {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';

/** Parses CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF) into an array of rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

/** Rows of a CSV as objects keyed by its header. */
export function readTable(text) {
  const [header = [], ...rows] = parseCsv(text);
  return { header, rows: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

// ---------- selection ----------
const MONTH = /^\d{4}-\d{2}$/;

/** True when `month` is in the export selection: 'all', or a list of "YYYY" years and "YYYY-MM" months. */
export function inSelection(month, selection) {
  if (!selection || selection === 'all') return true;
  return selection.some((s) => s === month || (/^\d{4}$/.test(s) && month.startsWith(`${s}-`)));
}

const boolText = (v) => (v ? 'yes' : 'no');
const readBool = (v, fallback = false) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n'].includes(s)) return false;
  return fallback;
};

// ---------- entries.csv ----------
const otLabel = (o) => {
  const t = OT_TYPES.find((x) => x.id === o.type);
  return t ? `${t.label} ×${t.mult}` : `Custom ×${o.mult}`;
};

/** One list of a month's items, as [kind, name, fields]; repeated names in a month get "#2", "#3", … */
function itemsOf(pay) {
  const out = [];
  const seen = new Map();
  const add = (kind, name, fields) => {
    const key = `${kind}|${name}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push([kind, n > 1 ? `${name} #${n}` : name, fields]);
  };
  for (const o of pay.overtime ?? []) {
    const preset = OT_TYPES.find((t) => t.id === o.type);
    add('Overtime', otLabel(o), { hours: o.hours, factor: preset ? preset.mult : o.mult });
  }
  for (const it of pay.incomes ?? []) add('Allowance', it.name || 'Allowance', { amount: it.amount, period: it.per });
  for (const a of pay.cashAwards ?? []) add('Cash award', a.name || 'Cash award', { amount: a.amount, currency: a.currency, [LOCAL]: localValue(a), period: a.per });
  for (const d of pay.deductions ?? []) add('Deduction', d.name || 'Deduction', { amount: d.amount, period: d.per });
  return out;
}

/** Cash awards are written in the local currency ("EGP" column) instead of their rate; import works the rate out. */
const LOCAL = 'local';
const LOCAL_CURRENCY = 'EGP';
const round2 = (n) => String(Math.round(n * 100) / 100);
function localValue(a) {
  const amount = Number(String(a.amount ?? '').replace(/,/g, ''));
  if (!(amount > 0)) return '';
  if ((a.currency || LOCAL_CURRENCY) === LOCAL_CURRENCY) return round2(amount);
  const rate = Number(String(a.rate ?? '').replace(/,/g, ''));
  return rate > 0 ? round2(amount * rate) : '';
}
const ITEM_FIELDS = { Overtime: ['hours', 'factor'], Allowance: ['amount', 'period'], 'Cash award': ['amount', 'currency', LOCAL, 'period'], Deduction: ['amount', 'period'] };
/** Column name of a field; the cash award's local value is shown as "EGP". */
const fieldLabel = (f) => (f === LOCAL ? LOCAL_CURRENCY : f);
const KIND_ORDER = ['Overtime', 'Allowance', 'Cash award', 'Deduction'];

const BASE_COLUMNS = [
  ['Month', (m) => m],
  ['Gross salary', (m, p) => p.amount],
  ['Salary period', (m, p) => p.per],
  ['Pro-rata months', (m, p) => p.payPeriod?.months],
  ['Pro-rata days', (m, p) => p.payPeriod?.days],
  ['Stocks constant %', (m, p) => p.espp?.constPct],
  ['Stocks variable %', (m, p) => p.espp?.varPct],
  ['ESPP gain', (m, p) => p.espp?.gain],
];

export function entriesCsv(months, selection = 'all') {
  const list = Object.keys(months ?? {}).filter((m) => MONTH.test(m) && inSelection(m, selection)).sort();
  // Every item column ever seen, grouped by kind in a fixed order, then in first-seen order.
  const cols = [];
  const known = new Set();
  for (const m of list) {
    for (const [kind, name] of itemsOf(months[m])) {
      for (const f of ITEM_FIELDS[kind]) {
        const col = `${kind}: ${name} ${fieldLabel(f)}`;
        if (!known.has(col)) { known.add(col); cols.push({ col, kind, name, f }); }
      }
    }
  }
  cols.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const header = [...BASE_COLUMNS.map(([h]) => h), ...cols.map((c) => c.col)];
  const rows = list.map((m) => {
    const p = months[m];
    const items = new Map(itemsOf(p).map(([kind, name, fields]) => [`${kind}|${name}`, fields]));
    return [...BASE_COLUMNS.map(([, get]) => get(m, p) ?? ''), ...cols.map((c) => items.get(`${c.kind}|${c.name}`)?.[c.f] ?? '')];
  });
  return toCsv(header, rows);
}

// ---------- espp.csv ----------
const LEDGER_KEYS = [['deducted', 'Deducted'], ['deductedUsd', 'Deducted USD'], ['dividend', 'Dividend'], ['shares', 'ACC. Shares'], ['gain', 'ESPP gain (typed)']];

export function esppCsv(espp = {}, selection = 'all') {
  // A month with only a fetched USD rate gets no row: those are refetched on their own. A month with ledger values
  // or in the ESPP Gains list is listed, and keeps its rate.
  const months = new Set([
    ...Object.keys(espp.entries ?? {}),
    ...(espp.gainMonths ?? []),
  ].filter((m) => MONTH.test(m) && inSelection(m, selection)));
  const header = ['Month', ...LEDGER_KEYS.map(([, h]) => h), 'In ESPP Gains list', 'USD rate (fetched)'];
  const rows = [...months].sort().map((m) => {
    const e = espp.entries?.[m] ?? {};
    return [m, ...LEDGER_KEYS.map(([k]) => e[k] ?? ''), (espp.gainMonths ?? []).includes(m) ? 'yes' : '', espp.rates?.[m] ?? ''];
  });
  return toCsv(header, rows);
}

// ---------- settings.csv ----------
const SETTINGS_HEADER = ['Section', 'Setting', 'Month', 'Profile', 'Value'];

/**
 * Defaults a month starts with. A month setting is written only when it differs from these, so a file shows only
 * what was actually changed; importing a missing setting gives the same default back, so nothing is lost.
 * Mode is not written at all: a saved month is always stored as gross.
 */
const MONTH_DEFAULTS = {
  jobType: 'ft', siBase: '', siProRata: false, taxable: '', taxablePer: 'month',
  variable: { allowances: true, exempt: true, overtime: true, cashAwards: true },
  allowance: { taxable: true, insurable: false, inEspp: true },
  cashAward: { taxable: true, inEspp: true },
  deduction: { pretax: false },
};
const VARIABLE_KEYS = [['allowances', 'Taxable allowances'], ['exempt', 'Exempt (profit share)'], ['overtime', 'Overtime'], ['cashAwards', 'Cash awards']];

/**
 * The per-month settings of a saved month that differ from the defaults, as [setting, value] pairs: overrides,
 * Stocks variable ticks, each item's advanced flags, and the local work-schedule fields that differ from the global
 * schedule (`globalSchedule`). An empty list means the month uses only defaults.
 */
function monthSettings(p, globalSchedule = {}) {
  const out = [];
  const push = (k, v) => out.push([k, v ?? '']);
  const d = MONTH_DEFAULTS;
  if ((p.jobType || d.jobType) !== d.jobType) push('Job type', p.jobType);
  if ((p.overrides?.siBase ?? '') !== d.siBase) push('SI base override', p.overrides.siBase);
  if (!!p.overrides?.siProRata !== d.siProRata) push('SI pro-rata days', boolText(!!p.overrides.siProRata));
  if ((p.overrides?.taxable ?? '') !== d.taxable) {
    push('Manual taxable amount', p.overrides.taxable);
    if ((p.overrides.taxablePer || d.taxablePer) !== d.taxablePer) push('Manual taxable period', p.overrides.taxablePer);
  }
  const v = p.espp?.variable ?? {};
  // The calculator counts a missing tick as off, so compare that value, not whether the key is there.
  for (const [k, label] of VARIABLE_KEYS) if (!!v[k] !== d.variable[k]) push(`Stocks variable: ${label}`, boolText(!!v[k]));
  for (const [kind, name, , item] of itemsWithSource(p)) {
    if (kind === 'Allowance') {
      if ((item.taxable !== false) !== d.allowance.taxable) push(`Allowance: ${name} taxable`, boolText(item.taxable !== false));
      if (!!item.insurable !== d.allowance.insurable) push(`Allowance: ${name} counts toward SI base`, boolText(!!item.insurable));
      if ((item.inEspp !== false) !== d.allowance.inEspp) push(`Allowance: ${name} included in ESPP`, boolText(item.inEspp !== false));
    } else if (kind === 'Cash award') {
      if ((item.taxable !== false) !== d.cashAward.taxable) push(`Cash award: ${name} taxable`, boolText(item.taxable !== false));
      if ((item.inEspp !== false) !== d.cashAward.inEspp) push(`Cash award: ${name} included in ESPP`, boolText(item.inEspp !== false));
    } else if (kind === 'Deduction') {
      if (!!item.pretax !== d.deduction.pretax) push(`Deduction: ${name} before tax`, boolText(!!item.pretax));
    }
  }
  if (isLocalSchedule(p.scheduleLocal)) {
    const changed = SCHEDULE_KEYS.filter(([k]) => String(p.scheduleLocal[k] ?? '') !== String(globalSchedule[k] ?? ''));
    // A local schedule equal to the global one still needs one row, so the month stays Local on import.
    for (const [k, label] of changed.length ? changed : SCHEDULE_KEYS.slice(0, 1)) push(`Work schedule (local): ${label}`, p.scheduleLocal[k]);
  }
  return out;
}

/** itemsOf with the source item kept alongside, for the per-item settings. */
function itemsWithSource(p) {
  const named = itemsOf(p);
  const sources = [...(p.overtime ?? []), ...(p.incomes ?? []), ...(p.cashAwards ?? []), ...(p.deductions ?? [])];
  return named.map(([kind, name, fields], i) => [kind, name, fields, sources[i]]);
}

const SCHEDULE_KEYS = [['weeksPerYear', 'Weeks / year'], ['daysPerWeek', 'Days / week'], ['hoursPerDay', 'Hours / day'], ['otHoursBase', 'OT base hrs / mo']];
const ASSUMPTION_KEYS = [
  ['price', 'Share price $'], ['fx', '1 USD ='], ['discount', 'Discount %'], ['dividend', 'Dividend $/share'],
  ['dividendTax', 'Dividend US tax %'], ['reinvestRate', 'Reinvest fee %'], ['reinvestCap', 'Reinvest cap $'],
  ['feeIn', 'Fee in $ (Jan/Jul)'], ['withdrawalFee', 'Withdrawal fee $'],
];

/** The groups of settings.csv, in file order; any of them can be left out of an export. */
export const SETTING_GROUPS = [
  ['general', 'General settings'],
  ['espp', 'ESPP settings'],
  ['tax', 'Tax settings'],
  ['months', 'Month settings'],
];

export function settingsCsv(state, selection = 'all', groups = SETTING_GROUPS.map(([g]) => g)) {
  const rows = [];
  const add = (section, setting, value, month = '', profile = '') => rows.push([section, setting, month, profile, value ?? '']);
  const want = new Set(groups);

  if (want.has('general')) {
    for (const [k, label] of SCHEDULE_KEYS) add('Work schedule', label, state.schedule?.[k]);
  }

  if (want.has('espp')) {
    const espp = state.espp ?? {};
    add('ESPP', 'Symbol', espp.symbol);
    for (const [k, label] of ASSUMPTION_KEYS) add('ESPP assumptions', label, espp.assumptions?.[k]);
    add('ESPP', 'Change day', espp.changeDay);
    add('ESPP', 'Month offset', espp.monthOffset);
  }

  if (want.has('tax')) {
    add('General', 'Active tax profile', state.profileId);
    for (const p of state.profiles ?? []) {
      const id = p.id;
      add('Tax profile', 'Name', p.name, '', id);
      add('Tax profile', 'Currency', p.currency, '', id);
      add('Tax', 'Personal exemption', p.tax?.exemption, '', id);
      (p.tax?.brackets ?? []).forEach((b, i) => {
        add('Tax bracket', `${i + 1} rate %`, b.rate, '', id);
        add('Tax bracket', `${i + 1} from`, b.min, '', id);
        add('Tax bracket', `${i + 1} to`, b.max, '', id);
        add('Tax bracket', `${i + 1} excluded above`, b.exclusion, '', id);
      });
      (p.levies ?? []).forEach((l, i) => {
        add('Levy', `${i + 1} name`, l.name, '', id);
        add('Levy', `${i + 1} rate %`, l.rate, '', id);
        add('Levy', `${i + 1} base`, l.base, '', id);
      });
      add('Social insurance', 'Employee share %', p.si?.employeeRate, '', id);
      add('Social insurance', 'Employer share %', p.si?.employerRate, '', id);
      (p.si?.caps ?? []).forEach((c, i) => {
        add('SI cap', `${i + 1} year`, c.year, '', id);
        add('SI cap', `${i + 1} min`, c.min, '', id);
        add('SI cap', `${i + 1} max`, c.max, '', id);
      });
      (p.jobTypes ?? []).forEach((j, i) => {
        add('Job type', `${i + 1} id`, j.id, '', id);
        add('Job type', `${i + 1} name`, j.name, '', id);
        add('Job type', `${i + 1} social insurance`, boolText(!!j.si), '', id);
        add('Job type', `${i + 1} exemption`, boolText(!!j.exemption), '', id);
        add('Job type', `${i + 1} mode`, j.mode, '', id);
        add('Job type', `${i + 1} flat rate %`, j.flatRate, '', id);
      });
    }
  }

  if (want.has('months')) {
    for (const m of Object.keys(state.months ?? {}).filter((x) => MONTH.test(x) && inSelection(x, selection)).sort()) {
      for (const [setting, value] of monthSettings(state.months[m], state.schedule)) add('Month', setting, value, m);
    }
  }
  return toCsv(SETTINGS_HEADER, rows);
}

// ---------- reading CSV back ----------
const FILE_KINDS = {
  entries: (h) => h[0] === 'Month' && h.includes('Gross salary'),
  espp: (h) => h[0] === 'Month' && h.includes('Deducted USD'),
  settings: (h) => h.join(',') === SETTINGS_HEADER.join(','),
};

/** Which of the three files a CSV text is, from its header ('' when unknown). */
export function csvKind(text) {
  const [header = []] = parseCsv(text);
  return Object.keys(FILE_KINDS).find((k) => FILE_KINDS[k](header)) ?? '';
}

const OT_BY_LABEL = new Map(OT_TYPES.map((t) => [t.label, t]));
const stripCount = (name) => name.replace(/ #\d+$/, '');
const stripFactor = (name) => name.replace(/ ×[\d.]+$/, '');

/** A saved month from one entries.csv row, merged with its month rows from settings.csv (when given). */
function monthFromRow(row, header, settingRows = [], globalSchedule = {}) {
  const s = new Map(settingRows.map((r) => [r.Setting, r.Value]));
  const pay = {
    amount: row['Gross salary'] ?? '', per: row['Salary period'] || 'month', mode: 'gross',
    payPeriod: { months: row['Pro-rata months'] || '1', days: row['Pro-rata days'] || '0' },
    jobType: s.get('Job type') || 'ft',
    overrides: {
      siBase: s.get('SI base override') ?? '', taxable: s.get('Manual taxable amount') ?? '',
      taxablePer: s.get('Manual taxable period') || 'month', siProRata: readBool(s.get('SI pro-rata days')),
    },
    incomes: [], overtime: [], cashAwards: [], deductions: [],
    espp: {
      constPct: row['Stocks constant %'] ?? '', varPct: row['Stocks variable %'] ?? '', gain: row['ESPP gain'] ?? '',
      // Only ticks that differ from the default are in the file; a missing one is the default (ticked).
      variable: Object.fromEntries(VARIABLE_KEYS.map(([k, label]) => [k, readBool(s.get(`Stocks variable: ${label}`), MONTH_DEFAULTS.variable[k])])),
    },
  };
  // Item columns: "Kind: Name field", read in header order so items keep their order.
  const items = new Map();
  for (const h of header) {
    const m = h.match(/^(Overtime|Allowance|Cash award|Deduction): (.+) (hours|factor|amount|period|currency|rate|EGP)$/);
    if (!m || row[h] === '' || row[h] === undefined) continue;
    const key = `${m[1]}|${m[2]}`;
    if (!items.has(key)) items.set(key, { kind: m[1], name: m[2], fields: {} });
    items.get(key).fields[m[3] === LOCAL_CURRENCY ? LOCAL : m[3]] = row[h];
  }
  for (const { kind, name, fields } of items.values()) {
    const base = stripCount(name);
    const flag = (suffix, fallback) => readBool(s.get(`${kind}: ${name} ${suffix}`), fallback);
    if (kind === 'Overtime') {
      const preset = OT_BY_LABEL.get(stripFactor(base));
      pay.overtime.push(preset ? { type: preset.id, mult: preset.mult, hours: fields.hours ?? '' } : { type: 'custom', mult: fields.factor ?? '', hours: fields.hours ?? '' });
    } else if (kind === 'Allowance') {
      pay.incomes.push({ name: base, amount: fields.amount ?? '', per: fields.period || 'month', taxable: flag('taxable', true), insurable: flag('counts toward SI base', false), inEspp: flag('included in ESPP', true) });
    } else if (kind === 'Cash award') {
      const currency = fields.currency || 'USD';
      const amount = Number(String(fields.amount ?? '').replace(/,/g, ''));
      const local = Number(String(fields[LOCAL] ?? '').replace(/,/g, ''));
      // The rate is worked out from the EGP value; a file that still has a rate column keeps it.
      const rate = fields.rate ?? (currency !== LOCAL_CURRENCY && amount > 0 && local > 0 ? String(Number((local / amount).toFixed(6))) : '');
      pay.cashAwards.push({ name: base, amount: fields.amount ?? '', currency, rate, per: fields.period || 'once', taxable: flag('taxable', true), inEspp: flag('included in ESPP', true) });
    } else {
      pay.deductions.push({ name: base, amount: fields.amount ?? '', per: fields.period || 'month', pretax: flag('before tax', false) });
    }
  }
  const local = SCHEDULE_KEYS.map(([k, label]) => [k, s.get(`Work schedule (local): ${label}`)]);
  // Only the fields that differ are in the file; the others are the global schedule's.
  if (local.some(([, v]) => v !== undefined)) pay.scheduleLocal = Object.fromEntries(local.map(([k, v]) => [k, v ?? String(globalSchedule[k] ?? '')]));
  return pay;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies CSV files to `state`. Only what the files contain changes; months and settings that are not in them are
 * kept. Returns { state, changes, problems }: `changes` lists every existing value that will be overwritten (and
 * what is added), `problems` the rows that could not be read. `state` is not modified.
 */
export function applyCsv(state, files) {
  const next = structuredClone(state);
  const changes = [];
  const problems = [];
  const byKind = {};
  for (const { name, text } of files) {
    const kind = csvKind(text);
    if (!kind) problems.push(`${name}: not an entries, ESPP or settings file`);
    else byKind[kind] = readTable(text);
  }

  const settings = byKind.settings?.rows ?? [];
  const monthRows = new Map();
  for (const r of settings) if (r.Section === 'Month' && MONTH.test(r.Month)) monthRows.set(r.Month, [...(monthRows.get(r.Month) ?? []), r]);

  if (byKind.entries) {
    for (const row of byKind.entries.rows) {
      if (!MONTH.test(row.Month)) { problems.push(`entries: row "${row.Month}" is not a YYYY-MM month`); continue; }
      if (!String(row['Gross salary'] ?? '').trim()) { problems.push(`entries: ${row.Month} has no gross salary, skipped`); continue; }
      // A local schedule is completed from the global schedule in the file, else the one in the app.
      const pay = monthFromRow(row, byKind.entries.header, monthRows.get(row.Month) ?? [], globalScheduleFrom(settings, next.schedule));
      const before = next.months[row.Month];
      if (!before) changes.push(`Add month ${row.Month}`);
      else if (!sameJson({ ...before }, pay)) changes.push(`Overwrite month ${row.Month}`);
      next.months[row.Month] = pay;
    }
  }

  if (byKind.espp) {
    next.espp = { ...next.espp, entries: { ...next.espp.entries }, rates: { ...next.espp.rates }, gainMonths: [...(next.espp.gainMonths ?? [])] };
    for (const row of byKind.espp.rows) {
      if (!MONTH.test(row.Month)) { problems.push(`espp: row "${row.Month}" is not a YYYY-MM month`); continue; }
      const entry = Object.fromEntries(LEDGER_KEYS.map(([k, h]) => [k, row[h] ?? '']).filter(([, v]) => v !== ''));
      const before = next.espp.entries[row.Month];
      if (Object.keys(entry).length) {
        if (before && !sameJson(before, entry)) changes.push(`Overwrite ESPP ledger ${row.Month}`);
        else if (!before) changes.push(`Add ESPP ledger ${row.Month}`);
        next.espp.entries[row.Month] = entry;
      }
      if (row['USD rate (fetched)']) next.espp.rates[row.Month] = row['USD rate (fetched)'];
      if (readBool(row['In ESPP Gains list']) && !next.espp.gainMonths.includes(row.Month)) next.espp.gainMonths.push(row.Month);
    }
  }

  if (settings.length) applySettingRows(next, settings, changes, problems);
  return { state: next, changes, problems };
}

/** The global work schedule a settings file holds, filled in from `fallback` where it has no row. */
function globalScheduleFrom(rows, fallback = {}) {
  const out = { ...fallback };
  for (const [k, label] of SCHEDULE_KEYS) {
    const r = rows.find((x) => x.Section === 'Work schedule' && x.Setting === label && !x.Month);
    if (r) out[k] = r.Value;
  }
  return out;
}

function applySettingRows(next, rows, changes, problems) {
  const set = (label, target, key, value) => {
    if (value === undefined) return;
    if (String(target[key] ?? '') !== String(value)) {
      if (String(target[key] ?? '') !== '') changes.push(`Overwrite ${label}: ${target[key]} → ${value}`);
      target[key] = value;
    }
  };
  const get = (section, setting, profile = '') => rows.find((r) => r.Section === section && r.Setting === setting && (r.Profile ?? '') === profile && !r.Month)?.Value;

  next.schedule = { ...next.schedule };
  for (const [k, label] of SCHEDULE_KEYS) set(`work schedule ${label}`, next.schedule, k, get('Work schedule', label));
  next.espp.assumptions = { ...next.espp.assumptions };
  for (const [k, label] of ASSUMPTION_KEYS) {
    const value = get('ESPP assumptions', label);
    if (value === undefined) continue;
    const before = String(next.espp.assumptions[k] ?? '');
    if (before !== String(value)) {
      changes.push(before === '' ? `Set ESPP ${label} to ${value}` : `Overwrite ESPP ${label}: ${before} → ${value}`);
      next.espp.assumptions[k] = value;
    }
  }
  set('ESPP symbol', next.espp, 'symbol', get('ESPP', 'Symbol'));
  set('ESPP change day', next.espp, 'changeDay', get('ESPP', 'Change day'));
  set('ESPP month offset', next.espp, 'monthOffset', get('ESPP', 'Month offset'));

  const ids = [...new Set(rows.filter((r) => r.Profile).map((r) => r.Profile))];
  for (const id of ids) {
    const mine = rows.filter((r) => r.Profile === id);
    const val = (section, setting) => mine.find((r) => r.Section === section && r.Setting === setting)?.Value;
    const list = (section, fields) => {
      const out = [];
      for (const r of mine.filter((x) => x.Section === section)) {
        const m = r.Setting.match(/^(\d+) (.+)$/);
        if (!m) continue;
        const i = Number(m[1]) - 1;
        const f = fields[m[2]];
        if (!f) continue;
        out[i] = { ...(out[i] ?? {}), [f]: r.Value };
      }
      return out.filter(Boolean);
    };
    const profile = {
      id, name: val('Tax profile', 'Name') ?? id, currency: val('Tax profile', 'Currency') ?? 'EGP',
      tax: { exemption: val('Tax', 'Personal exemption') ?? '', brackets: list('Tax bracket', { 'rate %': 'rate', from: 'min', to: 'max', 'excluded above': 'exclusion' }) },
      levies: list('Levy', { name: 'name', 'rate %': 'rate', base: 'base' }),
      si: { employeeRate: val('Social insurance', 'Employee share %') ?? '', employerRate: val('Social insurance', 'Employer share %') ?? '', caps: list('SI cap', { year: 'year', min: 'min', max: 'max' }) },
      jobTypes: list('Job type', { id: 'id', name: 'name', 'social insurance': 'si', exemption: 'exemption', mode: 'mode', 'flat rate %': 'flatRate' })
        .map((j) => ({ ...j, si: readBool(j.si, true), exemption: readBool(j.exemption, true) })),
    };
    const at = next.profiles.findIndex((p) => p.id === id);
    if (at === -1) { changes.push(`Add tax profile ${profile.name}`); next.profiles.push(profile); }
    else if (!sameJson(next.profiles[at], profile)) { changes.push(`Overwrite tax profile ${profile.name} (brackets, exemption, levies, SI, job types)`); next.profiles[at] = profile; }
  }
  const active = get('General', 'Active tax profile');
  if (active && next.profiles.some((p) => p.id === active)) set('active tax profile', next, 'profileId', active);
  if (active && !next.profiles.some((p) => p.id === active)) problems.push(`settings: active tax profile "${active}" is not in the file`);
}

// ---------- JSON (everything) ----------
/** What importing a full JSON file would overwrite, for the confirmation list. */
export function jsonChanges(state, incoming) {
  const changes = [];
  for (const m of Object.keys(incoming.months ?? {}).sort()) {
    if (!state.months?.[m]) changes.push(`Add month ${m}`);
    else if (!sameJson(state.months[m], incoming.months[m])) changes.push(`Overwrite month ${m}`);
  }
  for (const m of Object.keys(state.months ?? {}).sort()) if (!incoming.months?.[m]) changes.push(`Remove month ${m} (not in the file)`);
  if (!sameJson(state.espp?.entries, incoming.espp?.entries)) changes.push('Replace the ESPP ledger');
  if (!sameJson(state.espp?.assumptions, incoming.espp?.assumptions)) changes.push('Replace the ESPP assumptions');
  if (!sameJson(state.profiles, incoming.profiles)) changes.push('Replace the tax profiles');
  if (!sameJson(state.schedule, incoming.schedule)) changes.push('Replace the work schedule');
  if (!sameJson(state.savings, incoming.savings)) changes.push('Replace the Savings plan');
  return changes;
}
