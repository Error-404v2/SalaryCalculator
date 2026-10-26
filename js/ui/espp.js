import { $, $$ } from '../utils/dom.js';
import * as store from '../state/store.js';
import { toNumber } from '../utils/number.js';

// ---------- Pay form: Stocks as the first entry of Other deductions ----------
/** Stocks shows once added (+ Stocks / + Add Stocks) or while a % is above 0; it's added per form (Pay or a month). */
let esppAdded = false;
const hasEsppPct = (s) => toNumber(s.espp.constPct) > 0 || toNumber(s.espp.varPct) > 0;
export const esppShown = (s) => esppAdded || hasEsppPct(s);

export function renderEsppInputs(result, money, state) {
  const block = $('#esppBlock');
  if (!block) return;
  const shown = esppShown(state);
  block.hidden = !shown;
  $$('[data-espp-show]').forEach((b) => (b.hidden = shown));
  const count = state.deductions.length + (shown ? 1 : 0);
  $$('[data-deduction-count]').forEach((b) => (b.textContent = count ? String(count) : ''));
  if (!shown) return;
  const e = result?.espp;
  $('#esppTile').innerHTML = e?.total
    ? `<div><span>Constant</span><b>${money(e.constant / 12)}</b></div>
       <div><span>Variable</span><b>${money(e.variable / 12)}</b></div>
       <div class="tot"><span>Total / month</span><b>${money(e.total / 12)}</b></div>`
    : '<div class="hint">Enter a % above 0 to deduct part of your pay into shares.</div>';
}

/** A different form (Pay, or another month) starts without a pending "+ Stocks". */
export function resetEsppAdded() {
  esppAdded = false;
}

export function initEspp(onChanged) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-espp-show]')) {
      esppAdded = true;
      onChanged();
      $('#esppBlock input')?.focus();
      return;
    }
    if (e.target.closest('[data-espp-remove]')) {
      esppAdded = false;
      store.set('espp.constPct', '');
      store.set('espp.varPct', '');
      onChanged();
    }
  });
}
