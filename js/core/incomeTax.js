import { toNumber, isFilled } from '../utils/number.js';

export function normalizeBrackets(brackets = []) {
  return brackets
    .map((b) => ({
      rate: toNumber(b.rate),
      min: toNumber(b.min),
      max: isFilled(b.max) ? toNumber(b.max) : Infinity,
      exclusion: isFilled(b.exclusion) ? toNumber(b.exclusion) : null,
    }))
    .sort((a, b) => a.min - b.min);
}

/**
 * Progressive tax with Egypt's exclusion rule: when annual taxable income exceeds a
 * bracket's exclusion threshold, that bracket and all below it are dropped and the
 * next bracket is taxed from zero.
 */
export function computeIncomeTax(taxableAnnual, brackets) {
  const list = normalizeBrackets(brackets);
  const lastExcluded = list.reduce(
    (cut, b, i) => (b.exclusion !== null && taxableAnnual > b.exclusion ? i : cut),
    -1,
  );

  let total = 0;
  let marginalRate = 0;
  const rows = list.map((b, i) => {
    const excluded = i <= lastExcluded;
    const from = i === lastExcluded + 1 ? 0 : b.min;
    const width = Math.max(0, b.max - from);
    const portion = excluded ? 0 : Math.min(Math.max(taxableAnnual - from, 0), width);
    const tax = (portion * b.rate) / 100;
    total += tax;
    if (portion > 0) marginalRate = b.rate;
    return { ...b, from, excluded, portion, tax };
  });

  return { total, marginalRate, rows };
}

export function validateBrackets(brackets) {
  const list = normalizeBrackets(brackets);
  const issues = [];
  list.forEach((b, i) => {
    if (b.max <= b.min) issues.push(`${b.rate}% bracket: "To" must be greater than "From".`);
    const prev = list[i - 1];
    if (prev && prev.max !== b.min) issues.push(`Gap or overlap between ${prev.max} and ${b.min}.`);
  });
  return issues;
}
