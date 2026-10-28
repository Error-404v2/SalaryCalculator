import { firstValid, memo } from './http.js';

const cached = memo(15 * 60 * 1000);

/**
 * Alpha Vantage's public "demo" key needs no sign-up and is CORS-enabled, but only serves a few
 * symbols (IBM among them). Other symbols return an "Information" message, reported as a failure
 * so the price can be typed in instead.
 */
const sources = (symbol) => [{
  name: 'Alpha Vantage (demo)',
  url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=demo`,
}];

export async function getStockPrice(symbol, fresh = false) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) throw new Error('No symbol set');
  const { value, source } = await cached(clean, () =>
    firstValid(sources(clean), (_, data) => {
      if (data.Information || data.Note) throw new Error('demo key only covers a few symbols, such as IBM');
      return data['Global Quote']?.['05. price'];
    }), fresh);
  return { price: value, source };
}
