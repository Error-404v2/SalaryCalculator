import { clone } from '../utils/object.js';
import { isFilled } from '../utils/number.js';
import { HISTORY_FIELDS } from './history.js';

/**
 * A saved month is a full copy of the Pay tab's inputs for that month, so the History tab can show and
 * edit it exactly like the Pay tab. Tax profiles, settings and the ESPP ledger stay shared.
 */
export const PAY_KEYS = ['amount', 'per', 'mode', 'payPeriod', 'jobType', 'overrides', 'incomes', 'overtime', 'cashAwards', 'deductions', 'espp'];

/** Only the per-month ESPP inputs are copied; the ledger, assumptions and payroll tax belong to the ESPP tab. */
const ESPP_KEYS = ['constPct', 'varPct', 'variable'];

const PAY_PATHS = [...PAY_KEYS.filter((k) => k !== 'espp'), ...ESPP_KEYS.map((k) => `espp.${k}`)];

/** True for a state path that belongs to one month's Pay inputs (e.g. "incomes.0.amount", "espp.constPct"). */
export const isPayPath = (path) => PAY_PATHS.some((p) => path === p || path.startsWith(`${p}.`));

export function snapshotPay(state) {
  const pay = {};
  for (const key of PAY_KEYS) {
    if (key === 'espp') pay.espp = Object.fromEntries(ESPP_KEYS.map((k) => [k, clone(state.espp?.[k] ?? '')]));
    else pay[key] = clone(state[key]);
  }
  return pay;
}

/** The state with a saved month's Pay inputs applied over it, for calculating or editing that month. */
export function withPay(state, pay) {
  if (!pay) return state;
  const next = { ...state };
  for (const key of PAY_KEYS) {
    if (!(key in pay)) continue;
    next[key] = key === 'espp' ? { ...state.espp, ...clone(pay.espp) } : clone(pay[key]);
  }
  return next;
}

/** Writes a month's Pay inputs onto `state` itself (Fill Pay). The ESPP ledger and assumptions are left alone. */
export function applyPay(state, pay) {
  for (const key of PAY_KEYS) {
    if (!(key in pay)) continue;
    if (key === 'espp') Object.assign(state.espp, clone(pay.espp));
    else state[key] = clone(pay[key]);
  }
  return state;
}

/** Saved months, newest first. */
export const monthList = (months) => Object.keys(months ?? {}).sort((a, b) => b.localeCompare(a));

/** The latest saved month on or before `month`, so a month without its own entry inherits the previous one. */
export function monthInForce(months, month) {
  return monthList(months).find((m) => m <= month) ?? '';
}

/** Months with `pay` stored under `month`; replaces whatever that month held. */
export const putMonth = (months, month, pay) => ({ ...(months ?? {}), [month]: clone(pay) });

export function dropMonth(months, month) {
  const next = { ...(months ?? {}) };
  delete next[month];
  return next;
}

const FIELD_TO_ITEM = { transport: ['incomes', 'transport', 'Transportation'], medical: ['deductions', 'medical', 'Medical insurance'] };

/**
 * Turns the old per-field history (`{ field, from, value }`) into saved months. Each month starts from
 * `base` (the current Pay tab) and takes every value in force by then, so the figures it showed stay the same.
 */
export function monthsFromHistory(history, base) {
  const entries = (history ?? []).filter((e) => e && e.from && HISTORY_FIELDS.some((f) => f.id === e.field) && isFilled(e.value));
  const froms = [...new Set(entries.map((e) => e.from))].sort();
  const months = {};
  for (const month of froms) {
    const pay = snapshotPay(base);
    const latest = (field) => entries.filter((e) => e.field === field && e.from <= month).sort((a, b) => a.from.localeCompare(b.from)).at(-1);
    const salary = latest('salary');
    if (salary) { pay.amount = salary.value; pay.per = 'month'; pay.mode = 'gross'; }
    for (const [field, [list, prefix, name]] of Object.entries(FIELD_TO_ITEM)) {
      const entry = latest(field);
      if (!entry) continue;
      const i = pay[list].findIndex((it) => it.name?.toLowerCase().startsWith(prefix));
      if (i >= 0) pay[list][i] = { ...pay[list][i], amount: entry.value };
      else pay[list].push(list === 'incomes'
        ? { name, amount: entry.value, per: 'month', taxable: true, insurable: false }
        : { name, amount: entry.value, per: 'month', pretax: false });
    }
    const c = latest('esppConst');
    const v = latest('esppVar');
    if (c) pay.espp.constPct = c.value;
    if (v) pay.espp.varPct = v.value;
    months[month] = pay;
  }
  return months;
}
