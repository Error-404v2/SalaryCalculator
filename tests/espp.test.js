import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, summarize, payrollTax, adjustedMonth, valueAt, calculate, esppReport } from '../js/core/index.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { hydrate } from '../js/state/migrate.js';

// Synthetic figures only; nothing here is real pay data.
const A = { price: '100', fx: '50', discount: '15', dividend: '2', reinvestRate: '2', reinvestCap: '3', feeIn: '6', taxRate: '25', withdrawalFee: '10' };
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

test('quarterly dividend uses shares from two months earlier, reinvest fee is capped', () => {
  const ledger = buildLedger({ year: 2030, entries: { '2030-01': { shares: '10' } }, assumptions: A, deductionFor: () => 0 });
  const mar = ledger.rows[2];
  assert.equal(mar.dividend.value, 20);
  near(mar.reinvestFee, 0.4);
  const big = buildLedger({ year: 2030, entries: { '2030-01': { shares: '1000' } }, assumptions: A, deductionFor: () => 0 });
  assert.equal(big.rows[2].reinvestFee, 3);
});

test('withdrawal = (value − fee − tax due) × fx; payroll tax reduces tax due', () => {
  const ledger = buildLedger({ year: 2030, assumptions: A, deductionFor: () => 5000 });
  const none = summarize(ledger, { assumptions: A });
  near(none.taxDueUsd, 0.25 * none.untaxed);
  near(none.withdrawal, (none.shares * 100 - 10 - none.taxDueUsd) * 50);
  near(none.profit, none.withdrawal - none.deducted);
  const paid = summarize(ledger, { assumptions: A, payrollTaxUsd: 5 });
  near(paid.taxDueUsd, none.taxDueUsd - 5);
  const cut = summarize(ledger, { assumptions: A, cutoff: '2030-03' });
  assert.equal(cut.months, 3);
});

test('payroll tax events convert to USD at their own rate', () => {
  const p = payrollTax([{ gains: '1000', tax: '250', rate: '50' }, { gains: '', tax: '100', rate: '40' }]);
  near(p.taxUsd, 5 + 2.5);
  near(p.gainsUsd, 20);
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
  const on = calculate({ ...base, espp: { ...base.espp, enabled: true, constPct: '10', varPct: '5' } });
  near(on.espp.constant / 12, 1000);
  near(on.espp.variable / 12, 50);
  near(on.incomeTax, off.incomeTax);
  near(off.net - on.net, on.espp.total);
  const noVar = calculate({ ...base, espp: { ...base.espp, enabled: true, constPct: '10', varPct: '5', variable: { allowances: false } } });
  assert.equal(noVar.espp.variable, 0);
});

test('ESPP months use history: salary rise changes the forecast deduction', () => {
  const s = {
    ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), amount: '10000', incomes: [],
    espp: { ...structuredClone(DEFAULT_STATE.espp), enabled: true, constPct: '10', assumptions: A },
    history: [{ field: 'salary', from: '2030-07', value: '20000' }],
    ui: { ...DEFAULT_STATE.ui, esppYear: '2030' },
  };
  const rep = esppReport(s, new Date(2030, 11, 31));
  near(rep.ledger.rows[5].deducted.value, 1000);
  near(rep.ledger.rows[6].deducted.value, 2000);
});

test('saved ESPP entries and history survive reload; junk keys are dropped', () => {
  const s = hydrate({ espp: { entries: { '2030-02': { deducted: '9' }, bad: { x: 1 } } }, history: [{ field: 'salary', from: '2030-01', value: '1' }, null] });
  assert.deepEqual(Object.keys(s.espp.entries), ['2030-02']);
  assert.equal(s.history.length, 1);
});
