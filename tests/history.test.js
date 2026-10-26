import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveMonth, hasMonth, groupRows, monthSnapshot, monthsInHistory, companionEntries, setEntry, moveRow, removeRow, freeMonth,
  nearestFirst, removeMonth, monthsOfYear, monthValues, savedMonths, valueAt,
} from '../js/core/history.js';
import { hydrate } from '../js/state/migrate.js';

const H = [
  { field: 'salary', from: '2026-01', value: '10000' },
  { field: 'transport', from: '2026-01', value: '1000' },
  { field: 'esppConst', from: '2026-01', value: '5' },
  { field: 'esppVar', from: '2026-01', value: '3' },
  { field: 'salary', from: '2026-03', value: '12000' },
];

test('saveMonth stores every filled value and leaves other months alone', () => {
  const r = saveMonth(H, '2026-02', { salary: '11000', transport: '', medical: '500', esppConst: '4', esppVar: '' });
  assert.equal(r.saved, 3);
  assert.equal(r.replaced, 0);
  assert.equal(r.history.filter((e) => e.from === '2026-01').length, 4);
  assert.equal(r.history.filter((e) => e.from === '2026-02').length, 3);
});

test('saveMonth overrides an existing month completely', () => {
  assert.equal(hasMonth(H, '2026-03'), true);
  assert.equal(hasMonth(H, '2026-02'), false);
  const r = saveMonth(H, '2026-01', { salary: '10500' });
  assert.equal(r.replaced, 4);
  assert.deepEqual(r.history.filter((e) => e.from === '2026-01'), [{ field: 'salary', from: '2026-01', value: '10500' }]);
});

test('groupRows pairs the two ESPP values on one row per month', () => {
  const rows = groupRows(H, ['esppConst', 'esppVar']);
  assert.deepEqual(rows, [{ from: '2026-01', values: { esppConst: '5', esppVar: '3' } }]);
});

test('monthSnapshot shows inherited values and marks exact ones', () => {
  const s = Object.fromEntries(monthSnapshot(H, '2026-03').map((f) => [f.id, f]));
  assert.equal(s.salary.value, '12000');
  assert.equal(s.salary.exact, true);
  assert.equal(s.transport.value, '1000');
  assert.equal(s.transport.exact, false);
  assert.equal(s.transport.from, '2026-01');
  assert.equal(s.medical.value, '');
  assert.deepEqual(monthsInHistory(H), ['2026-03', '2026-01']);
});

test('adding a salary brings Transportation and Medical unless the month has them', () => {
  const cur = { transport: '1000', medical: '300' };
  assert.deepEqual(companionEntries([], 'salary', '2026-04', cur).map((e) => e.field), ['transport', 'medical']);
  assert.deepEqual(companionEntries(H, 'salary', '2026-01', cur).map((e) => e.field), ['medical']);
  assert.deepEqual(companionEntries([], 'transport', '2026-04', cur), []);
});

test('setEntry, moveRow, removeRow and freeMonth', () => {
  assert.equal(setEntry(H, 'salary', '2026-03', '1').find((e) => e.from === '2026-03').value, '1');
  assert.equal(setEntry(H, 'medical', '2026-03', '9').length, H.length + 1);
  assert.equal(moveRow(H, ['salary'], '2026-03', '2026-01').ok, false);
  assert.equal(moveRow(H, ['salary'], '2026-03', '2026-05').history.at(-1).from, '2026-05');
  assert.equal(removeRow(H, ['esppConst', 'esppVar'], '2026-01').length, 3);
  assert.equal(freeMonth(H, ['salary'], '2026-03'), '2026-02');
  assert.equal(freeMonth([{ field: 'salary', from: '2026-01', value: '' }], ['salary'], '2026-01'), '2025-12');
});

test('nearestFirst orders months by distance, ties go to the later month', () => {
  assert.deepEqual(nearestFirst(['2026-01', '2026-05', '2026-03', '2025-12'], '2026-04'), ['2026-05', '2026-03', '2026-01', '2025-12']);
  assert.deepEqual(nearestFirst(['2026-03', '2026-05'], '2026-04'), ['2026-05', '2026-03']);
});

test('removeMonth drops every entry of that month only', () => {
  const r = removeMonth(H, '2026-01');
  assert.deepEqual(r, [{ field: 'salary', from: '2026-03', value: '12000' }]);
});

test('monthValues fills unset fields from earlier months', () => {
  assert.deepEqual(monthValues(H, '2026-03'), { salary: '12000', transport: '1000', medical: '', esppConst: '5', esppVar: '3' });
  assert.deepEqual(monthValues(H, '2025-12'), { salary: '', transport: '', medical: '', esppConst: '', esppVar: '' });
});

test('savedMonths lists each month with the fields saved in it', () => {
  assert.deepEqual(savedMonths(H), [
    { month: '2026-03', fields: ['salary'] },
    { month: '2026-01', fields: ['salary', 'transport', 'esppConst', 'esppVar'] },
  ]);
});

test('editing a month and saving it changes that month only', () => {
  const edited = { ...monthValues(H, '2026-03'), salary: '12500', medical: '400' };
  const r = saveMonth(H, '2026-03', edited);
  assert.equal(valueAt(r.history, 'salary', '2026-03'), '12500');
  assert.equal(valueAt(r.history, 'medical', '2026-03'), '400');
  assert.equal(valueAt(r.history, 'salary', '2026-01'), '10000');
  assert.equal(r.history.filter((e) => e.from === '2026-01').length, 4);
});

test('a saved By period tab opens the Tax tab, which now holds that table', () => {
  assert.equal(hydrate({ ui: { resTab: 'periods' } }).ui.resTab, 'tax');
  assert.equal(hydrate({ ui: { resTab: 'espp' } }).ui.resTab, 'espp');
});

test('a fresh start has no history and no saved month', () => {
  const s = hydrate(null);
  assert.deepEqual(s.history, []);
  assert.equal(s.ui.histMonth, '');
});

test('monthsOfYear lists twelve months', () => {
  assert.equal(monthsOfYear(2026).length, 12);
  assert.equal(monthsOfYear(2026)[0], '2026-01');
  assert.equal(monthsOfYear(2026)[11], '2026-12');
});
