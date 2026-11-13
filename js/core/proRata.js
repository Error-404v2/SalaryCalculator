import { toNumber } from '../utils/number.js';

const unscale = (amount, factor) => String(toNumber(amount) / factor);
const oncePerPeriod = (items, factor) =>
  (items ?? []).map((it) => (it.per === 'once' ? { ...it, amount: unscale(it.amount, factor) } : it));

/**
 * Months social insurance is charged for in a pro-rata period. By default the days are left out, so SI is a whole
 * month (or the whole months entered); with `includeDays` it follows the days too, like the salary.
 */
export function siMonths(payPeriod, factor, includeDays) {
  if (includeDays) return factor;
  const months = Math.max(0, Math.trunc(toNumber(payPeriod?.months)));
  return factor > 0 ? Math.max(1, months) : 0;
}

/**
 * Income tax is homogeneous: tax(f·income, f·brackets) = f · tax(income, brackets).
 * So a pro-rata period equals the full-month calculation scaled by f, provided the items that must
 * NOT scale are divided by f beforehand: actual overtime hours, cash awards, One-Time allowances and
 * deductions (paid once, whatever the days), and the payslip ESPP gain. Social insurance is scaled to
 * `siMonths` instead of f (`siScale`, applied in calculate()).
 */
export function proRataInput(input, factor, payPeriod = input.payPeriod) {
  if (factor === 1 || factor <= 0) return input;
  const months = siMonths(payPeriod, factor, !!input.overrides?.siProRata);
  return {
    ...input,
    overtime: (input.overtime ?? []).map((o) => ({ ...o, hours: unscale(o.hours, factor) })),
    cashAwards: (input.cashAwards ?? []).map((a) => ({ ...a, amount: unscale(a.amount, factor) })),
    incomes: oncePerPeriod(input.incomes, factor),
    deductions: oncePerPeriod(input.deductions, factor),
    espp: input.espp ? { ...input.espp, gain: input.espp.gain ? unscale(input.espp.gain, factor) : input.espp.gain } : input.espp,
    siScale: months / factor,
  };
}
