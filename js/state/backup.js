import { clone } from '../utils/object.js';
import { hydrate } from './migrate.js';

/**
 * Export / import of everything the app keeps: Pay tab, tax profiles, every saved History month with all its
 * entries (overtime, allowances, cash awards, deductions, Stocks % and ESPP gain), the ESPP ledger values,
 * ESPP Gains entries, fetched month rates and assumptions, and the UI choices.
 */
export const BACKUP_KIND = 'salary-calculator';
export const BACKUP_VERSION = 2;

export function exportData(state, now = new Date()) {
  return { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(), state: clone(state) };
}

/** Reads an exported file. Older exports (the bare state, from before the wrapper existed) still load. */
export function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a settings file');
  const state = data.kind === BACKUP_KIND ? data.state : data;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('not a settings file');
  return hydrate(state);
}
