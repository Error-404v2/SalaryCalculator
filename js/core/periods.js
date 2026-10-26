import { toNumber } from '../utils/number.js';

export const PERIODS = [
  { id: 'year', label: 'Annual', unit: 'year' },
  { id: 'month', label: 'Monthly', unit: 'month' },
  { id: 'day', label: 'Daily', unit: 'day' },
  { id: 'hour', label: 'Hourly', unit: 'hour' },
];

/** Periods an allowance, bonus or deduction can be entered in. The results views only use PERIODS. */
export const ITEM_PERIODS = [
  { id: 'year', label: 'Annual' },
  { id: 'half', label: 'Bi-annual' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'month', label: 'Monthly' },
  { id: 'day', label: 'Daily' },
  { id: 'hour', label: 'Hourly' },
];

export const isPeriod = (id) => PERIODS.some((p) => p.id === id);
export const isItemPeriod = (id) => ITEM_PERIODS.some((p) => p.id === id);

export const findPeriod = (id) => PERIODS.find((p) => p.id === id) ?? PERIODS[1];

export function periodsPerYear(periodId, schedule = {}) {
  const weeks = toNumber(schedule.weeksPerYear) || 52;
  const days = toNumber(schedule.daysPerWeek) || 5;
  const hours = toNumber(schedule.hoursPerDay) || 8;
  const table = {
    year: 1,
    half: 2,
    quarter: 4,
    month: 12,
    day: weeks * days,
    hour: weeks * days * hours,
  };
  return table[periodId] ?? 12;
}

export const toAnnual = (amount, periodId, schedule) => toNumber(amount) * periodsPerYear(periodId, schedule);

/** `payFactor` stretches or shrinks the "month" period (pro-rata); other periods are unaffected. */
export function fromAnnual(annual, periodId, schedule, payFactor = 1) {
  const value = annual / periodsPerYear(periodId, schedule);
  return periodId === 'month' ? value * payFactor : value;
}

const DAYS_PER_MONTH = 30;

function describePayPeriod(months, days) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [];
  if (months) parts.push(plural(months, 'month'));
  if (days) parts.push(`${days < 0 ? '− ' : months ? '+ ' : ''}${plural(Math.abs(days), 'day')}`);
  return parts.join(' ') || 'No pay';
}

/**
 * Pro-rata pay period: months + days/30 of a normal month, as in the original sheet.
 * Salary-based items, brackets and the exemption scale with it; actual overtime hours and awards do not.
 */
export function resolvePayPeriod(payPeriod = {}) {
  const months = toNumber(payPeriod.months);
  const days = toNumber(payPeriod.days);
  const factor = Math.max(0, months + days / DAYS_PER_MONTH);
  const standard = factor === 1;
  return {
    factor,
    standard,
    unit: standard ? 'month' : 'pay period',
    label: standard ? 'Monthly' : describePayPeriod(months, days),
    monthly: (annual) => (annual / 12) * factor,
  };
}
