import { DEFAULT_STATE } from '../data/defaults.js';
import { clone, getPath, setPath } from '../utils/object.js';
import { loadSaved, saveDebounced } from './storage.js';
import { hydrate } from './migrate.js';

const PROFILE_PREFIX = '@';
const listeners = new Set();
let state = hydrate(loadSaved());

export const getState = () => state;

const activeIndex = () => Math.max(0, state.profiles.findIndex((p) => p.id === state.profileId));
export const activeProfile = () => state.profiles[activeIndex()];

/** Paths starting with "@." point into the active tax profile. */
export function resolve(path) {
  if (path === PROFILE_PREFIX) return `profiles.${activeIndex()}`;
  return path.startsWith(`${PROFILE_PREFIX}.`) ? `profiles.${activeIndex()}${path.slice(1)}` : path;
}

export const get = (path) => getPath(state, resolve(path));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  saveDebounced(state);
  listeners.forEach((fn) => fn(state));
}

export function set(path, value) {
  setPath(state, resolve(path), value);
  commit();
}

export function update(mutator) {
  mutator(state);
  commit();
}

export function replace(next) {
  const theme = state.ui.theme;
  state = hydrate(next);
  if (!next?.ui?.theme) state.ui.theme = theme;
  commit();
}

export const defaults = (path) => clone(getPath(DEFAULT_STATE, path));
