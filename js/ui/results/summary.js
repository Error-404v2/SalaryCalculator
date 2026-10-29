import { PERIODS, findPeriod, fromAnnual } from '../../core/periods.js';
import { escapeHtml, formatPercent } from '../../utils/format.js';
import { COLORS, line, negative, positive, stat, donut } from './shared.js';

const isSmallUnit = (id) => id === 'hour' || id === 'day';

function periodSwitcher(active) {
  return `<div class="results-head"><div class="seg" data-period>${PERIODS
    .map((p) => `<button data-v="${p.id}" aria-pressed="${p.id === active}">${p.label}</button>`)
    .join('')}</div></div>`;
}

function notices(r, at, period, money) {
  let html = '';
  if (r.solved) {
    html += `<div class="callout">To take home <b>${at(r.targetNet)}</b> per ${period.unit}, the basic gross salary must be
      <b>${at(r.baseAnnual)}</b> (${money(r.baseAnnual / 12)} / month).</div>`;
  }
  if (r.overridden) {
    html += `<div class="callout warn">Using a <b>manual taxable amount</b> of ${money(r.taxableAnnual / 12)} / month
      (auto would be ${money(r.autoTaxable / 12)}).</div>`;
  }
  if (r.cashAwards.some((a) => a.missingRate)) {
    html += '<div class="callout warn">A cash award in another currency has no <b>exchange rate</b>, so it counts as 0.</div>';
  }
  return html;
}

/** `entered` tags the lines that come straight from the user's inputs (class "entered"), for highlighting. */
export function breakdownLines(r, state, at, { net = true, entered = false } = {}) {
  const mine = entered ? ' entered' : '';
  const sub = (label, annual, netAnnual) =>
    line(`${label}${netAnnual !== undefined ? ` <span class="hint">net ${at(netAnnual)}</span>` : ''}`, positive(at(annual)), `sub${mine}`);
  const earnings = [
    line('Basic salary', positive(at(r.baseAnnual)), mine.trim()),
    ...r.incomes.map((it) => sub(escapeHtml(it.name) + (it.taxable ? '' : ' <span class="hint">(exempt)</span>'), it.annual, it.taxable ? it.netAnnual : undefined)),
    ...r.overtime.filter((o) => o.annual).map((o) => sub(escapeHtml(o.label), o.annual, o.netAnnual)),
    ...r.cashAwards.filter((a) => a.annual).map((a) => sub(escapeHtml(a.name), a.annual, a.taxable ? a.netAnnual : undefined)),
    r.esppGain ? line(`ESPP gain <span class="hint">taxed, then offset</span>`, positive(at(r.esppGain)), `sub${mine}`) : '',
    line('Gross pay', positive(at(r.grossAnnual)), 'strong'),
  ];
  const siNote = r.si.enabled ? `${escapeHtml(state.profile.si.employeeRate)}%` : 'n/a';
  const taxNote = r.flat ? ` <span class="hint">flat ${r.marginalRate}%</span>` : '';
  const deductions = [
    line(`Social insurance <span class="hint">${siNote}</span>`, negative(at(r.si.employee)), 'sep', COLORS.si),
    line(`Income tax${taxNote}`, negative(at(r.incomeTax)), '', COLORS.tax),
    ...r.levies.filter((l) => l.annual).map((l) => line(escapeHtml(l.name), negative(at(l.annual)), '', COLORS.tax)),
    ...r.deductions.map((d) => line(escapeHtml(d.name), negative(at(d.annual)), mine.trim(), COLORS.other)),
    r.espp.total ? line('Stocks', negative(at(r.espp.total)), mine.trim(), COLORS.other) : '',
    r.esppGain ? line(`ESPP gain offset <span class="hint">extra tax ${at(r.esppGainTax)}</span>`, negative(at(r.esppGain)), mine.trim(), COLORS.other) : '',
    line('Total deductions', negative(at(r.totalDeductions)), 'strong sep'),
    net ? line('Net pay', at(r.net), 'strong net-line') : '',
  ];
  return [...earnings, ...deductions].join('');
}

export function renderSummary(full, state, money, pay) {
  const base = findPeriod(state.ui.period);
  const isMonth = base.id === 'month';
  const period = isMonth ? { ...base, label: pay.label, unit: pay.unit } : base;
  const r = isMonth ? pay.result : full;
  const at = (annual) => money(fromAnnual(annual, period.id, state.schedule, pay.factor), isSmallUnit(period.id));
  const segments = [
    { color: COLORS.net, value: Math.max(r.net, 0), label: 'Net pay' },
    { color: COLORS.tax, value: r.incomeTax + r.leviesTotal, label: 'Taxes' },
    { color: COLORS.si, value: r.si.employee, label: 'Social insurance' },
    { color: COLORS.other, value: r.preTax + r.postTax + r.espp.total, label: 'Other deductions' },
  ];
  const takeHome = r.grossAnnual ? r.net / r.grossAnnual : 0;
  const taxTile = `<div class="stat"><div class="k">Avg. income tax</div>
    <div class="v">${formatPercent(r.avgTaxRate)} <small>max bracket ${r.marginalRate}%</small></div></div>`;

  return `${periodSwitcher(period.id)}${notices(r, at, period, money)}
    <div class="hero">
      <div class="k">Net pay · ${period.label}</div>
      <div class="v">${at(r.net)}</div>
      <div class="s">${money(full.net)} per year · ${money(full.net / 12)} per full month</div>
    </div>
    <div class="stats three">
      ${stat('Gross', at(r.grossAnnual), 'pos')}
      ${stat('Deductions', at(r.totalDeductions), 'neg')}
      ${taxTile}
    </div>
    <div class="split">
      <div class="lines">${breakdownLines(r, state, at)}</div>
      ${donut(segments, formatPercent(takeHome), 'take-home')}
    </div>`;
}
