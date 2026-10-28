import { toNumber, isFilled, sum } from '../utils/number.js';
import { toAnnual } from './periods.js';
import { computeIncomeTax } from './incomeTax.js';
import { computeSocialInsurance } from './socialInsurance.js';
import { multiplierOf, overtimeLabel } from './overtime.js';

const FALLBACK_JOB = { si: true, exemption: true, mode: 'progressive', flatRate: 0 };

export const findJob = (profile, jobType) =>
  profile.jobTypes?.find((j) => j.id === jobType) ?? profile.jobTypes?.[0] ?? FALLBACK_JOB;

export const exchangeRate = (award, localCurrency) => (award.currency === localCurrency ? 1 : toNumber(award.rate));

function annualizeIncomes(incomes, schedule) {
  return incomes.map((it) => ({
    name: it.name || 'Allowance',
    annual: toAnnual(it.amount, it.per || 'month', schedule),
    taxable: it.taxable !== false,
    insurable: !!it.insurable,
  }));
}

function annualizeOvertime(overtime, hourlyRate) {
  return overtime.map((o) => ({
    label: overtimeLabel(o),
    annual: hourlyRate * multiplierOf(o) * toNumber(o.hours) * 12,
  }));
}

function annualizeCashAwards(awards, currency, schedule) {
  return awards.map((a) => {
    const per = a.per || 'year';
    const rate = exchangeRate(a, currency);
    return {
      name: a.name || 'Cash award',
      per,
      annual: toAnnual(toNumber(a.amount) * rate, per, schedule),
      taxable: a.taxable !== false,
      missingRate: toNumber(a.amount) > 0 && !(rate > 0),
    };
  });
}

function annualizeDeductions(deductions, schedule) {
  return deductions.map((d) => ({
    name: d.name || 'Deduction',
    annual: toAnnual(d.amount, d.per || 'month', schedule),
    pretax: !!d.pretax,
  }));
}

/**
 * ESPP comes out of net pay (after tax): constant % of basic + variable % of the chosen variable parts.
 * It is active whenever either percentage is above 0.
 */
function computeEspp(espp, parts) {
  if (!(toNumber(espp?.constPct) > 0 || toNumber(espp?.varPct) > 0)) return { constant: 0, variable: 0, total: 0, constBase: 0, varBase: 0 };
  const v = espp.variable ?? {};
  const varBase = (v.allowances ? parts.taxableAllowances : 0) + (v.exempt ? parts.exemptAllowances : 0)
    + (v.overtime ? parts.overtimeAnnual : 0) + (v.cashAwards ? parts.cashAwardsAnnual : 0);
  const constant = (parts.baseAnnual * toNumber(espp.constPct)) / 100;
  const variable = (varBase * toNumber(espp.varPct)) / 100;
  return { constant, variable, total: constant + variable, constBase: parts.baseAnnual, varBase };
}

function computeLevies(levies, grossAnnual, taxableAnnual) {
  return levies.map((l) => {
    const rate = toNumber(l.rate);
    const base = l.base === 'taxable' ? taxableAnnual : grossAnnual;
    return { name: l.name || 'Levy', rate, base: l.base, annual: (base * rate) / 100 };
  });
}

/**
 * Full breakdown, all money values annual.
 * `input` is the app state plus the active `profile`; `baseAnnualOverride` is used by the net→gross solver.
 */
export function calculate(input, baseAnnualOverride) {
  const { profile, schedule = {}, overrides = {} } = input;
  const job = findJob(profile, input.jobType);

  const baseAnnual = baseAnnualOverride ?? toAnnual(input.amount, input.per, schedule);
  const otHoursBase = toNumber(schedule.otHoursBase);
  const hourlyRate = otHoursBase > 0 ? baseAnnual / 12 / otHoursBase : 0;

  const incomes = annualizeIncomes(input.incomes ?? [], schedule);
  const overtime = annualizeOvertime(input.overtime ?? [], hourlyRate);
  const cashAwards = annualizeCashAwards(input.cashAwards ?? [], profile.currency, schedule);
  const deductions = annualizeDeductions(input.deductions ?? [], schedule);

  const extras = [...incomes, ...cashAwards];
  const taxableExtras = sum(extras.filter((i) => i.taxable), (i) => i.annual);
  const exemptAllowances = sum(extras.filter((i) => !i.taxable), (i) => i.annual);
  const insurableAllowances = sum(incomes.filter((i) => i.insurable), (i) => i.annual);
  const overtimeAnnual = sum(overtime, (o) => o.annual);
  const preTax = sum(deductions.filter((d) => d.pretax), (d) => d.annual);
  const postTax = sum(deductions.filter((d) => !d.pretax), (d) => d.annual);

  // ESPP gain (the 15% discount on shares bought): payroll adds it to taxable pay ("ESPP gain") and takes it
  // straight back out ("ESPP gain offset"), so the only cost to net pay is the extra income tax.
  const esppGain = toAnnual(input.espp?.gain, 'once', schedule);
  const grossTaxable = baseAnnual + taxableExtras + overtimeAnnual + esppGain;
  const grossAnnual = grossTaxable + exemptAllowances;

  const si = computeSocialInsurance({
    si: profile.si,
    baseOverride: overrides.siBase,
    year: input.year,
    enabled: !!job.si,
    insurableMonthly: (baseAnnual + insurableAllowances) / 12,
  });

  const exemption = job.exemption ? toNumber(profile.tax?.exemption) : 0;
  const autoTaxable = Math.max(0, grossTaxable - si.employee - exemption - preTax);
  const overridden = isFilled(overrides.taxable);
  const taxableAnnual = overridden
    ? Math.max(0, toAnnual(overrides.taxable, overrides.taxablePer || 'month', schedule))
    : autoTaxable;

  const flat = job.mode === 'flat';
  const progressive = flat ? null : computeIncomeTax(taxableAnnual, profile.tax?.brackets);
  const marginalRate = flat ? toNumber(job.flatRate) : progressive.marginalRate;
  const incomeTax = flat ? (taxableAnnual * marginalRate) / 100 : progressive.total;

  const levies = computeLevies(profile.levies ?? [], grossAnnual, taxableAnnual);
  const leviesTotal = sum(levies, (l) => l.annual);
  const espp = computeEspp(input.espp, {
    baseAnnual,
    taxableAllowances: sum(incomes.filter((i) => i.taxable), (i) => i.annual),
    exemptAllowances: sum(incomes.filter((i) => !i.taxable), (i) => i.annual),
    overtimeAnnual,
    cashAwardsAnnual: sum(cashAwards, (a) => a.annual),
  });
  const totalDeductions = si.employee + incomeTax + leviesTotal + preTax + postTax + espp.total + esppGain;
  const net = grossAnnual - totalDeductions;
  const employeeGovTake = si.employee + incomeTax + leviesTotal;
  const employerCost = grossAnnual + si.employer;
  const ratio = (a, b) => (b > 0 ? a / b : 0);
  // The tax the ESPP gain causes: this month's income tax and levies with the gain, minus without it.
  const esppGainTax = esppGain > 0
    ? (incomeTax + leviesTotal) - (({ incomeTax: t, leviesTotal: l }) => t + l)(calculate({ ...input, espp: { ...input.espp, gain: '' } }, baseAnnualOverride))
    : 0;

  return {
    job, baseAnnual, hourlyRate, incomes, overtime, cashAwards, deductions,
    overtimeAnnual, exemptAllowances, grossAnnual, grossTaxable,
    si, exemption, preTax, postTax,
    autoTaxable, taxableAnnual, overridden,
    flat, incomeTax, marginalRate, bracketRows: progressive?.rows ?? [],
    levies, leviesTotal, espp, esppGain, esppGainTax, totalDeductions, net, employeeGovTake, employerCost,
    avgTaxRate: ratio(incomeTax, grossAnnual),
    realTaxRate: ratio(employeeGovTake + si.employer, employerCost),
  };
}
