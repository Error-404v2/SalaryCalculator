import { toNumber, sum } from '../utils/number.js';
import { calculate } from './calculator.js';
import { monthKey } from './history.js';
import { withPay } from './months.js';
import { buildLedger, summarize, adjustedMonth } from './espp.js';
import { payBaseOf, payslipGainFor, gainRows } from './esppGains.js';

/**
 * Monthly ESPP deduction for `month`, in the profile currency: only what that month's own History entry says.
 * A month with no History entry is 0 (the Pay tab and other months never feed it), and a value typed in the
 * ledger overrides it. So saving August changes August only.
 */
export const esppDeductionFor = (input) => (month) => {
  const saved = input.months?.[month];
  return saved ? calculate(withPay(input, saved)).espp.total / 12 : 0;
};

/** Where each month's calculated deduction comes from, for the ledger's hint: its History entry, or nothing. */
export function deductionSource(input, month) {
  return input.months?.[month] ? { kind: 'month', month } : { kind: 'none', month: '' };
}

export function esppReport(input, today = new Date()) {
  const espp = input.espp;
  const year = Number(input.ui.esppYear || today.getFullYear());
  const payBase = payBaseOf(input);
  const ledger = buildLedger({
    year,
    entries: espp.entries,
    assumptions: espp.assumptions,
    deductionFor: esppDeductionFor(input),
    monthRates: input.esppRates ?? {},
  });
  ledger.rows.forEach((row) => {
    row.source = deductionSource(input, row.month);
    row.payslip = payslipGainFor(input, row.month, payBase);
  });
  const cutoff = adjustedMonth(today, espp.changeDay, espp.monthOffset);
  const options = { assumptions: espp.assumptions };
  const gainTotals = (rows) => ({
    payslipGain: sum(rows, (r) => r.payslip.gain),
    payslipTax: sum(rows, (r) => r.payslip.tax),
  });
  return {
    year,
    ledger,
    cutoff,
    currentMonth: monthKey(today),
    toDate: { ...summarize(ledger, { ...options, cutoff }), ...gainTotals(ledger.rows.filter((r) => r.month <= cutoff)) },
    forecast: { ...summarize(ledger, options), ...gainTotals(ledger.rows) },
    gains: gainRows(input, payBase),
    historyMonths: input.months ?? {},
    ready: toNumber(espp.assumptions.price) > 0 && toNumber(espp.assumptions.fx) > 0,
  };
}
