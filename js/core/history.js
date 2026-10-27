import { toNumber, isFilled } from '../utils/number.js';

/** Fields whose value can change over time. Each is stored as its own `{ field, from, value }` entry. */
export const HISTORY_FIELDS = [
  { id: 'salary', label: 'Gross salary', unit: 'money' },
  { id: 'transport', label: 'Transportation', unit: 'money' },
  { id: 'medical', label: 'Medical insurance', unit: 'money' },
  { id: 'esppConst', label: 'Stocks % (constant)', unit: 'pct' },
  { id: 'esppVar', label: 'Stocks % (variable)', unit: 'pct' },
];

export const historyField = (id) => HISTORY_FIELDS.find((f) => f.id === id);

/**
 * What the History tab lists. A group can span several fields: the two ESPP percentages share one row per
 * month. Storage and the calculator still keep one entry per field.
 */
export const HISTORY_GROUPS = [
  { id: 'salary', label: 'Gross salary', fields: ['salary'] },
  { id: 'transport', label: 'Transportation', fields: ['transport'] },
  { id: 'medical', label: 'Medical insurance', fields: ['medical'] },
  { id: 'espp', label: 'Stocks %', fields: ['esppConst', 'esppVar'] },
];

export const historyGroup = (id) => HISTORY_GROUPS.find((g) => g.id === id);

/** "YYYY-MM" for a Date, in local time. */
export const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function monthLabel(key, style = 'short') {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}

/** Months of a calendar year as "YYYY-MM". */
export const monthsOfYear = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

const monthIndex = (key) => { const [y, m] = key.split('-').map(Number); return y * 12 + m; };

/** Months ordered by distance from `from` (a "YYYY-MM"); on a tie the later month comes first. */
export function nearestFirst(months, from) {
  const at = monthIndex(from);
  return [...months].sort((a, b) => Math.abs(monthIndex(a) - at) - Math.abs(monthIndex(b) - at) || b.localeCompare(a));
}

/** The entry of `field` in force during `month`: the latest one whose `from` month is on or before it. */
export function entryAt(history, field, month) {
  let best = null;
  for (const entry of history ?? []) {
    if (entry.field !== field || !entry.from || !isFilled(entry.value)) continue;
    if (entry.from <= month && (!best || entry.from >= best.from)) best = entry;
  }
  return best;
}

/** Value of `field` in force during `month`, or `fallback` when no entry applies yet. */
export function valueAt(history, field, month, fallback = '') {
  const best = entryAt(history, field, month);
  return best ? best.value : fallback;
}

export const numberAt = (history, field, month, fallback = 0) => toNumber(valueAt(history, field, month, fallback));

/** Months that have at least one entry, newest first. */
export function monthsInHistory(history) {
  const months = new Set();
  for (const entry of history ?? []) {
    if (historyField(entry.field) && entry.from) months.add(entry.from);
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

/** Every tracked field as it stands in `month`. `exact` means it was set in that month; otherwise it is inherited. */
export function monthSnapshot(history, month) {
  return HISTORY_FIELDS.map((field) => {
    const entry = entryAt(history, field.id, month);
    return { ...field, value: entry ? entry.value : '', from: entry ? entry.from : '', exact: !!entry && entry.from === month };
  });
}

/**
 * The editable values of a saved month, field id → value. A field set in that month shows its own value;
 * an unset field shows the value inherited from an earlier month (or '' when there is none).
 */
export function monthValues(history, month) {
  return Object.fromEntries(monthSnapshot(history, month).map((f) => [f.id, f.value]));
}

/** Months that are saved, plus the field ids set exactly in each, newest first. */
export function savedMonths(history) {
  return monthsInHistory(history).map((month) => ({
    month,
    fields: HISTORY_FIELDS.filter((f) => (history ?? []).some((e) => e.field === f.id && e.from === month && isFilled(e.value))).map((f) => f.id),
  }));
}

/** True when `month` already holds a filled value, so saving it again would override something. */
export const hasMonth = (history, month) =>
  (history ?? []).some((e) => e.from === month && historyField(e.field) && isFilled(e.value));

/** One row per month for the entries of `fields`, newest first. Rows are keyed by month, never by array position. */
export function groupRows(history, fields) {
  const rows = new Map();
  for (const entry of history ?? []) {
    if (!fields.includes(entry.field)) continue;
    const from = entry.from ?? '';
    const row = rows.get(from) ?? { from, values: {} };
    row.values[entry.field] = entry.value;
    rows.set(from, row);
  }
  return [...rows.values()].sort((a, b) => b.from.localeCompare(a.from));
}

/** The history with `field` set to `value` in `month`: updated in place if that entry exists, else added. */
export function setEntry(history, field, from, value) {
  const list = history ?? [];
  const text = String(value ?? '');
  if (!list.some((e) => e.field === field && e.from === from)) return [...list, { field, from, value: text }];
  return list.map((e) => (e.field === field && e.from === from ? { ...e, value: text } : e));
}

/** The history without the entries of `fields` in `from`. */
export const removeRow = (history, fields, from) =>
  (history ?? []).filter((e) => !(fields.includes(e.field) && e.from === from));

/** The history without any entry of `month`. */
export const removeMonth = (history, month) => (history ?? []).filter((e) => e.from !== month);

/** Moves a row to another month. Refused (`ok: false`) when that month already has a row in the group. */
export function moveRow(history, fields, from, to) {
  const list = history ?? [];
  if (!to || to === from) return { history: list, ok: false };
  if (list.some((e) => fields.includes(e.field) && e.from === to)) return { history: list, ok: false };
  return { history: list.map((e) => (fields.includes(e.field) && e.from === from ? { ...e, from: to } : e)), ok: true };
}

/**
 * The history after saving `values` (field id → value) as `month`. Every entry already in that month is
 * replaced, so the month ends up equal to what was saved. Other months are never touched.
 */
export function saveMonth(history, month, values) {
  const all = history ?? [];
  const kept = all.filter((e) => !(e.from === month && historyField(e.field)));
  const added = HISTORY_FIELDS
    .filter((f) => isFilled(values?.[f.id]))
    .map((f) => ({ field: f.id, from: month, value: String(values[f.id]) }));
  return { history: [...kept, ...added], replaced: all.length - kept.length, saved: added.length };
}

/** The latest month at or before `start` where none of `fields` has an entry yet, so Add never piles onto a used month. */
export function freeMonth(history, fields, start) {
  const used = new Set((history ?? []).filter((e) => fields.includes(e.field)).map((e) => e.from));
  let [year, month] = start.split('-').map(Number);
  let key = start;
  while (used.has(key)) {
    month -= 1;
    if (month === 0) { year -= 1; month = 12; }
    key = `${year}-${String(month).padStart(2, '0')}`;
  }
  return key;
}

/**
 * Adding a gross salary to a month also adds Transportation and Medical for it, taken from `current`,
 * unless the month already has them. Any other field adds nothing.
 */
export function companionEntries(history, field, from, current = {}) {
  if (field !== 'salary') return [];
  return ['transport', 'medical']
    .filter((f) => !(history ?? []).some((e) => e.field === f && e.from === from))
    .map((f) => ({ field: f, from, value: String(current[f] ?? '') }));
}
