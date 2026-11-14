import { toNumber } from '../utils/number.js';

/**
 * The tax year a month is calculated under: the month's own year, or, when the tax profile has no
 * social-insurance caps for it (a future month), the nearest year that does. With no caps at all it is the month's year.
 */
export function taxYearFor(month, caps = []) {
  const year = String(month ?? '').slice(0, 4);
  if (!/^\d{4}$/.test(year)) return String(new Date().getFullYear());
  const years = (caps ?? []).map((c) => String(c.year)).filter((y) => /^\d{4}$/.test(y));
  if (!years.length || years.includes(year)) return year;
  const at = toNumber(year);
  return years.sort((a, b) => Math.abs(toNumber(a) - at) - Math.abs(toNumber(b) - at) || toNumber(b) - toNumber(a))[0];
}
