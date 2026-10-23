export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function isFilled(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).replace(/,/g, '').trim();
  return s !== '' && Number.isFinite(parseFloat(s));
}

/** Adds `delta` to a user-typed value, keeping it within [min, max]. */
export function stepValue(current, delta, min = 0, max = Infinity) {
  const next = toNumber(current) + delta;
  return Math.min(max, Math.max(min, Math.round(next * 100) / 100));
}

export const sum =(list, pick = (x) => x) => list.reduce((acc, x) => acc + pick(x), 0);
