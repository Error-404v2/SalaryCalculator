import { PERIODS, fromAnnual } from '../../core/periods.js';
import { escapeHtml } from '../../utils/format.js';

export function renderPeriods(full, state, money, pay) {
  const columnsOf = (r) => [
    ['Gross', r.grossAnnual],
    ['Social ins.', r.si.employee],
    ['Taxes', r.incomeTax + r.leviesTotal],
    ['Other', r.preTax + r.postTax + r.espp.total],
    ['Net', r.net],
  ];
  const rows = PERIODS.map((p) => {
    const cents = p.id === 'hour' || p.id === 'day';
    const cells = columnsOf(p.id === 'month' ? pay.result : full)
      .map(([name, annual]) => {
        const v = money(fromAnnual(annual, p.id, state.schedule, pay.factor), cents);
        return `<td class="r">${name === 'Net' ? `<b>${v}</b>` : v}</td>`;
      })
      .join('');
    const label = p.id === 'month' && !pay.standard ? `${p.label} <span class="hint">(${pay.label})</span>` : p.label;
    return `<tr class="${p.id === state.ui.period ? 'active' : ''}"><td><b>${label}</b></td>${cells}</tr>`;
  }).join('');

  const s = state.schedule;
  return `<div class="table-wrap"><table>
      <thead><tr><th>Period</th>${columnsOf(full).map(([n]) => `<th class="r">${n}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="hint">Based on ${escapeHtml(s.weeksPerYear)} weeks/year, ${escapeHtml(s.daysPerWeek)} days/week,
      ${escapeHtml(s.hoursPerDay)} hours/day — change under More options → Settings.</p>`;
}
