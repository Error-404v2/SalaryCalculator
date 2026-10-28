import { $ } from '../utils/dom.js';
import { getRate } from '../services/exchangeRates.js';
import * as store from '../state/store.js';
import { spinWhile } from './spin.js';

const RATE_DECIMALS = 4;

/** Status per award row, keyed by index: 'loading' | 'ok' | 'error'. Shown as the rate box colour. */
const status = new Map();
/** The latest press per row; an older lookup finishing late must not overwrite the newer one. */
const latest = new Map();

export const rateStatus = (index) => status.get(index) ?? '';

function paint(index) {
  const input = $(`[data-path="cashAwards.${index}.rate"]`);
  const button = $(`[data-fetch-rate="${index}"]`);
  const state = rateStatus(index);
  input?.classList.toggle('rate-ok', state === 'ok');
  input?.classList.toggle('rate-error', state === 'error');
  button?.classList.toggle('loading', state === 'loading');
}

async function fetchRateFor(index, button) {
  const award = store.get('cashAwards')[index];
  const to = store.activeProfile().currency;
  if (!award || award.currency === to) return;

  const run = (latest.get(index) ?? 0) + 1;
  latest.set(index, run);
  status.set(index, 'loading');
  paint(index);
  try {
    const { rate, source } = await spinWhile(button, () => getRate(award.currency, to, '', true));
    if (latest.get(index) !== run) return;
    store.set(`cashAwards.${index}.rate`, String(Number(rate.toFixed(RATE_DECIMALS))));
    status.set(index, 'ok');
    const input = $(`[data-path="cashAwards.${index}.rate"]`);
    if (input) {
      input.value = store.get(`cashAwards.${index}.rate`);
      input.title = `Live rate from ${source}`;
    }
  } catch (err) {
    if (latest.get(index) !== run) return;
    status.set(index, 'error');
    const input = $(`[data-path="cashAwards.${index}.rate"]`);
    if (input) input.title = `Could not get a live rate (${err.message}). Enter it manually.`;
  }
  paint(index);
}

export function initRateFetcher() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fetch-rate]');
    if (btn) fetchRateFor(Number(btn.dataset.fetchRate), btn);
  });
  // A manually typed rate is the user's own value: drop the live-rate colour.
  document.addEventListener('input', (e) => {
    const m = e.target.dataset.path?.match(/^cashAwards\.(\d+)\.rate$/);
    if (!m) return;
    status.delete(Number(m[1]));
    e.target.classList.remove('rate-ok', 'rate-error');
  });
}

export function clearRateStatus() {
  status.clear();
}
