const TIMEOUT_MS = 8000;

export async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw err.name === 'AbortError' ? new Error('timed out') : err;
  } finally {
    clearTimeout(timer);
  }
}

/** Tries each source in order; resolves the first valid `{ value, source }`, else rejects listing every failure. */
export async function firstValid(sources, read) {
  const errors = [];
  for (const source of sources) {
    try {
      const value = Number(read(source, await fetchJson(source.url)));
      if (Number.isFinite(value) && value > 0) return { value, source: source.name };
      errors.push(`${source.name}: no value`);
    } catch (err) {
      errors.push(`${source.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

export function memo(ttlMs) {
  const cache = new Map();
  return async (key, load) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}
