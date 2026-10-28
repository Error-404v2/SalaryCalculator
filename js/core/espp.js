import { toNumber, isFilled, sum } from '../utils/number.js';
import { monthsOfYear } from './history.js';

/**
 * ESPP ledger, checked against EquatePlus exports and the IBM ESPP prospectus.
 *
 * Each month either has values you typed (the yellow columns) or a calculated one shown in grey:
 *
 *   Deducted USD  = Deducted EGP ÷ the USD rate IBM used (it converts around the 19th–21st)
 *   Fees in       = $6 admin fee, once per offering period (Jan and Jul), only in a month that has a Deducted
 *   Dividend      = shares held before the record date × $/share × (1 − US tax) × (1 − reinvest fee, max $3)
 *   Accredited    = Deducted USD + Dividend − Fees in
 *   Shares added  = Accredited ÷ purchase price (market price × (1 − discount))
 *   Actual share  = shares added × market price
 *   Gain          = Actual share − Accredited (the discount; taxed once, through payroll)
 */

const DIVIDEND_MONTHS = new Set([3, 6, 9, 12]);
const FEE_MONTHS = new Set([1, 7]);

const monthNumber = (key) => Number(key.slice(5, 7));

/** Typed value if the user filled it, otherwise the calculated one. */
const pick = (typed, calculated) => (isFilled(typed) ? { value: toNumber(typed), locked: true } : { value: calculated, locked: false });

/**
 * Dividend paid in a payout month, before it is reinvested: IBM's $/share on the shares held at the record date
 * (about a month earlier, so shares as of two months back), less US withholding, less the 2% reinvestment fee
 * (capped). The result is what buys new shares.
 */
export function dividendCash(sharesHeld, { dividend, dividendTax, reinvestRate, reinvestCap }) {
  const gross = sharesHeld * toNumber(dividend);
  const afterTax = gross * (1 - toNumber(dividendTax) / 100);
  const fee = Math.min(afterTax * (toNumber(reinvestRate) / 100), isFilled(reinvestCap) ? toNumber(reinvestCap) : Infinity);
  return { gross, afterTax, fee, net: Math.max(0, afterTax - fee) };
}

export function buildLedger({ year, entries = {}, assumptions = {}, deductionFor, monthRates = {} }) {
  const price = toNumber(assumptions.price);
  const discount = toNumber(assumptions.discount) / 100;
  const purchasePrice = price * (1 - discount);
  const fx = toNumber(assumptions.fx);
  const feeIn = toNumber(assumptions.feeIn);

  let shares = 0;
  const sharesHistory = [];

  const rows = monthsOfYear(year).map((month, i) => {
    const entry = entries[month] ?? {};
    const m = monthNumber(month);

    const deducted = pick(entry.deducted, deductionFor(month));
    // The month's own conversion rate (IBM converts around the 19th–21st) when known, else today's rate.
    const rate = toNumber(monthRates[month]) || fx;
    const deductedUsd = pick(entry.deductedUsd, rate > 0 ? deducted.value / rate : 0);
    // With both EGP and USD known, their ratio is the exact rate IBM used that month.
    const usedRate = deductedUsd.value > 0 ? deducted.value / deductedUsd.value : 0;

    // Dividend is calculated (grey) every payout month and can be overridden, whatever Deducted holds.
    const eligibleShares = sharesHistory[i - 2] ?? 0;
    const div = DIVIDEND_MONTHS.has(m) ? dividendCash(eligibleShares, assumptions) : { gross: 0, afterTax: 0, fee: 0, net: 0 };
    const dividend = pick(entry.dividend, div.net);
    const reinvestFee = dividend.locked ? 0 : div.fee;
    const dividendTax = dividend.locked ? 0 : div.gross - div.afterTax;

    // The admin fee comes off the first contribution of the offering period, so a month with no Deducted has none.
    const feesIn = FEE_MONTHS.has(m) && deducted.value > 0 ? feeIn : 0;
    const accredited = deductedUsd.value + dividend.value - feesIn;

    const previous = shares;
    const accShares = pick(entry.shares, purchasePrice > 0 ? previous + accredited / purchasePrice : previous);
    shares = accShares.value;
    sharesHistory.push(shares);

    const added = shares - previous;
    const actualShare = added * price;
    const untaxed = actualShare - accredited;
    const hasActivity = deducted.value > 0 || accredited !== 0 || added !== 0;

    return {
      month, deducted, deductedUsd, rate, fxToday: fx, usedRate, dividend, dividendTax, reinvestFee, feesIn, accredited,
      shares: accShares, added, actualShare, untaxed, hasActivity,
      locked: deducted.locked || deductedUsd.locked || dividend.locked || accShares.locked,
    };
  });

  return { rows, price, purchasePrice, fx };
}

/**
 * Totals up to `cutoff` ("YYYY-MM", inclusive) or the whole year.
 * Withdrawal = (value of shares − withdrawal fee) × FX. Nothing is taxed at withdrawal: the discount gain is
 * taxed once, through payroll (the ESPP gain on each payslip), and that tax is already in net pay.
 */
export function summarize(ledger, { cutoff, assumptions = {} }) {
  const rows = cutoff ? ledger.rows.filter((r) => r.month <= cutoff) : ledger.rows;
  const last = rows.at(-1);
  const shares = last ? last.shares.value : 0;
  const deducted = sum(rows, (r) => r.deducted.value);
  const deductedUsd = sum(rows, (r) => r.deductedUsd.value);
  const untaxed = sum(rows, (r) => r.untaxed);
  const dividends = sum(rows, (r) => r.dividend.value);
  const fees = sum(rows, (r) => r.reinvestFee + r.feesIn);
  const dividendTax = sum(rows, (r) => r.dividendTax ?? 0);

  const withdrawalFee = toNumber(assumptions.withdrawalFee);
  const marketValueUsd = shares * ledger.price;
  const withdrawalUsd = Math.max(0, marketValueUsd - withdrawalFee);
  const withdrawal = withdrawalUsd * ledger.fx;

  return {
    months: rows.length,
    shares, deducted, deductedUsd, untaxed, dividends, dividendTax, fees,
    marketValueUsd, withdrawalFee, withdrawalUsd, withdrawal,
    profit: withdrawal - deducted,
  };
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
