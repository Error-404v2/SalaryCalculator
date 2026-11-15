import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCsv, parseCsv, readTable, inSelection, entriesCsv, esppCsv, settingsCsv, csvKind, applyCsv, jsonChanges,
} from '../js/core/csv.js';
import { hydrate } from '../js/state/migrate.js';
import { DEFAULT_STATE, DEFAULT_PROFILE } from '../js/data/defaults.js';

// Synthetic figures only; nothing here is real pay data.
const month = (amount, extra = {}) => ({
  amount, per: 'month', mode: 'gross', payPeriod: { months: '1', days: '0' }, jobType: 'ft',
  overrides: { siBase: '', taxable: '', taxablePer: 'month', siProRata: false },
  incomes: [{ name: 'Transportation', amount: '1000', per: 'month', taxable: true, insurable: false, inEspp: true }],
  overtime: [{ type: 'weekday', mult: '1.35', hours: '6' }, { type: 'custom', mult: '2.5', hours: '3' }],
  cashAwards: [{ name: 'Spot award', amount: '50', currency: 'USD', rate: '48', per: 'once', taxable: true, inEspp: false }],
  deductions: [{ name: 'Loan', amount: '300', per: 'month', pretax: true }],
  espp: { constPct: '7', varPct: '3', variable: { allowances: true, overtime: false, cashAwards: true, exempt: true }, gain: '1200' },
  ...extra,
});

function sample() {
  const s = hydrate({});
  s.months = {
    '2030-05': month('9000'),
    '2030-10': month('9500', { incomes: [], overtime: [], scheduleLocal: { weeksPerYear: '50', daysPerWeek: '6', hoursPerDay: '7', otHoursBase: '160' } }),
    '2031-01': month('11000', { overrides: { siBase: '12000', taxable: '', taxablePer: 'month', siProRata: true } }),
  };
  s.espp.entries = { '2030-01': { deducted: '600', deductedUsd: '12.5', shares: '0.06' }, '2030-03': { dividend: '0.2' } };
  s.espp.gainMonths = ['2030-07'];
  s.espp.rates = { '2030-01': '48.1' };
  s.espp.assumptions = { ...s.espp.assumptions, price: '200', fx: '49', dividend: '1.5', withdrawalFee: '20' };
  return s;
}

test('quoting: commas, quotes and line breaks survive a CSV round trip', () => {
  const text = toCsv(['A', 'B'], [['x, y', 'say "hi"'], ['line\nbreak', '']]);
  assert.deepEqual(parseCsv(text), [['A', 'B'], ['x, y', 'say "hi"'], ['line\nbreak', '']]);
});

test('selection: all, a year, or specific months; the global rows are not affected by it', () => {
  assert.equal(inSelection('2030-05', 'all'), true);
  assert.equal(inSelection('2030-05', ['2030']), true);
  assert.equal(inSelection('2030-05', ['2030-05']), true);
  assert.equal(inSelection('2030-05', ['2031']), false);
  assert.equal(inSelection('2030-06', ['2030-05']), false);
});

test('entries.csv: one row per month, a column per item seen, blanks where a month has none', () => {
  const { header, rows } = readTable(entriesCsv(sample().months));
  assert.equal(rows.length, 3);
  assert.ok(header.includes('Overtime: Weekday ×1.35 hours'), 'overtime hours column');
  assert.ok(header.includes('Overtime: Weekday ×1.35 factor'), 'overtime factor column');
  assert.ok(header.includes('Allowance: Transportation amount'));
  assert.ok(header.includes('Cash award: Spot award amount'));
  assert.ok(header.includes('Deduction: Loan amount'));
  const oct = rows.find((r) => r.Month === '2030-10');
  assert.equal(oct['Allowance: Transportation amount'], '', 'a month without the item leaves it blank');
  const may = rows.find((r) => r.Month === '2030-05');
  assert.equal(may['Overtime: Weekday ×1.35 hours'], '6');
  assert.equal(may['Overtime: Weekday ×1.35 factor'], '1.35');
  assert.equal(may['Stocks constant %'], '7');
});

test('entries.csv: a new item in any month adds its columns; the same name twice gets #2', () => {
  const s = sample();
  s.months['2031-02'] = month('8000', { incomes: [{ name: 'Housing', amount: '500', per: 'month', taxable: false, insurable: false, inEspp: true }, { name: 'Housing', amount: '600', per: 'once', taxable: true, insurable: false, inEspp: true }] });
  const { header } = readTable(entriesCsv(s.months));
  assert.ok(header.includes('Allowance: Housing amount'));
  assert.ok(header.includes('Allowance: Housing #2 amount'));
});

test('settings.csv: the global settings, the ESPP assumptions, each tax profile, and the selected months only', () => {
  const s = sample();
  const all = readTable(settingsCsv(s, 'all'));
  const sections = new Set(all.rows.map((r) => r.Section));
  for (const sec of ['Work schedule', 'ESPP assumptions', 'Tax profile', 'Tax bracket', 'Levy', 'SI cap', 'Job type', 'Month']) assert.ok(sections.has(sec), sec);
  assert.ok(all.rows.some((r) => r.Section === 'Month' && r.Month === '2030-10' && r.Setting === 'Work schedule (local): OT base hrs / mo' && r.Value === '160'), 'a local schedule is a month row');
  const picked = readTable(settingsCsv(s, ['2030-10'])).rows;
  assert.ok(picked.some((r) => r.Section === 'Work schedule'), 'the global rows are always there');
  assert.ok(picked.every((r) => r.Section !== 'Month' || r.Month === '2030-10'), 'only the selected month’s rows');
});

test('espp.csv: the ledger, the ESPP Gains list and the fetched rates, one row per month', () => {
  const { rows } = readTable(esppCsv(sample().espp));
  const jan = rows.find((r) => r.Month === '2030-01');
  assert.equal(jan.Deducted, '600');
  assert.equal(jan['Deducted USD'], '12.5');
  assert.equal(jan['USD rate (fetched)'], '48.1');
  assert.equal(rows.find((r) => r.Month === '2030-07')['In ESPP Gains list'], 'yes');
});

test('the three files are recognised by their header', () => {
  const s = sample();
  assert.equal(csvKind(entriesCsv(s.months)), 'entries');
  assert.equal(csvKind(esppCsv(s.espp)), 'espp');
  assert.equal(csvKind(settingsCsv(s)), 'settings');
  assert.equal(csvKind('a,b\n1,2'), '');
});

test('round trip: export all three files, import them into a fresh app, and the months come back the same', () => {
  const s = sample();
  const files = [
    { name: 'entries.csv', text: entriesCsv(s.months) },
    { name: 'espp.csv', text: esppCsv(s.espp) },
    { name: 'settings.csv', text: settingsCsv(s) },
  ];
  const fresh = hydrate({});
  const { state, problems } = applyCsv(fresh, files);
  assert.deepEqual(problems, []);
  for (const m of Object.keys(s.months)) {
    const a = s.months[m], b = state.months[m];
    assert.equal(b.amount, a.amount, `${m} salary`);
    assert.equal(b.per, a.per, `${m} period`);
    assert.deepEqual(b.payPeriod, a.payPeriod, `${m} pro-rata`);
    assert.deepEqual(b.overrides, a.overrides, `${m} overrides`);
    assert.deepEqual(b.overtime, a.overtime, `${m} overtime`);
    assert.deepEqual(b.incomes, a.incomes, `${m} allowances`);
    assert.deepEqual(b.cashAwards, a.cashAwards, `${m} cash awards`);
    assert.deepEqual(b.deductions, a.deductions, `${m} deductions`);
    assert.equal(b.espp.constPct, a.espp.constPct, `${m} stocks`);
    assert.equal(b.espp.gain, a.espp.gain, `${m} gain`);
    assert.deepEqual(b.espp.variable, a.espp.variable, `${m} variable ticks`);
    assert.deepEqual(b.scheduleLocal, a.scheduleLocal, `${m} local schedule`);
  }
  assert.deepEqual(state.espp.entries, s.espp.entries, 'ledger');
  assert.deepEqual(state.espp.gainMonths, s.espp.gainMonths, 'gains list');
  assert.equal(state.espp.assumptions.price, '200', 'ESPP assumptions');
  assert.deepEqual(state.profiles[0].tax.brackets, s.profiles[0].tax.brackets, 'brackets');
  assert.deepEqual(state.profiles[0].si.caps, s.profiles[0].si.caps, 'SI caps');
});

test('applying CSV keeps months and settings that the files do not mention', () => {
  const s = sample();
  const onlyOct = [{ name: 'entries.csv', text: entriesCsv(s.months, ['2030-10']) }];
  const target = hydrate({});
  target.months = { '2029-01': month('5000') };
  const { state, changes } = applyCsv(target, onlyOct);
  assert.ok(state.months['2029-01'], 'a month not in the file is kept');
  assert.ok(state.months['2030-10'], 'the month in the file is added');
  assert.ok(changes.includes('Add month 2030-10'));
});

test('applying CSV lists what it overwrites and adds, and reports bad rows instead of dropping them silently', () => {
  const s = sample();
  const target = structuredClone(s);
  target.months['2030-05'].amount = '1';
  target.espp.assumptions.price = '999';
  const bad = `Month,Gross salary,Salary period,Pro-rata months,Pro-rata days,Stocks constant %,Stocks variable %,ESPP gain\n2030-05,,month,1,0,,,\nnot-a-month,5000,month,1,0,,,\n`;
  const { changes, problems } = applyCsv(target, [
    { name: 'entries.csv', text: bad },
    { name: 'settings.csv', text: settingsCsv(s) },
  ]);
  assert.ok(changes.some((c) => c === 'Overwrite ESPP Share price $: 999 → 200'), 'the overwritten ESPP price is listed, old → new');
  assert.ok(problems.some((p) => p.includes('2030-05') && p.includes('no gross salary')), 'the month without a salary is reported');
  assert.ok(problems.some((p) => p.includes('not-a-month')), 'the bad month name is reported');
  assert.equal(target.months['2030-05'].amount, '1', 'the bad row did not overwrite the month');
});

test('a file that is not one of ours is reported', () => {
  const { problems } = applyCsv(hydrate({}), [{ name: 'random.csv', text: 'x,y\n1,2' }]);
  assert.ok(problems.some((p) => p.includes('random.csv')));
});

test('JSON import lists what it replaces, for the confirmation', () => {
  const s = sample();
  const other = structuredClone(s);
  delete other.months['2030-05'];
  other.months['2031-01'].amount = '1';
  const list = jsonChanges(s, other);
  assert.ok(list.includes('Overwrite month 2031-01'));
  assert.ok(list.some((c) => c.startsWith('Remove month 2030-05')));
  assert.deepEqual(jsonChanges(s, structuredClone(s)), []);
});

test('the default profile survives the settings file round trip', () => {
  const s = hydrate({});
  const { state } = applyCsv(hydrate({}), [{ name: 'settings.csv', text: settingsCsv(s) }]);
  assert.equal(state.profiles[0].name, DEFAULT_PROFILE.name);
  assert.deepEqual(state.profiles[0].tax.brackets, DEFAULT_PROFILE.tax.brackets.map((b) => ({ ...b })));
  assert.equal(state.schedule.otHoursBase, DEFAULT_STATE.schedule.otHoursBase);
});

test('the zip holds the three files and reads back the same text (UTF-8, names intact)', async () => {
  const { zipFiles, unzipFiles, crc32 } = await import('../js/utils/zip.js');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'standard CRC-32 check value');
  const files = [{ name: 'entries.csv', text: 'Month,Gross salary\r\n2030-05,9000\r\n' }, { name: 'settings.csv', text: 'Section,Setting\r\nOvertime ×1.35,x\r\n' }];
  const back = unzipFiles(zipFiles(files, new Date(2030, 4, 1, 12, 0, 0)));
  assert.deepEqual(back, files);
});

test('a cash award shows its value in EGP instead of the rate, and import works the rate back out', () => {
  const s = sample();
  s.months['2030-05'].cashAwards = [
    { name: 'Spot award', amount: '50', currency: 'USD', rate: '48', per: 'once', taxable: true, inEspp: false },
    { name: 'Local bonus', amount: '700', currency: 'EGP', rate: '', per: 'once', taxable: true, inEspp: true },
  ];
  const { header, rows } = readTable(entriesCsv(s.months));
  assert.ok(header.includes('Cash award: Spot award EGP'), 'an EGP column');
  assert.ok(!header.some((h) => h.startsWith('Cash award:') && h.endsWith(' rate')), 'no rate column');
  const may = rows.find((r) => r.Month === '2030-05');
  assert.equal(may['Cash award: Spot award EGP'], '2400', '50 USD x 48');
  assert.equal(may['Cash award: Local bonus EGP'], '700', 'already in EGP');

  const { state } = applyCsv(hydrate({}), [{ name: 'entries.csv', text: entriesCsv(s.months) }]);
  const [spot, local] = state.months['2030-05'].cashAwards;
  assert.equal(spot.rate, '48', 'rate = EGP / amount');
  assert.equal(spot.currency, 'USD');
  assert.equal(local.rate, '', 'an EGP award needs no rate');
});

test('an older entries.csv with a cash award rate column still imports', () => {
  const old = 'Month,Gross salary,Salary period,Pro-rata months,Pro-rata days,Stocks constant %,Stocks variable %,ESPP gain,Cash award: Spot award amount,Cash award: Spot award currency,Cash award: Spot award rate,Cash award: Spot award period\r\n2030-05,9000,month,1,0,,,,50,USD,48.5,once\r\n';
  const { state, problems } = applyCsv(hydrate({}), [{ name: 'entries.csv', text: old }]);
  assert.deepEqual(problems, []);
  assert.equal(state.months['2030-05'].cashAwards[0].rate, '48.5');
});

test('espp.csv leaves out months that have only a fetched USD rate, and keeps the rate on months that are listed', () => {
  const s = sample();
  s.espp.rates = { '2030-01': '48.1', '2030-02': '48.4', '2030-10': '54.1214' };
  const { rows } = readTable(esppCsv(s.espp));
  assert.deepEqual(rows.map((r) => r.Month), ['2030-01', '2030-03', '2030-07'], 'only ledger and Gains-list months');
  assert.equal(rows.find((r) => r.Month === '2030-01')['USD rate (fetched)'], '48.1', 'a listed month keeps its rate');
  assert.ok(!rows.some((r) => r.Month === '2030-10'), 'the rate-only month is not written');
});

test('month settings list only what differs from the defaults; no Mode row', () => {
  const s = hydrate({});
  s.schedule = { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '170' };
  s.months = {
    '2030-01': month('9000', {
      incomes: [{ name: 'Transportation', amount: '1000', per: 'month', taxable: true, insurable: false, inEspp: true }],
      cashAwards: [], deductions: [{ name: 'Medical insurance', amount: '230', per: 'month', pretax: false }],
      espp: { constPct: '', varPct: '', gain: '', variable: { allowances: true, exempt: true, overtime: true, cashAwards: true } },
    }),
    '2030-02': month('9000', {
      incomes: [{ name: 'Language', amount: '300', per: 'month', taxable: true, insurable: true, inEspp: true }],
      cashAwards: [], deductions: [],
      espp: { constPct: '', varPct: '', gain: '', variable: { allowances: true, exempt: true, overtime: false, cashAwards: true } },
      scheduleLocal: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '240' },
    }),
  };
  const rows = readTable(settingsCsv(s)).rows.filter((r) => r.Section === 'Month');
  assert.ok(!rows.some((r) => r.Month === '2030-01'), 'a month on all defaults writes nothing');
  assert.ok(!rows.some((r) => r.Setting === 'Mode'), 'no Mode rows');
  assert.deepEqual(rows.filter((r) => r.Month === '2030-02').map((r) => `${r.Setting}=${r.Value}`), [
    'Stocks variable: Overtime=no',
    'Allowance: Language counts toward SI base=yes',
    'Work schedule (local): OT base hrs / mo=240',
  ], 'only the changed bits, and only the changed local schedule field');
});

test('a month with defaults or a partly listed local schedule round-trips exactly', () => {
  const s = hydrate({});
  s.months = {
    '2030-01': month('9000'),
    '2030-02': month('9100', { scheduleLocal: { ...s.schedule, otHoursBase: '240' } }),
    '2030-03': month('9200', { scheduleLocal: { ...s.schedule } }),
    '2030-04': month('9300', { espp: { constPct: '5', varPct: '', gain: '', variable: {} } }),
  };
  const files = [{ name: 'e', text: entriesCsv(s.months) }, { name: 's', text: settingsCsv(s) }];
  const back = applyCsv(hydrate({}), files).state.months;
  assert.deepEqual(back['2030-02'].scheduleLocal, s.months['2030-02'].scheduleLocal, 'local schedule filled in from the global one');
  assert.deepEqual(back['2030-03'].scheduleLocal, s.months['2030-03'].scheduleLocal, 'a local schedule equal to the global one stays Local');
  assert.deepEqual(back['2030-04'].espp.variable, { allowances: false, exempt: false, overtime: false, cashAwards: false }, 'no ticks stays no ticks');
  assert.deepEqual(back['2030-01'].espp.variable, { allowances: true, exempt: true, overtime: false, cashAwards: true }, 'ticks as they were (overtime off)');
  for (const m of Object.keys(s.months)) assert.equal(back[m].mode, 'gross', 'mode is always gross');
});

test('settings.csv: General, then ESPP, then the active profile right before the tax rows; groups can be left out', () => {
  const s = sample();
  const sections = readTable(settingsCsv(s)).rows.map((r) => r.Section);
  const first = (name) => sections.indexOf(name);
  assert.ok(first('Work schedule') < first('ESPP'), 'general before ESPP');
  assert.ok(first('ESPP assumptions') < first('General'), 'ESPP before the tax part');
  assert.equal(sections[first('General') + 1], 'Tax profile', 'active profile right before the tax rows');
  assert.ok(first('Job type') < first('Month'), 'month settings last');

  const onlyTax = readTable(settingsCsv(s, 'all', ['tax'])).rows;
  assert.ok(onlyTax.length > 0 && onlyTax.every((r) => !['Work schedule', 'ESPP', 'ESPP assumptions', 'Month'].includes(r.Section)), 'only the tax group');
  const noMonths = readTable(settingsCsv(s, 'all', ['general', 'espp', 'tax'])).rows;
  assert.ok(!noMonths.some((r) => r.Section === 'Month'), 'month settings left out');
});

test('JSON import review notices a difference anywhere in the saved data, never "nothing changes" when it does', () => {
  const a = hydrate({});
  const changed = (f) => { const b = structuredClone(a); f(b); return jsonChanges(a, b); };
  assert.ok(changed((b) => { b.amount = '12345'; }).length, 'the starting values for new months');
  assert.ok(changed((b) => { b.incomes = [{ name: 'X', amount: '1', per: 'month' }]; }).length, 'an allowance in the starting values');
  assert.ok(changed((b) => { b.espp.gainMonths = ['2030-01']; }).length, 'the ESPP Gains list');
  assert.ok(changed((b) => { b.espp.rates = { '2030-01': '50' }; }).length, 'the fetched USD rates');
  assert.ok(changed((b) => { b.espp.changeDay = '15'; }).length, 'the ESPP settings');
  assert.ok(changed((b) => { b.ui.theme = 'light'; }).length, 'the view choices');
  assert.ok(changed((b) => { b.somethingNew = 1; }).length, 'data the review does not know about yet');
  assert.deepEqual(changed(() => {}), [], 'identical data: nothing');
});

test('JSON import review ignores key order (an export from another device may list keys differently)', () => {
  const a = hydrate({});
  a.months = { '2030-01': { amount: '1', per: 'month' } };
  const b = structuredClone(a);
  b.months['2030-01'] = { per: 'month', amount: '1' };
  assert.deepEqual(jsonChanges(a, b), []);
});
