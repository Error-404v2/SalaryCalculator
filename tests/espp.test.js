import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, summarize, adjustedMonth, valueAt, calculate, esppReport, dividendCash, payslipGainFor } from '../js/core/index.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { hydrate } from '../js/state/migrate.js';

// Synthetic figures only; nothing here is real pay data.
const A = { price: '100', fx: '50', discount: '15', dividend: '2', dividendTax: '15', reinvestRate: '2', reinvestCap: '3', feeIn: '6', withdrawalFee: '10' };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('forecast month: USD at fx, shares at the discounted price, Jan fee', () => {
  const ledger = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 5000 });
  const jan = ledger.rows[0];
  assert.equal(jan.deducted.value, 5000);
  near(jan.deductedUsd.value, 100);
  assert.equal(jan.feesIn, 6);
  near(jan.accredited, 94);
  near(jan.shares.value, 94 / 85);
  near(jan.untaxed, (94 / 85) * 100 - 94);
});

test('locked actuals override the forecast and carry forward', () => {
  const entries = { '2030-01': { deducted: '1234', deductedUsd: '20', shares: '0.5' } };
  const ledger = buildLedger({ year: 2030, entries, assumptions: A, deductionFor: () => 0 });
  const [jan, feb] = ledger.rows;
  assert.equal(jan.deducted.locked, true);
  assert.equal(jan.deducted.value, 1234);
  assert.equal(jan.shares.value, 0.5);
  assert.equal(feb.shares.value, 0.5);
  assert.equal(feb.deducted.locked, false);
});

test('dividend: shares held x $/share, less 15% US tax, less the 2% reinvest fee (max $3)', () => {
  const d = dividendCash(10, A);
  near(d.gross, 20);
  near(d.afterTax, 17);
  near(d.fee, 0.34);
  near(d.net, 16.66);
  assert.equal(dividendCash(1000, A).fee, 3);
});

test('a dividend is reinvested after US tax and the reinvest fee, and buys shares at the reinvestment price', () => {
  const assumptions = { dividend: '1.5', dividendTax: '15', reinvestRate: '2', reinvestCap: '3' };
  const net = dividendCash(4, assumptions).net;
  near(net, 4 * 1.5 * 0.85 * 0.98, 1e-9);
  near(net / 200, 0.02499, 5e-6);
});

test('quarterly dividend uses shares from two months earlier, in grey unless typed', () => {
  const ledger = buildLedger({ year: 2030, entries: { '2030-01': { shares: '10' } }, assumptions: A, deductionFor: () => 0 });
  const mar = ledger.rows[2];
  near(mar.dividend.value, 16.66);
  assert.equal(mar.dividend.locked, false);
  near(mar.reinvestFee, 0.34);
  const typed = buildLedger({ year: 2030, entries: { '2030-01': { shares: '10' }, '2030-03': { dividend: '5' } }, assumptions: A, deductionFor: () => 0 });
  assert.equal(typed.rows[2].dividend.value, 5);
  assert.equal(typed.rows[2].dividend.locked, true);
});

test('a typed dividend changes the shares from that month on', () => {
  const entries = { '2030-01': { shares: '10' } };
  const calc = buildLedger({ year: 2030, entries, assumptions: A, deductionFor: () => 0 });
  const typed = buildLedger({ year: 2030, entries: { ...entries, '2030-03': { dividend: '30' } }, assumptions: A, deductionFor: () => 0 });
  const jump = typed.rows[2].shares.value - calc.rows[2].shares.value;
  assert.ok(jump > 0, 'the typed dividend buys more shares in March');
  assert.ok(typed.rows[11].shares.value - calc.rows[11].shares.value >= jump - 1e-9, 'and they are still held in December');
});

test('Fees in is charged in Jan/Jul only when that month has a Deducted', () => {
  const none = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 0 });
  assert.equal(none.rows[0].feesIn, 0);
  assert.equal(none.rows[6].feesIn, 0);
  const paid = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 5000 });
  assert.equal(paid.rows[0].feesIn, 6);
  assert.equal(paid.rows[6].feesIn, 6);
  assert.equal(paid.rows[1].feesIn, 0);
  const typed = buildLedger({ year: 2030, entries: { '2030-07': { deducted: '100' } }, assumptions: A, deductionFor: () => 0 });
  assert.equal(typed.rows[6].feesIn, 6);
});

test('Deducted USD uses the month own conversion rate when known; EGP/USD shows the rate used', () => {
  const ledger = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 5200, monthRates: { '2030-02': '52' } });
  near(ledger.rows[0].deductedUsd.value, 104);
  near(ledger.rows[1].deductedUsd.value, 100);
  near(ledger.rows[1].usedRate, 52);
  const typed = buildLedger({ year: 2030, entries: { '2030-01': { deducted: '3000', deductedUsd: '60' } }, assumptions: A, deductionFor: () => 0 });
  near(typed.rows[0].usedRate, 50);
});

test('withdrawal = (value − withdrawal fee) × fx; nothing is taxed at withdrawal', () => {
  const ledger = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 5000 });
  const all = summarize(ledger, { assumptions: A });
  near(all.withdrawal, (all.shares * 100 - 10) * 50);
  near(all.profit, all.withdrawal - all.deducted);
  near(all.withdrawalFee, 10);
  const cut = summarize(ledger, { assumptions: A, cutoff: '2030-03' });
  assert.equal(cut.months, 3);
});

test('ESPP gain on the payslip is taxed as pay then offset: net pay drops by its extra tax only', () => {
  const base = { ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '20000', incomes: [] };
  const off = calculate(base);
  const on = calculate({ ...base, espp: { ...base.espp, gain: '1000' } });
  near(on.esppGain / 12, 1000, 1e-6);
  assert.ok(on.esppGainTax > 0);
  near(off.net - on.net, on.esppGainTax, 1e-6);
  near(on.grossAnnual - off.grossAnnual, 12000, 1e-6);
});

const gainState = (over = {}) => ({
  ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '20000', incomes: [],
  espp: { ...structuredClone(DEFAULT_STATE.espp), assumptions: A },
  ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  ...over,
});

test('payslip gain and its tax come from that month in History, not from the Pay tab', () => {
  const month = { amount: '20000', per: 'month', espp: { constPct: '', varPct: '', variable: {}, gain: '1000' } };
  // The Pay tab carries a gain too; it must not leak into the ESPP tab.
  const s = gainState({ months: { '2030-04': month }, espp: { ...gainState().espp, gain: '777' } });
  const apr = payslipGainFor(s, '2030-04');
  near(apr.gain, 1000);
  assert.equal(apr.source, 'history');
  assert.ok(apr.tax > 0);
  near(apr.tax, calculate({ ...s, ...month, espp: { ...s.espp, ...month.espp } }).esppGainTax / 12);
  assert.deepEqual(payslipGainFor(s, '2030-05'), { gain: 0, tax: 0, source: '', taxTyped: false });
  assert.equal(payslipGainFor(s, '2030-03').gain, 0);
});

test('a gain or tax typed in the ESPP tab overrides History, and works with no History month at all', () => {
  const month = { amount: '20000', per: 'month', espp: { constPct: '', varPct: '', variable: {}, gain: '1000' } };
  const entries = { '2030-04': { gain: '2000' }, '2030-06': { gain: '500', gainTax: '99' }, '2030-08': { gainTax: '12' } };
  const s = gainState({ months: { '2030-04': month }, espp: { ...gainState().espp, entries } });
  const apr = payslipGainFor(s, '2030-04');
  near(apr.gain, 2000);
  assert.equal(apr.source, 'typed');
  assert.ok(apr.tax > payslipGainFor({ ...s, espp: { ...s.espp, entries: {} } }, '2030-04').tax, 'a bigger gain costs more tax');
  const jun = payslipGainFor(s, '2030-06');
  near(jun.gain, 500);
  near(jun.tax, 99);
  assert.equal(jun.taxTyped, true);
  const aug = payslipGainFor(s, '2030-08');
  assert.equal(aug.gain, 0);
  near(aug.tax, 12);
});

test('the ESPP report totals payslip gains and their tax to the cutoff and for the year', () => {
  const m = (gain) => ({ amount: '20000', per: 'month', espp: { constPct: '', varPct: '', variable: {}, gain } });
  const s = gainState({ months: { '2030-02': m('1000'), '2030-09': m('3000') } });
  const rep = esppReport(s, new Date(2030, 5, 10));
  near(rep.toDate.payslipGain, 1000);
  near(rep.forecast.payslipGain, 4000);
  assert.ok(rep.toDate.payslipTax > 0 && rep.forecast.payslipTax > rep.toDate.payslipTax);
  assert.equal(rep.ledger.rows[1].payslip.source, 'history');
});

test('adjusted month follows the change day and offset', () => {
  assert.equal(adjustedMonth(new Date(2030, 4, 10), 30, 0), '2030-04');
  assert.equal(adjustedMonth(new Date(2030, 4, 30), 30, 0), '2030-05');
  assert.equal(adjustedMonth(new Date(2030, 0, 5), 30, 0), '2029-12');
  assert.equal(adjustedMonth(new Date(2030, 4, 30), 30, -1), '2030-04');
});

test('history: latest value on or before the month wins', () => {
  const h = [
    { field: 'salary', from: '2030-01', value: '1000' },
    { field: 'salary', from: '2030-07', value: '1200' },
    { field: 'medical', from: '2030-03', value: '50' },
  ];
  assert.equal(valueAt(h, 'salary', '2029-12', 'x'), 'x');
  assert.equal(valueAt(h, 'salary', '2030-06'), '1000');
  assert.equal(valueAt(h, 'salary', '2030-07'), '1200');
  assert.equal(valueAt(h, 'medical', '2030-02', ''), '');
});

test('ESPP deduction: constant % of basic + variable % of ticked extras, after tax', () => {
  const base = { ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000' };
  const off = calculate(base);
  const on = calculate({ ...base, espp: { ...base.espp, constPct: '10', varPct: '5' } });
  near(on.espp.constant / 12, 1000);
  near(on.espp.variable / 12, 50);
  near(on.incomeTax, off.incomeTax);
  near(off.net - on.net, on.espp.total);
  const noVar = calculate({ ...base, espp: { ...base.espp, constPct: '10', varPct: '5', variable: { allowances: false } } });
  assert.equal(noVar.espp.variable, 0);
});

test('ESPP is on only while a percentage is above 0', () => {
  const base = { ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000' };
  const at = (constPct, varPct) => calculate({ ...base, espp: { ...base.espp, constPct, varPct } }).espp.total;
  assert.equal(at('', ''), 0);
  assert.equal(at('0', '0'), 0);
  assert.ok(at('5', '') > 0);
  assert.ok(at('', '5') >= 0);
  assert.ok(at('0', '5') >= 0 && at('0', '0') === 0);
});

test('ESPP months use their own saved month: a saved July changes July only', () => {
  const s = {
    ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000', incomes: [],
    espp: { ...structuredClone(DEFAULT_STATE.espp), constPct: '10', assumptions: A },
    months: { '2030-07': { amount: '20000', per: 'month' } },
    ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  };
  const rep = esppReport(s, new Date(2030, 11, 31));
  near(rep.ledger.rows[5].deducted.value, 1000);
  near(rep.ledger.rows[6].deducted.value, 2000);
});

test('a History month changes only itself: later months fall back to the Pay tab, not to that month', () => {
  const s = {
    ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000', incomes: [],
    espp: { ...structuredClone(DEFAULT_STATE.espp), assumptions: A },
    months: { '2030-08': { amount: '12500', per: 'month', espp: { constPct: '1', varPct: '', variable: {} } } },
    ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  };
  const rows = esppReport(s, new Date(2030, 11, 31)).ledger.rows;
  near(rows[7].deducted.value, 125);
  [8, 9, 10, 11].forEach((i) => assert.equal(rows[i].deducted.value, 0, `month ${i + 1} is not August`));
  assert.deepEqual(rows[8].source, { kind: 'pay', month: '' });
});

test('the withdrawal fee defaults to $54.95, and a blank saved one is filled on load; 0 means no fee', () => {
  assert.equal(DEFAULT_STATE.espp.assumptions.withdrawalFee, '54.95');
  assert.equal(hydrate({ espp: { assumptions: { withdrawalFee: '' } } }).espp.assumptions.withdrawalFee, '54.95');
  assert.equal(hydrate({}).espp.assumptions.withdrawalFee, '54.95');
  assert.equal(hydrate({ espp: { assumptions: { withdrawalFee: '0' } } }).espp.assumptions.withdrawalFee, '0');
  assert.equal(hydrate({ espp: { assumptions: { withdrawalFee: '20' } } }).espp.assumptions.withdrawalFee, '20');
});

test('each ledger month says where its deduction comes from: its own History month or the Pay tab', () => {
  const s = {
    ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000', incomes: [],
    espp: { ...structuredClone(DEFAULT_STATE.espp), constPct: '5', assumptions: A },
    months: { '2030-03': { amount: '20000', per: 'month', espp: { constPct: '10', varPct: '', variable: {} } } },
    ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  };
  const rows = esppReport(s, new Date(2030, 11, 31)).ledger.rows;
  assert.deepEqual(rows[1].source, { kind: 'pay', month: '' });
  assert.deepEqual(rows[2].source, { kind: 'month', month: '2030-03' });
  assert.deepEqual(rows[5].source, { kind: 'pay', month: '' });
  near(rows[5].deducted.value, 500);
  near(rows[1].deducted.value, 500);
  near(rows[2].deducted.value, 2000);
});

test('a typed Deducted value overrides the History one; clearing it brings the History value back', () => {
  const s = {
    ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000', incomes: [],
    espp: { ...structuredClone(DEFAULT_STATE.espp), constPct: '10', assumptions: A, entries: { '2030-02': { deducted: '777' } } },
    ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  };
  const rows = esppReport(s, new Date(2030, 11, 31)).ledger.rows;
  assert.equal(rows[1].deducted.value, 777);
  assert.equal(rows[1].deducted.locked, true);
  near(rows[2].deducted.value, 1000);
});

test('the ESPP year shown follows ui.esppYear, defaulting to this year', () => {
  const base = { ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000' };
  assert.equal(esppReport({ ...base, ui: { ...base.ui, esppYear: '2031' } }, new Date(2026, 9, 1)).year, 2031);
  assert.equal(esppReport(base, new Date(2026, 9, 1)).year, 2026);
});

test('fetched month rates survive reload; bad ones are dropped', () => {
  const s = hydrate({ espp: { rates: { '2026-03': '52.27', '2026-04': '0', junk: '5' } } });
  assert.deepEqual(s.espp.rates, { '2026-03': '52.27' });
});

test('saved ESPP entries and history survive reload; junk keys are dropped', () => {
  const s = hydrate({ espp: { entries: { '2030-02': { deducted: '9' }, bad: { x: 1 } } }, history: [{ field: 'salary', from: '2030-01', value: '1' }, null] });
  assert.deepEqual(Object.keys(s.espp.entries), ['2030-02']);
  assert.equal(s.history.length, 1);
});
