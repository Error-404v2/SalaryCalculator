import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPay, withPay, monthList, monthInForce, putMonth, dropMonth, monthsFromHistory, grossPay, moveMonth, monthChoices } from '../js/core/months.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { calculate } from '../js/core/calculator.js';
import { hydrate } from '../js/state/migrate.js';
import { groupDigits } from '../js/utils/format.js';

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
  assert.deepEqual(new Set(Object.keys(pay.espp)), new Set(['constPct', 'varPct', 'variable', 'gain']));
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

test('a Net → Gross Pay tab is saved as the gross that gives that net', () => {
  const profile = structuredClone(DEFAULT_PROFILE);
  const s = { ...base(), mode: 'net', amount: '8000', profile };
  const pay = grossPay(snapshotPay(s), s);
  assert.equal(pay.mode, 'gross');
  const gross = Number(pay.amount);
  assert.ok(gross > 8000, 'gross is above the target net');
  const net = calculate({ ...withPay(s, pay), profile }).net / 12;
  assert.ok(Math.abs(net - 8000) < 0.05, `net ${net} ≈ 8000`);
});

test('a gross month is stored unchanged', () => {
  const s = { ...base(), profile: structuredClone(DEFAULT_PROFILE) };
  const pay = snapshotPay(s);
  assert.deepEqual(grossPay(pay, s), pay);
});

test('months saved earlier as Net → Gross are converted to gross on load', () => {
  const pay = { ...snapshotPay(base()), mode: 'net', amount: '8000' };
  const s = hydrate({ months: { '2026-04': pay } });
  assert.equal(s.months['2026-04'].mode, 'gross');
  assert.ok(Number(s.months['2026-04'].amount) > 8000);
});

test('moving a saved entry re-dates it instead of adding another month', () => {
  let m = putMonth(putMonth({}, '2026-11', { amount: '1' }), '2026-10', { amount: '2' });
  m = moveMonth(m, '2026-11', '2027-02', { amount: '3' });
  assert.deepEqual(monthList(m), ['2027-02', '2026-10']);
  assert.equal(m['2027-02'].amount, '3');
  assert.equal(m['2026-10'].amount, '2', 'other months are untouched');
});

test('moving with no origin just saves; moving onto the same month keeps it', () => {
  assert.deepEqual(monthList(moveMonth({}, '', '2026-05', { amount: '1' })), ['2026-05']);
  const m = putMonth({}, '2026-05', { amount: '1' });
  assert.deepEqual(monthList(moveMonth(m, '2026-05', '2026-05', { amount: '9' })), ['2026-05']);
  assert.equal(moveMonth(m, '2026-05', '2026-05', { amount: '9' })['2026-05'].amount, '9');
});

test('Save Month choices: saved months nearest first, then the unsaved calendar pick', () => {
  const m = { '2026-10': {}, '2026-08': {}, '2026-12': {} };
  assert.deepEqual(monthChoices(m, '2026-10').map((c) => c.month), ['2026-10', '2026-12', '2026-08'], 'ties go to the later month');
  const withPick = monthChoices(m, '2026-10', '2027-03');
  assert.deepEqual(withPick.at(-1), { month: '2027-03', saved: false });
  assert.equal(monthChoices(m, '2026-10', '2026-08').length, 3, 'a pick that got saved is not listed twice');
  assert.deepEqual(monthChoices({}, '2026-10'), []);
});

test('money fields show grouped digits; the stored value stays plain', () => {
  assert.equal(groupDigits('45000'), '45,000');
  assert.equal(groupDigits('1234567.5'), '1,234,567.5');
  assert.equal(groupDigits('45,000'), '45,000');
  assert.equal(groupDigits(''), '');
  assert.equal(groupDigits('12a'), '12a', 'half-typed text is left alone');
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
