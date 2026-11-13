import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIncomeTax, calculate, solveForNet, periodsPerYear, validateBrackets, sortOvertime, withImpacts, resolvePayPeriod, fromAnnual, proRataInput, siMonths, periodNet,
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

test('pro-rata: One-Time allowances and deductions are paid in full, not scaled by the days', () => {
  const state = input({
    amount: '30000', payPeriod: { months: '0', days: '15' },
    incomes: [{ name: 'Bonus', amount: '2000', per: 'once', taxable: true }, { name: 'Transport', amount: '1000', per: 'month', taxable: true }],
    deductions: [{ name: 'Fine', amount: '500', per: 'once', pretax: false }, { name: 'Loan', amount: '300', per: 'month', pretax: false }],
  });
  const full = calculate(state);
  const half = calculate(proRataInput(state, 0.5), full.baseAnnual);
  const inPeriod = (annual) => (annual / 12) * 0.5;
  const income = (r, name) => r.incomes.find((i) => i.name === name).annual;
  const deduction = (r, name) => r.deductions.find((d) => d.name === name).annual;
  assert.ok(Math.abs(inPeriod(income(half, 'Bonus')) - 2000) < 1e-6, 'one-time bonus: the full 2,000');
  assert.ok(Math.abs(inPeriod(income(half, 'Transport')) - 500) < 1e-6, 'monthly allowance: half');
  assert.ok(Math.abs(inPeriod(deduction(half, 'Fine')) - 500) < 1e-6, 'one-time deduction: the full 500');
  assert.ok(Math.abs(inPeriod(deduction(half, 'Loan')) - 150) < 1e-6, 'monthly deduction: half');
});

test('pro-rata: social insurance is a whole month by default; the option charges the days too', () => {
  const base = { amount: '10000', payPeriod: { months: '0', days: '15' } };
  const full = calculate(input(base));
  const months = (r) => (r.si.employee / 12) * 0.5 / (full.si.employee / 12);
  const off = calculate(proRataInput(input(base), 0.5), full.baseAnnual);
  assert.ok(Math.abs(months(off) - 1) < 1e-9, '15 days, default: SI for one whole month');
  const on = calculate(proRataInput(input({ ...base, overrides: { siBase: '', taxable: '', taxablePer: 'month', siProRata: true } }), 0.5), full.baseAnnual);
  assert.ok(Math.abs(months(on) - 0.5) < 1e-9, 'with the option: SI for half a month');
  const long = calculate(proRataInput(input({ amount: '10000', payPeriod: { months: '2', days: '10' } }), 2 + 1 / 3), full.baseAnnual);
  assert.ok(Math.abs((long.si.employee / 12) * (2 + 1 / 3) / (full.si.employee / 12) - 2) < 1e-9, '2 months + 10 days, default: 2 months of SI');
  assert.ok(off.net < on.net, 'charging a whole month of SI leaves less net pay');
});

test('periodNet: a month saved with days shows the net of that period, not of a full month', () => {
  const items = {
    incomes: [{ name: 'Bonus', amount: '2000', per: 'once', taxable: true }, { name: 'Transportation', amount: '1000', per: 'month', taxable: true }],
    deductions: [{ name: 'Fine', amount: '500', per: 'once', pretax: false }, { name: 'Loan', amount: '300', per: 'month', pretax: false }],
  };
  const fullMonth = input({ amount: '10000', ...items });
  assert.ok(Math.abs(periodNet(fullMonth) - calculate(fullMonth).net / 12) < 1e-9, 'no days: the normal monthly net');
  const half = input({ amount: '10000', payPeriod: { months: '0', days: '15' }, ...items });
  assert.ok(Math.abs(periodNet(half) - 5060) < 1, '15 days: 5,060 (One-Time items whole, SI a whole month)');
  const withDays = input({ amount: '10000', payPeriod: { months: '0', days: '15' }, overrides: { siBase: '', taxable: '', taxablePer: 'month', siProRata: true }, ...items });
  assert.ok(Math.abs(periodNet(withDays) - 5500) < 1, '15 days with SI days: 5,500');
  const two = input({ amount: '10000', payPeriod: { months: '2', days: '0' } });
  assert.ok(Math.abs(periodNet(two) - 2 * calculate(two).net / 12) < 1e-6, 'two months: twice the monthly net');
  assert.ok(periodNet(input({ amount: '10000', payPeriod: undefined })) > 0, 'an old month without a period still has a net');
});

test('siMonths: whole months, at least one, unless the days are included', () => {
  assert.equal(siMonths({ months: '0', days: '15' }, 0.5, false), 1);
  assert.equal(siMonths({ months: '1', days: '-10' }, 2 / 3, false), 1);
  assert.equal(siMonths({ months: '3', days: '5' }, 3 + 1 / 6, false), 3);
  assert.equal(siMonths({ months: '0', days: '15' }, 0.5, true), 0.5);
  assert.equal(siMonths({ months: '0', days: '0' }, 0, false), 0);
});

test('new state starts with Transportation 1,000 / month', () => {
  assert.deepEqual(DEFAULT_STATE.incomes.map((i) => [i.name, i.amount, i.per]), [['Transportation', '1000', 'month']]);
  const r = calculate({ ...structuredClone(DEFAULT_STATE), amount: '30000', profile: structuredClone(DEFAULT_PROFILE) });
  assert.equal(r.grossAnnual, 31000 * 12);
});

test('taxed allowances carry a net effect that adds up; exempt ones keep their gross', () => {
  const inp = input({
    amount: '30000',
    incomes: [
      { name: 'Bonus', amount: '5000', per: 'month', taxable: true },
      { name: 'Profit share', amount: '2000', per: 'month', taxable: false },
    ],
  });
  const r = withImpacts(inp, calculate(inp));
  const [bonus, profit] = r.incomes;
  assert.ok(bonus.netAnnual > 0 && bonus.netAnnual < bonus.annual);
  assert.equal(profit.netAnnual, undefined);
  assert.ok(Math.abs(bonus.netAnnual - r.incomesNet) < 1e-6);
});

test('cash awards: exempt entries net their full amount, and Monthly equals One-time in the month', () => {
  const award = (per) => input({ amount: '30000', cashAwards: [{ name: 'A', amount: '1000', currency: 'EGP', per, taxable: true }] });
  const once = withImpacts(award('once'), calculate(award('once')));
  const monthly = withImpacts(award('month'), calculate(award('month')));
  assert.equal(once.cashAwards[0].netAnnual / 12, monthly.cashAwards[0].netAnnual / 12);
});

test('"Included in ESPP" takes an allowance out of the ESPP variable base', () => {
  const base = { amount: '30000', espp: { ...DEFAULT_STATE.espp, varPct: '10' } };
  const both = calculate(input({ ...base, incomes: [{ name: 'Bonus', amount: '1000', per: 'month', taxable: true, inEspp: true }] }));
  const off = calculate(input({ ...base, incomes: [{ name: 'Bonus', amount: '1000', per: 'month', taxable: true, inEspp: false }] }));
  assert.equal(both.espp.variable, 1200);
  assert.equal(off.espp.variable, 0);
});
