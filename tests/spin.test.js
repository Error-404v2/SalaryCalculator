import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spinWhile, reapplySpin } from '../js/ui/spin.js';
import { memo } from '../js/services/http.js';
import { monthsWithDraft } from '../js/core/months.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A stand-in for a button: only what spinWhile touches. */
const fakeButton = () => {
  const classes = new Set();
  return { offsetWidth: 0, classes, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
};

test('an arrow spins while the lookup runs, and for at least the minimum turn even when it answers at once', async () => {
  const b = fakeButton();
  const started = Date.now();
  const run = spinWhile(b, async () => 42, 60);
  assert.ok(b.classList.contains('loading'), 'spinning as soon as it is pressed');
  assert.equal(await run, 42);
  assert.ok(Date.now() - started >= 55, 'held for the minimum turn');
  assert.ok(!b.classList.contains('loading'), 'stops afterwards');
});

test('a lookup that takes longer than the minimum keeps spinning until it ends, and failures still propagate', async () => {
  const b = fakeButton();
  const run = spinWhile(b, async () => { await sleep(80); throw new Error('no source'); }, 10);
  await sleep(40);
  assert.ok(b.classList.contains('loading'));
  await assert.rejects(run, /no source/);
  assert.ok(!b.classList.contains('loading'));
});

test('pressing again spins again, and an older lookup finishing late does not stop the newer spin', async () => {
  const b = fakeButton();
  const first = spinWhile(b, async () => { await sleep(20); return 'old'; }, 10);
  await sleep(5);
  const second = spinWhile(b, async () => { await sleep(120); return 'new'; }, 10);
  assert.equal(await first, 'old');
  assert.ok(b.classList.contains('loading'), 'the second press is still looking things up');
  assert.equal(await second, 'new');
  assert.ok(!b.classList.contains('loading'));
});

test('without a page, a selector target is simply a no-op that still runs the task', async () => {
  assert.equal(await spinWhile('[data-none]', async () => 7, 5), 7);
  assert.doesNotThrow(() => reapplySpin());
});

test('a pressed refresh skips the saved answer but saves the new one', async () => {
  let calls = 0;
  const cached = memo(60_000);
  const load = async () => ++calls;
  assert.equal(await cached('k', load), 1);
  assert.equal(await cached('k', load), 1, 'plain lookups reuse the saved answer');
  assert.equal(await cached('k', load, true), 2, 'a pressed arrow asks again');
  assert.equal(await cached('k', load), 2, 'and the new answer is the one saved');
});

test('the History month being edited overlays the saved months at once; an untouched copy does not', () => {
  const saved = { '2030-02': { amount: '1' } };
  const draft = { amount: '2', espp: { gain: '50' } };
  assert.deepEqual(monthsWithDraft(saved, '2030-02', draft, true), { '2030-02': draft }, 'edited saved month');
  assert.deepEqual(monthsWithDraft(saved, '2030-05', draft, true), { '2030-02': saved['2030-02'], '2030-05': draft }, 'edited new month');
  assert.deepEqual(monthsWithDraft(saved, '2030-05', draft, false), saved, 'a new month nobody edited yet is only a copy');
  assert.deepEqual(monthsWithDraft(saved, '2030-02', draft, false), { '2030-02': draft }, 'a saved month is always its open form');
  assert.deepEqual(monthsWithDraft(saved, '', null, false), saved, 'Pay tab: nothing to overlay');
  assert.deepEqual(monthsWithDraft(undefined, '', null, false), {});
});
