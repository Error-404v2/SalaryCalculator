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

const SIDE = { year: 0, month: 1 };
/** The toggle shown last, so a change starts from the old side and slides to the new one (see results/index.js). */
let shownPeriod = null;

/** Annual on the left, Monthly on the right; the highlight slides between them. */
function periodToggle(active) {
  const from = shownPeriod ?? active;
  shownPeriod = active;
  const btn = (id, label) => `<button type="button" data-v="${id}" aria-pressed="${id === active}">${label}</button>`;
  return `<div class="seg slide" data-seg="ui.bracketPeriod" style="--i:${SIDE[from]}" data-to="${SIDE[active]}">${btn('year', 'Annual')}${btn('month', 'Monthly')}</div>`;
}

function bracketTable(r, money, period) {
  const k = period === 'year' ? 1 : 12;
  const statusOf = (b) => (b.excluded ? 'Excluded' : b.portion > 0 ? 'Applied' : '—');
  const classOf = (b) => (b.excluded ? 'excluded' : b.portion > 0 ? 'active' : 'muted');
  const rows = r.bracketRows.map((b) => `<tr class="${classOf(b)}">
      <td>${b.rate}%</td>
      <td>${formatNumber(b.from / k)} – ${b.max === Infinity ? '∞' : formatNumber(b.max / k)}</td>
      <td>${statusOf(b)}</td>
      <td class="r">${money(b.portion / k)}</td><td class="r">${money(b.tax / k)}</td>
    </tr>`).join('');

  const excluded = r.bracketRows.filter((b) => b.excluded);
  const note = excluded.length
    ? `<p class="hint">Taxable income exceeds ${money(excluded.at(-1).exclusion / k)}, so the
        ${excluded.map((b) => `${b.rate}%`).join(', ')} bracket${excluded.length > 1 ? 's are' : ' is'} excluded.</p>`
    : '';

  return `<div class="section-title"><span>Brackets</span>${periodToggle(period)}</div>
    <div class="table-wrap"><table class="sticky-first">
      <thead><tr><th>Rate</th><th>Range</th><th>Status</th><th class="r">Taxed amount</th><th class="r">Tax</th></tr></thead>
      <tbody>${rows}<tr class="total"><td>Income tax</td><td colspan="3"></td><td class="r">${money(r.incomeTax / k)}</td></tr></tbody>
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
    : bracketTable(r, money, state.ui.bracketPeriod === 'year' ? 'year' : 'month');
  return `<div class="spacer"></div>${taxableTable(r, money)}<div class="spacer"></div>${body}${leviesNote(r, money)}`;
}
