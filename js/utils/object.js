export const clone = (value) => structuredClone(value);

/** Deep-merges `over` onto the shape of `base`; unknown keys are dropped, arrays are replaced. */
export function mergeShape(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : clone(base);
  if (base && typeof base === 'object') {
    const out = {};
    for (const key of Object.keys(base)) {
      out[key] = over && typeof over === 'object' && key in over ? mergeShape(base[key], over[key]) : clone(base[key]);
    }
    return out;
  }
  return over === undefined ? base : over;
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}
