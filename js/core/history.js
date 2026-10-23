import { toNumber, isFilled } from '../utils/number.js';

/** Fields whose value can change over time. `path` is where the value lives in state for the current month. */
export const HISTORY_FIELDS = [
  { id: 'salary', label: 'Gross salary', unit: 'money' },
  { id: 'transport', label: 'Transportation', unit: 'money' },
  { id: 'medical', label: 'Medical insurance', unit: 'money' },
  { id: 'esppConst', label: 'ESPP % (constant)', unit: 'pct' },
  { id: 'esppVar', label: 'ESPP % (variable)', unit: 'pct' },
];

export const historyField = (id) => HISTORY_FIELDS.find((f) => f.id === id);

/** "YYYY-MM" for a Date, in local time. */
export const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function monthLabel(key, style = 'short') {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}

/** Months of a calendar year as "YYYY-MM". */
export const monthsOfYear = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

/**
 * Value of `field` in force during `month`: the latest entry whose `from` month is on or before it.
 * Returns `fallback` when no entry applies yet.
 */
export function valueAt(history, field, month, fallback = '') {
  let best = null;
  for (const entry of history ?? []) {
    if (entry.field !== field || !entry.from || !isFilled(entry.value)) continue;
    if (entry.from <= month && (!best || entry.from >= best.from)) best = entry;
  }
  return best ? best.value : fallback;
}

export const numberAt = (history, field, month, fallback = 0) => toNumber(valueAt(history, field, month, fallback));

/** Entries grouped by field, newest first, for display. */
export function groupHistory(history) {
  const groups = new Map(HISTORY_FIELDS.map((f) => [f.id, []]));
  (history ?? []).forEach((entry, index) => {
    if (groups.has(entry.field)) groups.get(entry.field).push({ ...entry, index });
  });
  groups.forEach((list) => list.sort((a, b) => (b.from || '').localeCompare(a.from || '')));
  return groups;
}
