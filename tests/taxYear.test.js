import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxYearFor, withPay, calculate } from '../js/core/index.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';

const caps = DEFAULT_PROFILE.si.caps;

test('a month is worked out under its own tax year; a year without caps uses the nearest one that has them', () => {
  assert.equal(taxYearFor('2025-03', caps), '2025');
  assert.equal(taxYearFor('2026-12', caps), '2026');
  assert.equal(taxYearFor('2030-01', caps), '2027', 'later than every cap year: the latest');
  assert.equal(taxYearFor('2020-06', caps), '2024', 'earlier than every cap year: the earliest');
  assert.equal(taxYearFor('2026-05', []), '2026', 'no caps at all: the month year');
  assert.match(taxYearFor('', caps), /^\d{4}$/, 'no month: this year');
});

test('withPay sets the tax year from the month, so two months of different years use their own social insurance caps', () => {
  const base = { ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), year: '2026', incomes: [] };
  const pay = { amount: '20000', per: 'month' };
  const a = calculate(withPay(base, pay, '2024-06'));
  const b = calculate(withPay(base, pay, '2027-06'));
  assert.equal(withPay(base, pay, '2024-06').year, '2024');
  assert.ok(Math.abs(a.si.base - 12600) < 1e-9, '2024 cap');
  assert.ok(Math.abs(b.si.base - 19300) < 1e-9, '2027 cap');
  assert.equal(withPay(base, pay).year, '2026', 'no month: the state year is left alone');
});
