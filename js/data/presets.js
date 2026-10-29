export const OT_TYPES = [
  { id: 'holiday', label: 'Holiday', mult: '2' },
  { id: 'restday', label: 'Rest day', mult: '1.7' },
  { id: 'weekday', label: 'Weekday', mult: '1.35' },
  { id: 'regular', label: 'Regular', mult: '1' },
  { id: 'night', label: 'Night shift', mult: '0.09' },
];

export const PRESETS = {
  incomes: [
    { name: 'Transportation', amount: '1000', per: 'month', taxable: true, insurable: false, inEspp: true },
    { name: 'Profit share (GDP)', amount: '', per: 'once', taxable: false, insurable: false, inEspp: true },
    { name: 'Bonus', amount: '', per: 'once', taxable: true, insurable: false, inEspp: true },
  ],
  deductions: [
    { name: 'Medical insurance', amount: '230.8', per: 'month', pretax: false },
    { name: 'Loan', amount: '', per: 'month', pretax: false },
  ],
};

export const BLANK_ROWS = {
  incomes: { name: '', amount: '', per: 'once', taxable: true, insurable: false, inEspp: true },
  cashAwards: { name: 'Cash Award', amount: '', currency: 'USD', rate: '', per: 'once', taxable: true, inEspp: true },
  deductions: { name: '', amount: '', per: 'month', pretax: false },
  '@.tax.brackets': { rate: '', min: '', max: '', exclusion: '' },
  '@.levies': { name: '', rate: '', base: 'gross' },
  '@.si.caps': { year: '', min: '', max: '' },
  '@.jobTypes': { name: 'New type', si: true, exemption: true, mode: 'progressive', flatRate: '' },
};
