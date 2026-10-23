import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIncomeTax, calculate, solveForNet, periodsPerYear, validateBrackets, sortOvertime, withImpacts, resolvePayPeriod, fromAnnual, proRataInput,
} from '../js/core/index.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { stepValue } from '../js/utils/number.js';
import { hydrate } from '../js/state/migrate.js';

const brackets = DEFAULT_PROFILE.tax.brackets;
// Engine tests start from a bare salary; the default Transportation allowance is covered separately.
const input = (over = {}) => ({ ...structuredClone(DEFAULT_STATE), incomes: [], profile: structuredClone(DEFAULT_PROFILE), ...over });

test('progressive tax below every exclusion threshold', () => {
  assert.equal(computeIncomeTax(30000, brackets).total, 0);
  assert.equal(computeIncomeTax(100000, brackets).total, 9750);
  assert.equal(computeIncomeTax(500000, brackets).total, 99750);
});

test('exclusion rule drops lower brackets', () => {
  assert.equal(computeIncomeTax(650000, brackets).total, 141250);
  assert.equal(computeIncomeTax(1000000, brackets).total, 240000);
  assert.equal(computeIncomeTax(1300000, brackets).total, 327500);
  assert.equal(computeIncomeTax(3000000, brackets).total, 795000);
});

test('marginal rate reports the highest bracket used', () => {
  assert.equal(computeIncomeTax(100000, brackets).marginalRate, 20);
  assert.equal(computeIncomeTax(0, brackets).marginalRate, 0);
});

test('30k monthly full-time matches expected deductions', () => {
  const r = calculate(input({ amount: '30000' }));
  assert.equal(Math.round(r.si.employee / 12), 1837);
  assert.equal(Math.round(r.leviesTotal / 12), 15);
  assert.equal(Math.round(r.net / 12), 23457);
});

test('manual taxable amount overrides the computed one', () => {
  const r = calculate(input({ amount: '30000', overrides: { siBase: '', taxable: '10000', taxablePer: 'month' } }));
  assert.equal(r.overridden, true);
  assert.equal(r.taxableAnnual, 120000);
});

test('flat-rate job type skips SI and brackets', () => {
  const r = calculate(input({ amount: '10000', jobType: 'co' }));
  assert.equal(r.si.employee, 0);
  assert.equal(r.incomeTax, 12000);
});

test('net → gross solver round-trips', () => {
  const state = input({ amount: '30000' });
  const solved = solveForNet(state, calculate(state).net);
  assert.ok(Math.abs(solved.baseAnnual - 360000) < 0.01);
});

test('period conversion follows schedule', () => {
  assert.equal(periodsPerYear('hour', { weeksPerYear: 52, daysPerWeek: 5, hoursPerDay: 8 }), 2080);
  assert.equal(periodsPerYear('month'), 12);
});

test('bracket validation catches gaps', () => {
  assert.deepEqual(validateBrackets(brackets), []);
  const broken = structuredClone(brackets);
  broken[1].min = '45000';
  assert.equal(validateBrackets(broken).length, 1);
});

test('stepValue adds, parses commas, and never goes below zero', () => {
  assert.equal(stepValue('', 100), 100);
  assert.equal(stepValue('30,000', 100), 30100);
  assert.equal(stepValue('50', -100), 0);
});

test('overtime sorts presets in fixed order, then custom by multiplier', () => {
  const list = [
    { type: 'night' }, { type: 'custom', mult: '1.5' }, { type: 'holiday' }, { type: 'custom', mult: '3' }, { type: 'weekday' },
  ];
  assert.deepEqual(sortOvertime(list).map((o) => o.type + (o.mult ?? '')), ['holiday', 'weekday', 'night', 'custom3', 'custom1.5']);
});

test('overtime net impact = net with OT − net without, split pro-rata', () => {
  const state = input({ amount: '30000', overtime: [{ type: 'holiday', hours: '10' }, { type: 'weekday', hours: '10' }] });
  const r = withImpacts(state, calculate(state));
  const without = calculate({ ...state, overtime: [] }).net;
  assert.ok(Math.abs(r.overtimeNet - (r.net - without)) < 1e-6);
  assert.ok(Math.abs(r.overtime[0].netAnnual + r.overtime[1].netAnnual - r.overtimeNet) < 1e-6);
  assert.ok(r.overtimeNet < r.overtimeAnnual);
});

test('cash award converts currency and is taxed', () => {
  const state = input({ amount: '30000', cashAwards: [{ name: 'Award', amount: '1000', currency: 'USD', rate: '50', per: 'year', taxable: true }] });
  const r = calculate(state);
  assert.equal(r.cashAwards[0].annual, 50000);
  assert.equal(r.grossAnnual, 360000 + 50000);
});

test('v1 saved state migrates into a profile', () => {
  const s = hydrate({ amount: '5', tax: { exemption: '25000', martyrsEnabled: false }, overtime: [{ label: 'x', mult: '2', hours: '4' }] });
  assert.equal(s.profiles.length, 1);
  assert.equal(s.profiles[0].tax.exemption, '25000');
  assert.deepEqual(s.profiles[0].levies, []);
  assert.equal(s.overtime[0].type, 'holiday');
});

test('pro-rata pay period follows the sheet: months + days/30', () => {
  assert.equal(resolvePayPeriod({ months: '1', days: '0' }).standard, true);
  const half = resolvePayPeriod({ months: '0', days: '15' });
  assert.equal(half.factor, 0.5);
  assert.equal(half.label, '15 days');
  const extra = resolvePayPeriod({ months: '1', days: '-10' });
  assert.ok(Math.abs(extra.factor - 2 / 3) < 1e-12);
  assert.equal(extra.label, '1 month − 10 days');
  assert.equal(fromAnnual(120000, 'month', {}, 0.5), 5000);
  assert.equal(fromAnnual(120000, 'year', {}, 0.5), 120000);
});

test('pro-rata scales salary, brackets and exemption but keeps actual overtime and awards', () => {
  const state = input({ amount: '30000', overtime: [{ type: 'weekday', hours: '10' }],
    cashAwards: [{ amount: '1000', currency: 'EGP', per: 'year', taxable: true }] });
  const full = calculate(state);
  const half = calculate(proRataInput(state, 0.5), full.baseAnnual);
  const perPeriod = (r) => (r.overtimeAnnual / 12) * 0.5;
  assert.ok(Math.abs(perPeriod(half) - full.overtimeAnnual / 12) < 1e-6);
  assert.ok(Math.abs((half.cashAwards[0].annual) * 0.5 - 1000) < 1e-6);
  assert.ok(Math.abs((half.baseAnnual / 12) * 0.5 - 15000) < 1e-6);
});

test('new state starts with Transportation 1,000 / month', () => {
  assert.deepEqual(DEFAULT_STATE.incomes.map((i) => [i.name, i.amount, i.per]), [['Transportation', '1000', 'month']]);
  const r = calculate({ ...structuredClone(DEFAULT_STATE), amount: '30000', profile: structuredClone(DEFAULT_PROFILE) });
  assert.equal(r.grossAnnual, 31000 * 12);
});
