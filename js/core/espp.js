import { toNumber, isFilled, sum } from '../utils/number.js';
import { monthsOfYear } from './history.js';

/**
 * ESPP ledger, modelled on the V1.2 sheet.
 *
 * Each month either has locked actuals (the yellow columns: deducted EGP, deducted USD, dividend,
 * accumulated shares) or is forecast from the month's ESPP deduction and the assumptions.
 *
 *   Accredited   = deducted USD + dividend − reinvest fee − fees in
 *   Shares added = accredited ÷ purchase price  (price × (1 − discount))
 *   Actual share = shares added × market price   (value of what this month bought)
 *   Un-taxed     = actual share − accredited     (the discount/price gain not yet taxed)
 */

const DIVIDEND_MONTHS = new Set([3, 6, 9, 12]);
const FEE_MONTHS = new Set([1, 7]);

const monthNumber = (key) => Number(key.slice(5, 7));

/** Locked value if the user filled it, otherwise the forecast. */
const pick = (locked, forecast) => (isFilled(locked) ? { value: toNumber(locked), locked: true } : { value: forecast, locked: false });

export function buildLedger({ year, entries = {}, assumptions = {}, deductionFor }) {
  const price = toNumber(assumptions.price);
  const discount = toNumber(assumptions.discount) / 100;
  const purchasePrice = price * (1 - discount);
  const fx = toNumber(assumptions.fx);
  const dividendPerShare = toNumber(assumptions.dividend);
  const reinvestRate = toNumber(assumptions.reinvestRate) / 100;
  const reinvestCap = toNumber(assumptions.reinvestCap);
  const feeIn = toNumber(assumptions.feeIn);

  let shares = 0;
  // Dividends are paid on shares held at the end of the previous quarter's last month (sheet: H of 2 rows up).
  const sharesHistory = [];

  const rows = monthsOfYear(year).map((month, i) => {
    const entry = entries[month] ?? {};
    const m = monthNumber(month);

    const deducted = pick(entry.deducted, deductionFor(month));
    const deductedUsd = pick(entry.deductedUsd, fx > 0 ? deducted.value / fx : 0);

    const eligibleShares = sharesHistory[i - 2] ?? 0;
    const dividend = pick(entry.dividend, DIVIDEND_MONTHS.has(m) ? Math.floor(eligibleShares * dividendPerShare * 100) / 100 : 0);
    const reinvestFee = dividend.value > 0 ? Math.min(dividend.value * reinvestRate, reinvestCap) : 0;
    const feesIn = FEE_MONTHS.has(m) ? feeIn : 0;
    const accredited = deductedUsd.value + dividend.value - reinvestFee - feesIn;

    const previous = shares;
    const accShares = pick(entry.shares, purchasePrice > 0 ? previous + accredited / purchasePrice : previous);
    shares = accShares.value;
    sharesHistory.push(shares);

    const added = shares - previous;
    const actualShare = added * price;
    const untaxed = actualShare - accredited;
    const hasActivity = deducted.value > 0 || accredited !== 0 || added !== 0;

    return {
      month, deducted, deductedUsd, dividend, reinvestFee, feesIn, accredited,
      shares: accShares, added, actualShare, untaxed, hasActivity,
      locked: deducted.locked || deductedUsd.locked || dividend.locked || accShares.locked,
    };
  });

  return { rows, price, purchasePrice, fx };
}

/**
 * Totals up to `cutoff` ("YYYY-MM", inclusive) or the whole year.
 * Withdrawal (sheet B1/C1) = (value of shares − withdrawal fee − tax still due) × FX.
 * Tax due = tax rate × un-taxed gains − tax already paid through payroll.
 */
export function summarize(ledger, { cutoff, assumptions = {}, payrollTaxUsd = 0 }) {
  const rows = cutoff ? ledger.rows.filter((r) => r.month <= cutoff) : ledger.rows;
  const last = rows.at(-1);
  const shares = last ? last.shares.value : 0;
  const deducted = sum(rows, (r) => r.deducted.value);
  const deductedUsd = sum(rows, (r) => r.deductedUsd.value);
  const untaxed = sum(rows, (r) => r.untaxed);
  const dividends = sum(rows, (r) => r.dividend.value);
  const fees = sum(rows, (r) => r.reinvestFee + r.feesIn);

  const taxRate = toNumber(assumptions.taxRate) / 100;
  const withdrawalFee = toNumber(assumptions.withdrawalFee);
  const taxDueUsd = Math.max(0, taxRate * untaxed - payrollTaxUsd);
  const marketValueUsd = shares * ledger.price;
  const withdrawalUsd = Math.max(0, marketValueUsd - withdrawalFee - taxDueUsd);
  const withdrawal = withdrawalUsd * ledger.fx;

  return {
    months: rows.length,
    shares, deducted, deductedUsd, untaxed, dividends, fees,
    marketValueUsd, taxDueUsd, withdrawalUsd, withdrawal,
    profit: withdrawal - deducted,
    netGainsUsd: untaxed - taxDueUsd - withdrawalFee,
  };
}

/** Sum of payroll ESPP tax events (sheet Table14), converted to USD at each event's rate. */
export function payrollTax(events = []) {
  return events.reduce(
    (acc, e) => {
      const rate = toNumber(e.rate);
      const tax = toNumber(e.tax);
      const gains = toNumber(e.gains);
      acc.tax += tax;
      acc.taxUsd += rate > 0 ? tax / rate : 0;
      acc.gainsUsd += rate > 0 ? gains / rate : 0;
      return acc;
    },
    { tax: 0, taxUsd: 0, gainsUsd: 0 },
  );
}

/**
 * "Adjusted month" from the sheet: before the change day the current month isn't settled yet,
 * so the last settled month is the previous one. `offset` shifts it further (sheet L20).
 */
export function adjustedMonth(today, changeDay, offset = 0) {
  const settledThisMonth = today.getDate() >= toNumber(changeDay || 1);
  const shift = (settledThisMonth ? 0 : -1) + toNumber(offset);
  const d = new Date(today.getFullYear(), today.getMonth() + shift, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
