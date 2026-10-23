import { escapeHtml, formatPercent } from '../../utils/format.js';
import { COLORS, line, stat, stackedBar } from './shared.js';

export function renderEmployer(r, state, money) {
  const monthly = (annual) => money(annual / 12);
  const toGovernment = r.employeeGovTake + r.si.employer;
  const visibleRate = r.grossAnnual ? r.employeeGovTake / r.grossAnnual : 0;
  const netShare = r.employerCost ? (r.net / r.employerCost) * 100 : 0;
  const segments = [
    { color: COLORS.net, value: Math.max(r.net, 0), label: 'Your net pay' },
    { color: COLORS.tax, value: r.incomeTax + r.leviesTotal, label: 'Taxes' },
    { color: COLORS.si, value: r.si.employee, label: 'Your SI' },
    { color: COLORS.employer, value: r.si.employer, label: 'Employer SI' },
    { color: COLORS.other, value: r.preTax + r.postTax + r.espp.total, label: 'Other deductions' },
  ];

  return `<div class="stats">
      ${stat('Employer cost / month', monthly(r.employerCost))}
      ${stat('To government / month', monthly(toGovernment))}
      ${stat('Real tax rate', formatPercent(r.realTaxRate))}
      ${stat('Visible rate', formatPercent(visibleRate))}
    </div>
    <div class="section-title">Where the employer's money goes</div>
    ${stackedBar(segments)}
    <div class="spacer"></div>
    <div class="lines">
      ${line('Gross salary', monthly(r.grossAnnual))}
      ${line(`Employer social insurance <span class="hint">${escapeHtml(state.profile.si.employerRate)}% of ${money(r.si.base)}</span>`, monthly(r.si.employer), '', COLORS.employer)}
      ${line('Total employer cost', monthly(r.employerCost), 'strong sep')}
      ${line('Paid by you (tax + SI)', monthly(r.employeeGovTake), 'sep')}
      ${line('Paid by employer (SI)', monthly(r.si.employer))}
      ${line('Total to government', monthly(toGovernment), 'strong')}
    </div>
    <div class="callout" style="margin-top:14px">For every <b>100</b> your employer spends on you,
      <b>${netShare.toFixed(1)}</b> reaches you as net pay and <b>${(r.realTaxRate * 100).toFixed(1)}</b> goes to the government.</div>`;
}
