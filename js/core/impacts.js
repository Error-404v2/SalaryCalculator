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

export function withImpacts(input, result) {
  const netWithout = (patch) => calculate({ ...input, ...patch }, result.baseAnnual).net;
  const overtimeNet = result.overtimeAnnual > 0 ? result.net - netWithout({ overtime: [] }) : 0;
  const hasAwards = result.cashAwards.some((a) => a.annual > 0);
  const cashAwardsNet = hasAwards ? result.net - netWithout({ cashAwards: [] }) : 0;

  return {
    ...result,
    overtimeNet,
    cashAwardsNet,
    overtime: allocate(result.overtime, overtimeNet),
    cashAwards: allocate(result.cashAwards, cashAwardsNet),
  };
}
