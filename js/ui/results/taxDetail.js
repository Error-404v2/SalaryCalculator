import { escapeHtml, formatNumber } from '../../utils/format.js';

function taxableTable(r, money) {
  const row = (label, annual, cls = '') =>
    `<tr class="${cls}"><td>${label}</td><td class="r">${money(annual / 12)}</td><td class="r">${money(annual)}</td></tr>`;
  const siNote = `<span class="hint">base ${money(r.si.base)}${r.si.capped ? ' (capped)' : ''}</span>`;
  return `<div class="section-title">Taxable income</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Step</th><th class="r">Monthly</th><th class="r">Annual</th></tr></thead>
      <tbody>
        ${row('Taxable gross (basic + taxable extras + overtime)', r.grossTaxable)}
        ${row(`− Employee social insurance ${siNote}`, r.si.employee)}
        ${row('− Personal exemption', r.exemption)}
        ${r.preTax ? row('− Pre-tax deductions', r.preTax) : ''}
        ${r.exemptAllowances ? row('Exempt extras (not taxed)', r.exemptAllowances, 'muted') : ''}
        ${row(`Taxable income${r.overridden ? ' (manual)' : ''}`, r.taxableAnnual, 'total')}
      </tbody></table></div>`;
}

function bracketTable(r, money) {
  const statusOf = (b) => (b.excluded ? 'Excluded' : b.portion > 0 ? 'Applied' : '—');
  const classOf = (b) => (b.excluded ? 'excluded' : b.portion > 0 ? 'active' : 'muted');
  const rows = r.bracketRows.map((b) => `<tr class="${classOf(b)}">
      <td>${b.rate}%</td>
      <td>${formatNumber(b.from)} – ${b.max === Infinity ? '∞' : formatNumber(b.max)}</td>
      <td>${statusOf(b)}</td>
      <td class="r">${money(b.portion / 12)}</td><td class="r">${money(b.tax / 12)}</td>
    </tr>`).join('');

  const excluded = r.bracketRows.filter((b) => b.excluded);
  const note = excluded.length
    ? `<p class="hint">Taxable income exceeds ${money(excluded.at(-1).exclusion)}, so the
        ${excluded.map((b) => `${b.rate}%`).join(', ')} bracket${excluded.length > 1 ? 's are' : ' is'} excluded.</p>`
    : '';

  return `<div class="section-title">Brackets</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Rate</th><th>Range (annual)</th><th>Status</th><th class="r">Taxed amount / month</th><th class="r">Tax / month</th></tr></thead>
      <tbody>${rows}<tr class="total"><td colspan="4">Income tax</td><td class="r">${money(r.incomeTax / 12)}</td></tr></tbody>
    </table></div>${note}`;
}

function leviesNote(r, money) {
  return r.levies
    .filter((l) => l.annual)
    .map((l) => `<p class="hint">${escapeHtml(l.name)}: ${l.rate}% of ${l.base === 'taxable' ? 'taxable income' : 'gross'} = ${money(l.annual / 12)} / month.</p>`)
    .join('');
}

export function renderTaxDetail(r, state, money) {
  const body = r.flat
    ? `<div class="callout">This job type uses a <b>flat ${r.marginalRate}%</b> rate:
        ${money(r.taxableAnnual)} × ${r.marginalRate}% = <b>${money(r.incomeTax)}</b> / year.</div>`
    : bracketTable(r, money);
  return `<div class="spacer"></div>${taxableTable(r, money)}<div class="spacer"></div>${body}${leviesNote(r, money)}`;
}
