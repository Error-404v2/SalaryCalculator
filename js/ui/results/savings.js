import { escapeHtml, formatPercent } from '../../utils/format.js';
import { planSavings } from '../../core/index.js';
import { COLORS, line, stat, stackedBar } from './shared.js';

/** Savings plan: the monthly net pay split by the percentages kept in `state.savings` (edited under the chart). */
export function renderSavings(r, state, money) {
  if (!r) return '';
  const plan = planSavings(r.net / 12, state.savings);
  const named = plan.rows.map((row) => ({ ...row, label: escapeHtml(row.name.trim() || 'Unnamed') }));
  const segments = named.map((row) => ({ color: row.color, value: row.amount, label: row.label }));
  if (plan.left > 0) segments.push({ color: COLORS.net, value: plan.left, label: 'Left to spend' });
  const share = plan.net ? plan.saved / plan.net : 0;

  return `<div class="stats">
      ${stat('Monthly net', money(plan.net))}
      ${stat('Saved / month', money(plan.saved), 'pos')}
      ${stat('Saved / year', money(plan.saved * 12))}
      ${stat(plan.left < 0 ? 'Over budget' : 'Left to spend', money(Math.abs(plan.left)), plan.left < 0 ? 'neg' : '')}
    </div>
    <div class="section-title">Where your net pay goes</div>
    ${plan.rows.length ? stackedBar(segments) : '<div class="hint">No savings yet — add one below.</div>'}
    <div class="spacer"></div>
    <div class="lines">
      ${named.map((row) => line(`${row.label} <span class="hint">${row.pct}%</span>`, `${money(row.amount)} <span class="hint">· ${money(row.amount * 12)} / yr</span>`, '', row.color)).join('')}
      ${line('Total saved', money(plan.saved), 'strong sep')}
      ${line('Left to spend', money(plan.left), plan.left < 0 ? 'neg' : '')}
    </div>
    ${plan.over
    ? `<div class="callout" style="margin-top:14px">Your plan adds up to <b>${plan.totalPct.toFixed(1)}%</b> — more than your net pay. Lower a percentage below.</div>`
    : `<div class="callout" style="margin-top:14px">You are saving <b>${formatPercent(share)}</b> of your net pay, which is <b>${money(plan.saved * 12)}</b> a year.</div>`}`;
}
