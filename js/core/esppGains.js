import { toNumber, isFilled } from '../utils/number.js';
import { calculate } from './calculator.js';
import { monthKey } from './history.js';
import { withPay, snapshotPay, grossPay } from './months.js';

/**
 * ESPP gains, one entry per payslip month. An entry's gain is, in order:
 *   the value typed in the ESPP tab  →  else the ESPP gain saved in that month's History entry  →  else 0.
 * Its tax is worked out from that month's own History entry, or, for a month with none, from the Pay tab.
 * Months saved in History with a gain are listed automatically; the rest are added by hand.
 */

/** The Pay tab as a gross-salary input: the starting point for a month that has no History entry. */
export function payBaseOf(input) {
  const tab = input.payTab ?? input;
  return withPay(tab, grossPay(snapshotPay(tab), tab));
}

/** The gain on `month`'s payslip (EGP) and the extra income tax it caused. `payBase` stands in for a month with no History entry. */
export function payslipGainFor(input, month, payBase = input) {
  const typedRaw = input.espp?.entries?.[month]?.gain;
  const typed = isFilled(typedRaw);
  const saved = input.months?.[month];
  const historyGain = saved ? toNumber(saved.espp?.gain) : 0;
  const used = typed ? typedRaw : historyGain > 0 ? saved.espp.gain : '';
  if (!(toNumber(used) > 0)) return { gain: 0, tax: 0, source: '', historyGain };

  const base = saved ? withPay(input, saved) : payBase;
  const r = calculate({ ...base, espp: { ...base.espp, gain: used } });
  return { gain: r.esppGain / 12, tax: r.esppGainTax / 12, source: typed ? 'typed' : 'history', historyGain };
}

/**
 * Every month that has a gain entry, newest first: months added by hand, months with a typed gain, and
 * History months that carry a gain. `derived` marks a month that exists only because History has a gain.
 */
export function gainRows(input, payBase = input) {
  const espp = input.espp ?? {};
  const listed = new Set(espp.gainMonths ?? []);
  const typedValue = (m) => (isFilled(espp.entries?.[m]?.gain) ? String(espp.entries[m].gain) : '');
  const months = new Set([
    ...listed,
    ...Object.keys(espp.entries ?? {}).filter((m) => typedValue(m)),
    ...Object.keys(input.months ?? {}).filter((m) => toNumber(input.months[m].espp?.gain) > 0),
  ]);
  return [...months].sort((a, b) => b.localeCompare(a)).map((month) => ({
    month,
    typedValue: typedValue(month),
    derived: !listed.has(month) && !typedValue(month),
    ...payslipGainFor(input, month, payBase),
  }));
}

/** The month a new entry starts on: this month, or the nearest earlier one that is not in the list yet. */
export function freeGainMonth(taken, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), 1);
  while (taken.has(monthKey(d))) d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

const prune = (espp, month) => {
  if (espp.entries[month] && !Object.keys(espp.entries[month]).length) delete espp.entries[month];
};

export function addGainMonth(espp, month) {
  if (!espp.gainMonths.includes(month)) espp.gainMonths.push(month);
}

/** Types a gain for `month` (blank goes back to the History value). The month stays in the list either way. */
export function setGain(espp, month, value) {
  addGainMonth(espp, month);
  const text = String(value ?? '').trim();
  espp.entries[month] = { ...(espp.entries[month] ?? {}) };
  if (text) espp.entries[month].gain = text; else delete espp.entries[month].gain;
  prune(espp, month);
}

/** Takes an entry out of the list and drops its typed gain; a History gain on that month still shows. */
export function removeGain(espp, month) {
  espp.gainMonths = espp.gainMonths.filter((m) => m !== month);
  if (espp.entries[month]) delete espp.entries[month].gain;
  prune(espp, month);
}

/** Re-dates an entry (and its typed gain) to another month. Refuses a month that already has an entry. */
export function moveGain(espp, from, to, taken = new Set()) {
  if (from === to) return true;
  if (taken.has(to) || espp.gainMonths.includes(to)) return false;
  const typed = espp.entries[from]?.gain;
  removeGain(espp, from);
  addGainMonth(espp, to);
  if (typed !== undefined) setGain(espp, to, typed);
  return true;
}
