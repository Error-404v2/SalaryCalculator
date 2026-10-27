/**
 * Every refresh arrow (share price, USD rate, award rate) spins while it looks the data up, for at least one
 * full turn so even an instant answer is visible, and spins again each time it is pressed.
 *
 * `target` is a button, or a selector for every arrow that belongs to the lookup. A selector is looked up again
 * after each redraw (`reapplySpin`), because the ESPP tab rebuilds its buttons while a lookup is still running.
 */
export const MIN_SPIN_MS = 800;

const latest = new Map();
const spinning = new Set();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buttonsOf = (target) => (typeof target === 'string' ? [...(globalThis.document?.querySelectorAll(target) ?? [])] : [target]);

/** Runs `task` with the arrow(s) spinning. Resolves or rejects like `task`, after at least `minMs`. */
export async function spinWhile(target, task, minMs = MIN_SPIN_MS) {
  const id = (latest.get(target) ?? 0) + 1;
  latest.set(target, id);
  spinning.add(target);
  buttonsOf(target).forEach((b) => {
    b.classList.remove('loading');
    void b.offsetWidth; // pressed again mid-spin: restart the turn
    b.classList.add('loading');
  });

  const [result] = await Promise.allSettled([task(), wait(minMs)]);
  // Only the latest press stops the spin, so an older lookup finishing late does not cut a newer one short.
  if (latest.get(target) === id) {
    spinning.delete(target);
    buttonsOf(target).forEach((b) => b.classList.remove('loading'));
  }
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

/** Call after redrawing buttons: arrows whose lookup is still running keep spinning. */
export function reapplySpin() {
  spinning.forEach((target) => buttonsOf(target).forEach((b) => b.classList.add('loading')));
}
