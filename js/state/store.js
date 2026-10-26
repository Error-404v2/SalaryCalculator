import { DEFAULT_STATE } from '../data/defaults.js';
import { clone, getPath, setPath } from '../utils/object.js';
import { loadSaved, saveDebounced } from './storage.js';
import { hydrate } from './migrate.js';
import { isPayPath, withPay } from '../core/months.js';

const PROFILE_PREFIX = '@';
const listeners = new Set();
let state = hydrate(loadSaved());

/**
 * While the History tab edits a saved month, the Pay form's paths (amount, incomes, overtime, …) read and
 * write that month's draft instead of the Pay tab. Drafts are never stored until saved.
 */
let scope = null;

export const getState = () => state;

/** The state as the Pay form shows it: the month being edited on the History tab, or the Pay tab itself. */
export const view = () => (scope ? withPay(state, scope.pay) : state);

export const scopeMonth = () => scope?.month ?? '';
export const scopePay = () => scope?.pay ?? null;
export const scopeBase = () => scope?.base ?? null;
export const scopeDirty = () => !!scope && JSON.stringify(scope.pay) !== JSON.stringify(scope.base);

/** Starts editing `pay` as `month` (empty month ends it). `base` is what it is compared with to tell if edits are unsaved. */
export function setScope(month, pay, base = pay) {
  scope = month ? { month, pay: clone(pay), base: clone(base) } : null;
  commit();
}

export function markScopeSaved() {
  if (scope) scope.base = clone(scope.pay);
}

const activeIndex = () => Math.max(0, state.profiles.findIndex((p) => p.id === state.profileId));
export const activeProfile = () => state.profiles[activeIndex()];

/** Paths starting with "@." point into the active tax profile. */
export function resolve(path) {
  if (path === PROFILE_PREFIX) return `profiles.${activeIndex()}`;
  return path.startsWith(`${PROFILE_PREFIX}.`) ? `profiles.${activeIndex()}${path.slice(1)}` : path;
}

const scoped = (path) => !!scope && isPayPath(path);

export const get = (path) => (scoped(path) ? getPath(scope.pay, path) : getPath(state, resolve(path)));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  saveDebounced(state);
  const current = view();
  listeners.forEach((fn) => fn(current));
}

export function set(path, value) {
  if (scoped(path)) setPath(scope.pay, path, value);
  else setPath(state, resolve(path), value);
  commit();
}

export function update(mutator) {
  mutator(state);
  commit();
}

export function replace(next) {
  const theme = state.ui.theme;
  state = hydrate(next);
  scope = null;
  if (!next?.ui?.theme) state.ui.theme = theme;
  commit();
}

export const defaults = (path) => clone(getPath(DEFAULT_STATE, path));
