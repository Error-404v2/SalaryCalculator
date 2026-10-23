import { toNumber } from '../utils/number.js';

/**
 * Income tax is homogeneous: tax(f·income, f·brackets) = f · tax(income, brackets).
 * So a pro-rata period equals the full-month calculation scaled by f, provided the items that must
 * NOT scale (actual overtime hours, cash awards) are divided by f beforehand.
 */
export function proRataInput(input, factor) {
  if (factor === 1 || factor <= 0) return input;
  return {
    ...input,
    overtime: (input.overtime ?? []).map((o) => ({ ...o, hours: String(toNumber(o.hours) / factor) })),
    cashAwards: (input.cashAwards ?? []).map((a) => ({ ...a, amount: String(toNumber(a.amount) / factor) })),
  };
}
