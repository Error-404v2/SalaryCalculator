import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPay, calculate, isLocalSchedule, grossPay, putMonth } from '../js/core/index.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';
import { hydrate } from '../js/state/migrate.js';
import { exportData, importData } from '../js/state/backup.js';

// Synthetic figures only.
const base = () => ({ ...structuredClone(DEFAULT_STATE), profile: structuredClone(DEFAULT_PROFILE), incomes: [] });
const pay = (extra = {}) => ({ amount: '17000', per: 'month', overtime: [{ type: 'weekday', mult: '1.35', hours: '10' }], ...extra });

test('the work schedule defaults stay 52 weeks, 5 days, 8 hours, 170 OT hours', () => {
  assert.deepEqual(DEFAULT_STATE.schedule, { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '170' });
});

test('a month without its own schedule follows the global one (Global)', () => {
  const s = { ...base(), schedule: { ...base().schedule, otHoursBase: '200' } };
  const m = withPay(s, pay());
  assert.equal(m.schedule.otHoursBase, '200');
  assert.equal(isLocalSchedule(pay().scheduleLocal), false);
});

test('a month with a local schedule uses it, whatever the global one says (Local)', () => {
  const s = base();
  const local = pay({ scheduleLocal: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '100' } });
  const global = calculate(withPay(s, pay()));
  const own = calculate(withPay(s, local));
  assert.equal(withPay(s, local).schedule.otHoursBase, '100');
  assert.ok(own.hourlyRate > global.hourlyRate, 'fewer OT base hours: a higher OT hourly rate');
  assert.ok(own.overtimeAnnual > global.overtimeAnnual);
});

test('changing the global schedule changes Global months only', () => {
  const months = { '2030-01': pay(), '2030-02': pay({ scheduleLocal: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '170' } }) };
  const s = { ...base(), months, schedule: { ...base().schedule, otHoursBase: '240' } };
  assert.equal(withPay(s, months['2030-01']).schedule.otHoursBase, '240', 'Global month follows');
  assert.equal(withPay(s, months['2030-02']).schedule.otHoursBase, '170', 'Local month keeps its own');
});

test('a month created from another carries its schedule choice and values forward', () => {
  const from = pay({ scheduleLocal: { weeksPerYear: '50', daysPerWeek: '6', hoursPerDay: '7', otHoursBase: '180' } });
  const copy = structuredClone(from);
  assert.deepEqual(copy.scheduleLocal, from.scheduleLocal);
  const saved = grossPay(copy, base());
  assert.deepEqual(saved.scheduleLocal, from.scheduleLocal, 'saving keeps it');
  assert.equal(grossPay(pay(), base()).scheduleLocal, undefined, 'a Global month stays Global');
});

test('a local schedule survives reload and export/import', () => {
  const local = { weeksPerYear: '48', daysPerWeek: '6', hoursPerDay: '9', otHoursBase: '210' };
  const s = hydrate({ months: putMonth({}, '2030-03', pay({ scheduleLocal: local })) });
  assert.deepEqual(s.months['2030-03'].scheduleLocal, local);
  assert.deepEqual(importData(exportData(s)).months['2030-03'].scheduleLocal, local);
});
