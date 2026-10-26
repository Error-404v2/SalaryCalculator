import { clone } from '../utils/object.js';
import { isFilled, toNumber } from '../utils/number.js';
import { HISTORY_FIELDS, nearestFirst } from './history.js';
import { solveForNet } from './solver.js';
import { toAnnual, fromAnnual } from './periods.js';

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

/**
 * Saved months always hold a gross salary. A Pay tab in Net → Gross mode is solved first, so the month
 * stores the gross that gives that take-home, in the same period the user entered.
 * `context` supplies what the solver needs from the app (tax profile, schedule, year).
 */
export function grossPay(pay, context) {
  if (pay.mode !== 'net' || !(toNumber(pay.amount) > 0)) return { ...clone(pay), mode: 'gross' };
  const input = { ...context, ...withPay(context, pay) };
  const solved = solveForNet(input, toAnnual(pay.amount, pay.per, input.schedule));
  const gross = fromAnnual(solved.baseAnnual, pay.per, input.schedule);
  return { ...clone(pay), mode: 'gross', amount: String(Math.round(gross * 100) / 100) };
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

/**
 * Moves a saved entry to another month: `from` is removed and `to` holds `pay`. With no `from` (a new entry)
 * it just saves `pay` under `to`. The month being moved to is replaced if it already existed.
 */
export const moveMonth = (months, from, to, pay) => putMonth(from && from !== to ? dropMonth(months, from) : months, to, pay);

/**
 * Save Month's dropdown choices: saved months nearest to `now` first, then the last month picked from the
 * calendar if it isn't saved yet (flagged `saved: false`, shown as "not saved").
 */
export function monthChoices(months, now, lastCustom = '') {
  const choices = nearestFirst(monthList(months), now).map((month) => ({ month, saved: true }));
  if (lastCustom && !months?.[lastCustom]) choices.push({ month: lastCustom, saved: false });
  return choices;
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
