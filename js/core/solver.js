import { calculate } from './calculator.js';

/** Finds the basic gross salary whose net pay equals `targetNetAnnual` (bisection). */
export function solveForNet(cfg, targetNetAnnual) {
  const netAt = (base) => calculate(cfg, base).net;
  let lo = 0;
  let hi = Math.max(targetNetAnnual * 2, 1000);
  for (let i = 0; i < 60 && netAt(hi) < targetNetAnnual; i++) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (netAt(mid) < targetNetAnnual) lo = mid;
    else hi = mid;
  }
  return { ...calculate(cfg, hi), solved: true, targetNet: targetNetAnnual };
}
