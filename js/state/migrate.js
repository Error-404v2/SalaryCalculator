import { DEFAULT_PROFILE, DEFAULT_STATE } from '../data/defaults.js';
import { OT_TYPES } from '../data/presets.js';
import { isPeriod } from '../core/periods.js';
import { sortOvertime } from '../core/overtime.js';
import { mergeShape } from '../utils/object.js';

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
  [...state.incomes, ...state.deductions, ...state.cashAwards].forEach((item) => {
    if (!isPeriod(item.per)) item.per = 'month';
  });
  sortOvertime(state.overtime);
  return state;
}

export const hydrate = (saved) => sanitize(mergeShape(DEFAULT_STATE, upgradeV1(saved)));
