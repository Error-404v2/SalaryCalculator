import { $, $$ } from '../../utils/dom.js';
import * as store from '../../state/store.js';
import { renderSummary } from './summary.js';
import { renderPeriods } from './periods.js';
import { renderTaxDetail } from './taxDetail.js';
import { renderEmployer } from './employer.js';
import { renderSavings } from './savings.js';

/** The Tax tab ends with the By period table. */
const renderTax = (...args) =>
  `${renderTaxDetail(...args)}<div class="section-title" style="margin-top:18px">By period</div>${renderPeriods(...args)}`;

const VIEWS = {
  summary: renderSummary,
  tax: renderTax,
  employer: renderEmployer,
  savings: renderSavings,
};

const EMPTY = '<div class="empty" style="padding:40px 16px">Enter a salary to see the breakdown.</div>';

export function initResults() {
  $('[data-view="summary"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-period] button');
    if (btn) store.set('ui.period', btn.dataset.v);
  });
}

/**
 * Base (×1) overtime hour, gross and net. Net uses overtime's own net/gross ratio, so it reflects
 * the marginal tax that overtime actually triggers. Without overtime it falls back to the salary's ratio.
 */
function otRateLine(result, money) {
  if (!result?.hourlyRate) return '';
  const ratio = result.overtimeAnnual > 0
    ? result.overtimeNet / result.overtimeAnnual
    : result.grossAnnual > 0 ? result.net / result.grossAnnual : 0;
  return `OT base hourly rate: <b>${money(result.hourlyRate, true)}</b> · net <b class="pos">${money(result.hourlyRate * ratio, true)}</b>`;
}

/** `pay` = resolved pro-rata period, with `pay.result` computed for that period. */
export function renderResults(result, state, money, pay) {
  $('#otRate').innerHTML = otRateLine(pay.result, money);

  const active = state.ui.resTab;
  $$('[data-view]').forEach((host) => {
    if (host.dataset.view !== active || !VIEWS[active]) return;
    host.innerHTML = result ? VIEWS[active](result, state, money, pay) : EMPTY;
    // A sliding toggle is drawn on its old side first, then moved, so the highlight glides across.
    $$('.seg.slide[data-to]', host).forEach((seg) => {
      void seg.offsetWidth;
      seg.style.setProperty('--i', seg.dataset.to);
    });
  });
}
