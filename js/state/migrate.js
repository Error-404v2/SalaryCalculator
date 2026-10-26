import { DEFAULT_PROFILE, DEFAULT_STATE } from '../data/defaults.js';
import { OT_TYPES } from '../data/presets.js';
import { isPeriod, isItemPeriod } from '../core/periods.js';
import { sortOvertime } from '../core/overtime.js';
import { mergeShape } from '../utils/object.js';
import { monthsFromHistory } from '../core/months.js';

/** v1 stored tax rules at the root; v2 keeps them inside named profiles. */
function upgradeV1(saved) {
  if (!saved || saved.profiles || !(saved.tax || saved.si || saved.jobTypes)) return saved;
  const { tax = {}, si = {} } = saved;
  const profile = {
    ...DEFAULT_PROFILE,
    currency: saved.currency || DEFAULT_PROFILE.currency,
    tax: { exemption: tax.exemption ?? DEFAULT_PROFILE.tax.exemption, brackets: tax.brackets ?? DEFAULT_PROFILE.tax.brackets },
    levies: tax.martyrsEnabled === false ? [] : [{ name: 'Martyrs fund', rate: tax.martyrsRate ?? '0.05', base: 'gross' }],
    si: { employeeRate: si.employeeRate, employerRate: si.employerRate, caps: si.caps ?? DEFAULT_PROFILE.si.caps },
    jobTypes: saved.jobTypes ?? DEFAULT_PROFILE.jobTypes,
  };
  const overtime = (saved.overtime ?? []).map((o) => {
    const preset = OT_TYPES.find((t) => Number(t.mult) === Number(o.mult));
    return { type: preset ? preset.id : 'custom', mult: String(o.mult ?? ''), hours: o.hours ?? '' };
  });
  return {
    ...saved,
    profiles: [profile],
    profileId: profile.id,
    overtime,
    overrides: { siBase: si.baseOverride ?? '', taxable: tax.overrideTaxable ?? '', taxablePer: tax.overridePer ?? 'month' },
  };
}

function sanitize(state) {
  state.profiles = (state.profiles.length ? state.profiles : [DEFAULT_PROFILE]).map((p) => mergeShape(DEFAULT_PROFILE, p));
  if (!state.profiles.some((p) => p.id === state.profileId)) state.profileId = state.profiles[0].id;

  if (!isPeriod(state.per)) state.per = DEFAULT_STATE.per;
  if (!isPeriod(state.overrides.taxablePer)) state.overrides.taxablePer = 'month';
  if (!isPeriod(state.ui.period)) state.ui.period = DEFAULT_STATE.ui.period;
  if (state.ui.resTab === 'periods') state.ui.resTab = 'tax';
  [...state.incomes, ...state.deductions, ...state.cashAwards].forEach((item) => {
    if (!isItemPeriod(item.per)) item.per = 'month';
  });
  sortOvertime(state.overtime);
  return state;
}

const MONTH = /^\d{4}-\d{2}$/;

/** `espp.entries` is keyed by month, so it can't be merged against the (empty) default shape. */
function restoreEntries(state, saved) {
  const raw = saved?.espp?.entries;
  const entries = {};
  if (raw && typeof raw === 'object') {
    for (const [month, row] of Object.entries(raw)) {
      if (MONTH.test(month) && row && typeof row === 'object') entries[month] = { ...row };
    }
  }
  state.espp.entries = entries;
  state.history = (state.history ?? []).filter((h) => h && typeof h === 'object' && h.field);
  return state;
}

/**
 * Saved months are keyed by month, so (like ESPP entries) they are restored by hand. Data saved before months
 * existed only has the per-field history; it is converted once, using the Pay tab as the starting point.
 */
function restoreMonths(state, saved) {
  const raw = saved?.months;
  const months = {};
  if (raw && typeof raw === 'object') {
    for (const [month, pay] of Object.entries(raw)) {
      if (MONTH.test(month) && pay && typeof pay === 'object' && 'amount' in pay) months[month] = pay;
    }
  }
  state.months = Object.keys(months).length || raw ? months : monthsFromHistory(state.history, state);
  return state;
}

export function hydrate(saved) {
  const upgraded = upgradeV1(saved);
  return sanitize(restoreMonths(restoreEntries(mergeShape(DEFAULT_STATE, upgraded), upgraded), upgraded));
}
