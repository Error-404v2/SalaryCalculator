import { isFilled, toNumber } from '../utils/number.js';
import { calculate } from './calculator.js';
import { valueAt, monthKey } from './history.js';
import { buildLedger, summarize, payrollTax, adjustedMonth } from './espp.js';

/** History-tracked values applied onto the calculator input for one month. */
export function inputForMonth(input, month) {
  const h = input.history;
  const amount = valueAt(h, 'salary', month, input.amount);
  const swap = (list, name, field) => list.map((it) =>
    it.name?.toLowerCase().startsWith(name) ? { ...it, amount: valueAt(h, field, month, it.amount) } : it);
  return {
    ...input,
    amount,
    per: isFilled(valueAt(h, 'salary', month, '')) ? 'month' : input.per,
    incomes: swap(input.incomes ?? [], 'transport', 'transport'),
    deductions: swap(input.deductions ?? [], 'medical', 'medical'),
    espp: {
      ...input.espp,
      constPct: valueAt(h, 'esppConst', month, input.espp.constPct),
      varPct: valueAt(h, 'esppVar', month, input.espp.varPct),
    },
  };
}

/** Monthly ESPP deduction for `month`, in the profile currency. */
export const esppDeductionFor = (input) => (month) => calculate(inputForMonth(input, month)).espp.total / 12;

export function esppReport(input, today = new Date()) {
  const espp = input.espp;
  const year = Number(input.ui.esppYear || today.getFullYear());
  const ledger = buildLedger({
    year,
    entries: espp.entries,
    assumptions: espp.assumptions,
    deductionFor: esppDeductionFor(input),
  });
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
