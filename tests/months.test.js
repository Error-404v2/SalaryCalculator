import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPay, withPay, monthList, monthInForce, putMonth, dropMonth, monthsFromHistory } from '../js/core/months.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { calculate } from '../js/core/calculator.js';
import { hydrate } from '../js/state/migrate.js';

// Synthetic figures only.
const base = () => ({
  ...structuredClone(DEFAULT_STATE),
  amount: '10000',
  overtime: [{ type: 'night', hours: '50' }],
  deductions: [{ name: 'Medical insurance', amount: '200', per: 'month', pretax: false }],
});

test('a snapshot copies the whole Pay tab and nothing else', () => {
  const s = base();
  const pay = snapshotPay(s);
  assert.equal(pay.amount, '10000');
  assert.deepEqual(pay.overtime, s.overtime);
  assert.deepEqual(new Set(Object.keys(pay.espp)), new Set(['constPct', 'varPct', 'variable']));
  assert.equal('profiles' in pay, false);
  pay.overtime[0].hours = '1';
  assert.equal(s.overtime[0].hours, '50', 'snapshot is a copy, not a reference');
});

test('withPay applies a month over the state and gives the same figures as typing it in', () => {
  const s = base();
  const pay = { ...snapshotPay(s), amount: '12000' };
  const applied = withPay({ ...s, amount: '1' }, pay);
  const profile = structuredClone(DEFAULT_PROFILE);
  assert.equal(calculate({ ...applied, profile }).net, calculate({ ...s, amount: '12000', profile }).net);
  assert.deepEqual(applied.espp.entries, s.espp.entries, 'ESPP ledger is kept, not overwritten');
});

test('months: list newest first, in force, put and drop', () => {
  let m = putMonth({}, '2026-03', { amount: '1' });
  m = putMonth(m, '2026-01', { amount: '2' });
  assert.deepEqual(monthList(m), ['2026-03', '2026-01']);
  assert.equal(monthInForce(m, '2026-02'), '2026-01');
  assert.equal(monthInForce(m, '2026-05'), '2026-03');
  assert.equal(monthInForce(m, '2025-12'), '');
  assert.deepEqual(monthList(dropMonth(m, '2026-03')), ['2026-01']);
});

test('old per-field history becomes full saved months with the same values', () => {
  const history = [
    { field: 'salary', from: '2026-01', value: '9000' },
    { field: 'medical', from: '2026-01', value: '150' },
    { field: 'salary', from: '2026-04', value: '9500' },
    { field: 'esppConst', from: '2026-04', value: '10' },
  ];
  const months = monthsFromHistory(history, base());
  assert.deepEqual(monthList(months), ['2026-04', '2026-01']);
  assert.equal(months['2026-01'].amount, '9000');
  assert.equal(months['2026-04'].amount, '9500');
  assert.equal(months['2026-04'].deductions.find((d) => /medical/i.test(d.name)).amount, '150', 'inherits medical from January');
  assert.equal(months['2026-04'].espp.constPct, '10');
  assert.deepEqual(months['2026-04'].overtime, base().overtime);
});

test('loading old saved data converts history into months', () => {
  const s = hydrate({ amount: '5000', history: [{ field: 'salary', from: '2026-02', value: '7000' }] });
  assert.deepEqual(monthList(s.months), ['2026-02']);
  assert.equal(s.months['2026-02'].amount, '7000');
  assert.equal(s.amount, '5000', 'the Pay tab itself is unchanged');
});

test('saved months survive a reload untouched', () => {
  const pay = snapshotPay(base());
  const s = hydrate({ months: { '2026-06': pay, junk: {} } });
  assert.deepEqual(monthList(s.months), ['2026-06']);
  assert.deepEqual(s.months['2026-06'], pay);
});
