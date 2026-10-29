import { calculate } from './calculator.js';
import { sum } from '../utils/number.js';

/**
 * Net impact of a group = net(with group) − net(without group), at the same basic salary.
 * Because tax is progressive, the group total is split across its entries pro-rata to their gross,
 * so every entry carries the same effective rate and the entries add up exactly to the total.
 */
function allocate(items, groupNet) {
  const gross = sum(items, (i) => i.annual);
  return items.map((i) => ({ ...i, netAnnual: gross > 0 ? (groupNet * i.annual) / gross : 0 }));
}

/** Like `allocate`, but exempt entries are paid out in full (net = gross), so only the taxed ones share the group's net. */
function allocateTaxed(items, groupNet) {
  const exempt = sum(items.filter((i) => !i.taxable), (i) => i.annual);
  const shared = allocate(items.filter((i) => i.taxable), groupNet - exempt);
  let k = 0;
  return items.map((i) => (i.taxable ? shared[k++] : { ...i, netAnnual: i.annual }));
}

export function withImpacts(input, result) {
  const netWithout = (patch) => calculate({ ...input, ...patch }, result.baseAnnual).net;
  const overtimeNet = result.overtimeAnnual > 0 ? result.net - netWithout({ overtime: [] }) : 0;
  const hasAwards = result.cashAwards.some((a) => a.annual > 0);
  const cashAwardsNet = hasAwards ? result.net - netWithout({ cashAwards: [] }) : 0;
  // Taxed allowances and bonuses: what they add to net pay; exempt ones are paid out in full, so they carry no net.
  const taxedIncomes = result.incomes.filter((i) => i.taxable && i.annual > 0);
  const incomesNet = taxedIncomes.length ? result.net - netWithout({ incomes: (input.incomes ?? []).filter((i) => i.taxable === false) }) : 0;
  const incomeGross = sum(taxedIncomes, (i) => i.annual);

  return {
    ...result,
    overtimeNet,
    cashAwardsNet,
    incomesNet,
    incomes: result.incomes.map((i) => (i.taxable && incomeGross > 0 ? { ...i, netAnnual: (incomesNet * i.annual) / incomeGross } : i)),
    overtime: allocate(result.overtime, overtimeNet),
    cashAwards: allocateTaxed(result.cashAwards, cashAwardsNet),
  };
}
