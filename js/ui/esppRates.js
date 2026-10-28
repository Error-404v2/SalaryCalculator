import { getConversionRate } from '../services/exchangeRates.js';
import { monthKey } from '../core/index.js';
import * as store from '../state/store.js';

/**
 * Per-month USD rates for the ESPP ledger. IBM converts each month's contribution around the 19th–21st, so a
 * past month uses the average of those days, fetched once and kept in `espp.rates`. A month whose 21st hasn't
 * come yet uses today's rate (the "1 USD =" assumption).
 */
const pending = new Set();

const isPastConversion = (month, today) => month < monthKey(today) || (month === monthKey(today) && today.getDate() > 21);

export function monthRates(state) {
  return state.espp.rates ?? {};
}

/** Fetches any missing past-month rates for `year`, then calls `onChanged` once they arrive. */
export function ensureMonthRates(year, onChanged, today = new Date()) {
  const state = store.getState();
  const currency = store.activeProfile().currency;
  const have = monthRates(state);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    .filter((m) => isPastConversion(m, today) && !have[m] && !pending.has(`${currency}:${m}`));
  if (!months.length) return;

  months.forEach((m) => pending.add(`${currency}:${m}`));
  Promise.allSettled(months.map((m) => getConversionRate('USD', currency, m).then((rate) => [m, rate])))
    .then((results) => {
      const got = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (!got.length) return;
      store.update((s) => {
        s.espp.rates = { ...(s.espp.rates ?? {}) };
        got.forEach(([m, rate]) => { s.espp.rates[m] = String(Number(rate.toFixed(4))); });
      });
      onChanged();
    });
}
