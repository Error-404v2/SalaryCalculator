/**
 * Free, key-less, CORS-enabled sources. Tried in order; the first valid rate wins.
 * Each returns 1 `from` expressed in `to`.
 */
const SOURCES = [
  {
    name: 'open.er-api.com',
    url: (from) => `https://open.er-api.com/v6/latest/${from}`,
    read: (data, from, to) => (data.result === 'success' ? data.rates?.[to] : undefined),
  },
  {
    name: 'currency-api (jsDelivr)',
    url: (from) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`,
    read: (data, from, to) => data[from.toLowerCase()]?.[to.toLowerCase()],
  },
];

const TIMEOUT_MS = 8000;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves `{ rate, source }` or rejects with an Error describing every source that failed. */
export async function getRate(from, to) {
  const key = `${from}>${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const errors = [];
  for (const source of SOURCES) {
    try {
      const rate = Number(source.read(await fetchJson(source.url(from)), from, to));
      if (Number.isFinite(rate) && rate > 0) {
        const value = { rate, source: source.name };
        cache.set(key, { at: Date.now(), value });
        return value;
      }
      errors.push(`${source.name}: no ${to} rate`);
    } catch (err) {
      errors.push(`${source.name}: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}
