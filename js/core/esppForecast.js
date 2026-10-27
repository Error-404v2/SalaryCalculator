import { toNumber } from '../utils/number.js';
import { calculate } from './calculator.js';
import { monthKey } from './history.js';
import { monthInForce, withPay } from './months.js';
import { buildLedger, summarize, payrollTax, adjustedMonth } from './espp.js';

/** The calculator input for one month: the saved month in force then, or the Pay tab when none is saved yet. */
export function inputForMonth(input, month) {
  const saved = monthInForce(input.months, month);
  return saved ? withPay(input, input.months[saved]) : input;
}

/** Monthly ESPP deduction for `month`, in the profile currency. */
export const esppDeductionFor = (input) => (month) => calculate(inputForMonth(input, month)).espp.total / 12;

/**
 * Where each month's forecast deduction comes from, for the ledger's hint: the month's own History entry,
 * an earlier History month still in force, or the Pay tab (no History saved yet).
 */
export function deductionSource(input, month) {
  if (input.months?.[month]) return { kind: 'month', month };
  const inForce = monthInForce(input.months, month);
  return inForce ? { kind: 'carried', month: inForce } : { kind: 'pay', month: '' };
}

export function esppReport(input, today = new Date()) {
  const espp = input.espp;
  const year = Number(input.ui.esppYear || today.getFullYear());
  const ledger = buildLedger({
    year,
    entries: espp.entries,
    assumptions: espp.assumptions,
    deductionFor: esppDeductionFor(input),
  });
  ledger.rows.forEach((row) => { row.source = deductionSource(input, row.month); });
  const payroll = payrollTax(espp.payrollTax);
  const cutoff = adjustedMonth(today, espp.changeDay, espp.monthOffset);
  const options = { assumptions: espp.assumptions, payrollTaxUsd: payroll.taxUsd };
  return {
    year,
    ledger,
    payroll,
    cutoff,
    currentMonth: monthKey(today),
    toDate: summarize(ledger, { ...options, cutoff }),
    forecast: summarize(ledger, options),
    ready: toNumber(espp.assumptions.price) > 0 && toNumber(espp.assumptions.fx) > 0,
  };
}
