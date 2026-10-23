import { toNumber, isFilled } from '../utils/number.js';

export function computeSocialInsurance({ si = {}, baseOverride, year, enabled, insurableMonthly }) {
  const rawBase = isFilled(baseOverride) ? toNumber(baseOverride) : insurableMonthly;
  const cap = (si.caps ?? []).find((c) => String(c.year) === String(year));

  let base = rawBase;
  if (cap && isFilled(cap.max)) base = Math.min(base, toNumber(cap.max));
  if (cap && isFilled(cap.min) && base > 0) base = Math.max(base, toNumber(cap.min));

  const annualAt = (rate) => (enabled ? base * (toNumber(rate) / 100) * 12 : 0);
  return {
    enabled,
    rawBase,
    base,
    capped: base !== rawBase,
    employee: annualAt(si.employeeRate),
    employer: annualAt(si.employerRate),
  };
}
