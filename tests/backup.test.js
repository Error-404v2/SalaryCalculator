import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportData, importData, BACKUP_KIND } from '../js/state/backup.js';
import { hydrate } from '../js/state/migrate.js';
import { DEFAULT_STATE } from '../js/data/defaults.js';

// Synthetic figures only; nothing here is real pay data.
const month = (amount, extra = {}) => ({
  amount, per: 'month', mode: 'gross', payPeriod: { month: '1', day: '0' }, jobType: 'full',
  overrides: { siBase: '', taxable: '', taxablePer: 'month' },
  incomes: [{ name: 'Transportation', amount: '700', per: 'month', taxable: true, insurable: false }],
  overtime: [{ type: 'weekday', mult: '1.35', hours: '6' }],
  cashAwards: [{ name: 'Spot award', amount: '50', currency: 'USD', rate: '48', per: 'once', taxable: true }],
  deductions: [{ name: 'Loan', amount: '300', per: 'month', pretax: false }],
  espp: { constPct: '7', varPct: '3', variable: { allowances: true, overtime: false, cashAwards: true, exempt: true }, gain: '1200' },
  ...extra,
});

function fullState() {
  const s = hydrate({});
  s.amount = '9000';
  s.months = { '2030-05': month('9000'), '2030-10': month('9500', { espp: { constPct: '8', varPct: '', variable: {}, gain: '' } }) };
  s.espp.entries = { '2030-01': { deducted: '600', deductedUsd: '12.5', shares: '0.06' }, '2030-03': { dividend: '0.2' }, '2030-07': { gain: '400' } };
  s.espp.gainMonths = ['2030-07', '2030-02'];
  s.espp.rates = { '2030-01': '48.1', '2030-02': '48.4' };
  s.espp.assumptions = { ...s.espp.assumptions, price: '200', fx: '49', dividend: '1.5', withdrawalFee: '20' };
  s.ui.esppYear = '2030';
  s.ui.bracketPeriod = 'year';
  return s;
}

test('export wraps the whole state, and import brings every month, its entries and the ESPP values back', () => {
  const before = fullState();
  const file = JSON.parse(JSON.stringify(exportData(before, new Date('2030-11-02T10:00:00Z'))));
  assert.equal(file.kind, BACKUP_KIND);
  assert.equal(file.exportedAt, '2030-11-02T10:00:00.000Z');
  const after = importData(JSON.stringify(file));

  assert.deepEqual(after.months, before.months, 'every History month with all its inside entries');
  assert.deepEqual(after.espp.entries, before.espp.entries, 'ledger values');
  assert.deepEqual(after.espp.gainMonths, before.espp.gainMonths, 'ESPP Gains entries');
  assert.deepEqual(after.espp.rates, before.espp.rates, 'fetched month rates');
  assert.deepEqual(after.espp.assumptions, before.espp.assumptions);
  assert.equal(after.amount, '9000');
  assert.equal(after.ui.bracketPeriod, 'year');
  assert.deepEqual(after, before, 'nothing else is lost or changed either');
});

test('importing is stable: loading the same file again (or the imported state) gives the same result', () => {
  const once = importData(exportData(fullState()));
  assert.deepEqual(hydrate(once), once);
  assert.deepEqual(importData(exportData(once)), once);
});

test('an export from before the wrapper (the bare state) still imports', () => {
  const old = JSON.parse(JSON.stringify(fullState()));
  const after = importData(JSON.stringify(old));
  assert.deepEqual(after.months, old.months);
  assert.deepEqual(after.espp.entries, old.espp.entries);
});

test('a file that is not a settings file is refused', () => {
  assert.throws(() => importData('not json'));
  assert.throws(() => importData('[]'), /not a settings file/);
  assert.throws(() => importData('null'), /not a settings file/);
  assert.throws(() => importData(JSON.stringify({ kind: BACKUP_KIND, state: [] })), /not a settings file/);
});

test('the default state round-trips too', () => {
  const s = hydrate(structuredClone(DEFAULT_STATE));
  assert.deepEqual(importData(exportData(s)), s);
});
