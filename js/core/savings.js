/**
 * Savings plan: each entry takes a percentage of the monthly net pay. Pure — the tab only formats the result.
 * `left` is what remains to spend (negative when the plan asks for more than 100 %).
 */
export function planSavings(net, items) {
  const base = Math.max(Number(net) || 0, 0);
  const rows = (items ?? []).map((item) => {
    const pct = Math.max(Number(item.pct) || 0, 0);
    return { ...item, pct, amount: (base * pct) / 100 };
  });
  const totalPct = rows.reduce((sum, r) => sum + r.pct, 0);
  const saved = rows.reduce((sum, r) => sum + r.amount, 0);
  return { net: base, rows, totalPct, saved, left: base - saved, over: totalPct > 100 };
}

export const SAVINGS_COLORS = ['#2f9e8f', '#e0a526', '#5b7fe0', '#c75d9b', '#8a63d2', '#e4703b', '#4aa3d6', '#7aa642'];
