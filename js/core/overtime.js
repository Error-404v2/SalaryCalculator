import { OT_TYPES } from '../data/presets.js';
import { toNumber } from '../utils/number.js';

export const otType = (id) => OT_TYPES.find((t) => t.id === id);

export const multiplierOf = (item) => toNumber(otType(item.type)?.mult ?? item.mult);

export function overtimeLabel(item) {
  const type = otType(item.type);
  return type ? `${type.label} ×${type.mult}` : `Custom ×${toNumber(item.mult)}`;
}

/** Preset types in their fixed order, then custom entries by multiplier (highest first). Sorts in place. */
export function sortOvertime(list) {
  const rank = (item) => {
    const index = OT_TYPES.findIndex((t) => t.id === item.type);
    return index === -1 ? OT_TYPES.length : index;
  };
  return list.sort((a, b) => rank(a) - rank(b) || multiplierOf(b) - multiplierOf(a));
}

export function nextOvertimeType(list) {
  const used = new Set(list.map((item) => item.type));
  return OT_TYPES.find((t) => !used.has(t.id)) ?? null;
}
