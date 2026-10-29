import test from 'node:test';
import assert from 'node:assert/strict';
import { planSavings } from '../js/core/savings.js';
import { hydrate } from '../js/state/migrate.js';

test('savings are a percentage of the monthly net, with the remainder left', () => {
  const plan = planSavings(10000, [{ id: 'a', pct: '10' }, { id: 'b', pct: 5 }]);
  assert.deepEqual(plan.rows.map((r) => r.amount), [1000, 500]);
  assert.equal(plan.saved, 1500);
  assert.equal(plan.left, 8500);
  assert.equal(plan.over, false);
});

test('a plan above 100% is flagged and leaves a negative remainder', () => {
  const plan = planSavings(1000, [{ pct: '70' }, { pct: '50' }, { pct: 'x' }]);
  assert.equal(plan.over, true);
  assert.equal(plan.left, -200);
});

test('savings survive hydrate, with bad entries cleaned', () => {
  const state = hydrate({ savings: [{ id: 'a', name: 'Gold', pct: '12', color: '#112233' }, { id: 'a', name: 'X', color: 'red' }, null] });
  assert.equal(state.savings.length, 2);
  assert.notEqual(state.savings[0].id, state.savings[1].id);
  assert.equal(state.savings[1].color, '#2f9e8f');
  assert.ok(hydrate({}).savings.length > 0);
});
