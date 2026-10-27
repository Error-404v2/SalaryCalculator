import { toNumber, sum } from '../utils/number.js';
import { calculate } from './calculator.js';
import { monthKey } from './history.js';
import { withPay } from './months.js';
import { buildLedger, summarize, adjustedMonth } from './espp.js';

/**
 * The calculator input for one month: that month's own History entry, or the Pay tab when it has none.
 * A History month changes only itself, so saving August does not rewrite September to December.
 */
export function inputForMonth(input, month) {
  const saved = input.months?.[month];
  return saved ? withPay(input, saved) : input;
}

/** Monthly ESPP deduction for `month`, in the profile currency. */
export const esppDeductionFor = (input) => (month) => calculate(inputForMonth(input, month)).espp.total / 12;

/** Where each month's forecast deduction comes from, for the ledger's hint: its own History entry or the Pay tab. */
export function deductionSource(input, month) {
  return input.months?.[month] ? { kind: 'month', month } : { kind: 'pay', month: '' };
}

/**
 * The ESPP gain taxed through payroll in `month`, with the extra income tax it caused.
 * It is read from that month's own History entry (a gain is a one-off on one payslip, so it is never carried
 * into later months) and never from the Pay tab. A gain or tax typed in the ESPP tab's ledger overrides the
 * History one, so the tab also works on its own. Returns { gain, tax, source, taxTyped }.
 */
export function payslipGainFor(input, month) {
  const entry = input.espp?.entries?.[month] ?? {};
  const typedGain = entry.gain !== undefined && entry.gain !== '';
  const typedTax = entry.gainTax !== undefined && entry.gainTax !== '';
  const saved = input.months?.[month];
  const savedGain = toNumber(saved?.espp?.gain) > 0;
  if (!typedGain && !savedGain && !typedTax) return { gain: 0, tax: 0, source: '', taxTyped: false };

  const base = saved ? withPay(input, saved) : input;
  const r = calculate({ ...base, espp: { ...base.espp, gain: typedGain ? entry.gain : savedGain ? saved.espp.gain : '' } });
  return {
    gain: typedGain || savedGain ? r.esppGain / 12 : 0,
    tax: typedTax ? toNumber(entry.gainTax) : r.esppGainTax / 12,
    source: typedGain ? 'typed' : savedGain ? 'history' : '',
    taxTyped: typedTax,
  };
}

export function esppReport(input, today = new Date()) {
  const espp = input.espp;
  const year = Number(input.ui.esppYear || today.getFullYear());
  const ledger = buildLedger({
    year,
    entries: espp.entries,
    assumptions: espp.assumptions,
    deductionFor: esppDeductionFor(input),
    monthRates: input.esppRates ?? {},
  });
  ledger.rows.forEach((row) => {
    row.source = deductionSource(input, row.month);
    row.payslip = payslipGainFor(input, row.month);
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
    ready: toNumber(espp.assumptions.price) > 0 && toNumber(espp.assumptions.fx) > 0,
  };
}
