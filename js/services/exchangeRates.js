import { firstValid, memo } from './http.js';

const cached = memo(60 * 60 * 1000);

/** Free, key-less, CORS-enabled sources. `date` ("YYYY-MM-DD") asks for a historical rate. */
function sources(from, to, date) {
  const f = from.toLowerCase();
  const list = [{
    name: 'currency-api (jsDelivr)',
    url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date || 'latest'}/v1/currencies/${f}.json`,
    read: (data) => data[f]?.[to.toLowerCase()],
  }];
  if (!date) {
    list.unshift({
      name: 'open.er-api.com',
      url: `https://open.er-api.com/v6/latest/${from}`,
      read: (data) => (data.result === 'success' ? data.rates?.[to] : undefined),
    });
  }
  return list;
}

/** The days IBM converts ESPP contributions on: checked against EquatePlus, it falls on the 19th–21st. */
export const CONVERSION_DAYS = [19, 20, 21];

/**
 * The USD rate IBM would have used for `month` ("YYYY-MM"): the average of the 19th–21st. Days that can't be
 * fetched are skipped; it rejects only if none of them can.
 */
export async function getConversionRate(from, to, month) {
  const days = CONVERSION_DAYS.map((d) => `${month}-${String(d).padStart(2, '0')}`);
  const rates = (await Promise.allSettled(days.map((date) => getRate(from, to, date))))
    .filter((r) => r.status === 'fulfilled').map((r) => r.value.rate);
  if (!rates.length) throw new Error(`no rate for ${month}`);
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

/** Resolves `{ rate, source }`: 1 `from` expressed in `to`, today or on `date`. */
export async function getRate(from, to, date = '') {
  const { value, source } = await cached(`${from}>${to}@${date}`, () =>
    firstValid(sources(from, to, date), (s, data) => s.read(data)));
  return { rate: value, source };
}
