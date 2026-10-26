const EGYPT_BRACKETS_2026 = [
  // [rate %, from, to, excluded above]
  [0, 0, 40000, 600000],
  [10, 40000, 55000, 700000],
  [15, 55000, 70000, 800000],
  [20, 70000, 200000, 900000],
  [22.5, 200000, 400000, 1200000],
  [25, 400000, 1200000, ''],
  [27.5, 1200000, '', ''],
].map(([rate, min, max, exclusion]) => ({
  rate: String(rate), min: String(min), max: String(max), exclusion: String(exclusion),
}));

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR'];

/** A tax profile holds every country-specific rule, so other tax systems are just another profile. */
export const DEFAULT_PROFILE = Object.freeze({
  id: 'eg-2026',
  name: 'Egypt 2026',
  currency: 'EGP',
  tax: { exemption: '20000', brackets: EGYPT_BRACKETS_2026 },
  levies: [{ name: 'Martyrs fund', rate: '0.05', base: 'gross' }],
  si: {
    employeeRate: '11',
    employerRate: '18.75',
    caps: [
      { year: '2024', min: '', max: '12600' },
      { year: '2025', min: '', max: '14500' },
      { year: '2026', min: '', max: '16700' },
      { year: '2027', min: '', max: '19300' },
    ],
  },
  jobTypes: [
    { id: 'ft', name: 'Full-time', si: true, exemption: true, mode: 'progressive', flatRate: '' },
    { id: 'pt', name: 'Part-time', si: true, exemption: true, mode: 'progressive', flatRate: '' },
    { id: 'fl', name: 'Freelancer', si: false, exemption: true, mode: 'progressive', flatRate: '' },
    { id: 'co', name: 'Consultant', si: false, exemption: false, mode: 'flat', flatRate: '10' },
  ],
});

export const DEFAULT_STATE = Object.freeze({
  amount: '',
  per: 'month',
  mode: 'gross',
  year: '2026',
  jobType: 'ft',
  profileId: DEFAULT_PROFILE.id,
  profiles: [DEFAULT_PROFILE],
  overrides: { siBase: '', taxable: '', taxablePer: 'month' },
  payPeriod: { months: '1', days: '0' },
  schedule: { weeksPerYear: '52', daysPerWeek: '5', hoursPerDay: '8', otHoursBase: '170' },
  incomes: [{ name: 'Transportation', amount: '1000', per: 'month', taxable: true, insurable: false }],
  overtime: [],
  cashAwards: [],
  deductions: [],
  /** ESPP: deducted after tax. `constPct` applies to basic, `varPct` to the parts ticked in `variable`. */
  espp: {
    constPct: '',
    varPct: '',
    variable: { allowances: true, overtime: true, cashAwards: true, exempt: true },
    symbol: 'IBM',
    assumptions: {
      price: '', fx: '', discount: '15', dividend: '', reinvestRate: '2', reinvestCap: '3',
      feeIn: '6', taxRate: '25', withdrawalFee: '',
    },
    changeDay: '30',
    monthOffset: '0',
    entries: {},
    payrollTax: [],
  },
  /** Dated values: { field, from: 'YYYY-MM', value }. The latest `from` on or before a month applies. */
  history: [],
  /** Saved months: "YYYY-MM" → a full copy of the Pay tab inputs for that month (see core/months.js). */
  months: {},
  ui: {
    inTab: 'pay',
    resTab: 'summary',
    esppYear: '',
    histMonth: '',
    period: 'month',
    theme: '',
    taxEdit: false,
    open: { overtime: false, extras: false, deductions: false, espp: false, options: false, settings: false, brackets: false, exemption: false, levies: false, si: false, jobs: false, esppTable: true, esppAssumptions: false, esppPayroll: false, esppVariable: false, histSaved: true },
  },
});
