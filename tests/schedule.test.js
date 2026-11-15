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

test('a month is worked out with its own schedule even when laid over an entry that has a different one', () => {
  const s = base();
  const openEntry = withPay(s, pay({ scheduleLocal: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '100' } }));
  const view = { ...openEntry, globalSchedule: s.schedule };
  const other = pay();
  assert.equal(withPay(view, other).schedule.otHoursBase, '170', 'a Global month uses the global schedule, not the open local one');
  assert.equal(
    calculate(withPay(view, other)).overtimeAnnual,
    calculate(withPay(s, other)).overtimeAnnual,
    'its figures match the ones worked out from the saved state alone',
  );
  const otherLocal = pay({ scheduleLocal: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '150' } });
  assert.equal(withPay(view, otherLocal).schedule.otHoursBase, '150', 'a Local month keeps its own');
});

test('a local schedule survives reload and export/import', () => {
  const local = { weeksPerYear: '48', daysPerWeek: '6', hoursPerDay: '9', otHoursBase: '210' };
  const s = hydrate({ months: putMonth({}, '2030-03', pay({ scheduleLocal: local })) });
  assert.deepEqual(s.months['2030-03'].scheduleLocal, local);
  assert.deepEqual(importData(exportData(s)).months['2030-03'].scheduleLocal, local);
});
