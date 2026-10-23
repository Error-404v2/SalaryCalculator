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

/** Resolves `{ rate, source }`: 1 `from` expressed in `to`, today or on `date`. */
export async function getRate(from, to, date = '') {
  const { value, source } = await cached(`${from}>${to}@${date}`, () =>
    firstValid(sources(from, to, date), (s, data) => s.read(data)));
  return { rate: value, source };
}
