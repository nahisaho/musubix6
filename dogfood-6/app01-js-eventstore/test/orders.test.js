import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITIONS, initialState, evolve, decide, IllegalTransitionError } from '../src/orders.js';

const items = [{ sku: 'A', qty: 2 }];
const states = ['none', 'placed', 'paid', 'shipped', 'cancelled'];
const actions = ['place', 'pay', 'ship', 'cancel'];
const at = (status) => ({ status, items });
const cmd = (type) => ({ type, orderId: 'o1', items });

/** @id TEST-ORD-001 @verifies REQ-ORD-001 */
test('TEST-ORD-001 TRANSITIONS table', () => {
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...states].sort());
  assert.deepEqual(TRANSITIONS.none, { place: 'placed' });
  assert.deepEqual(TRANSITIONS.placed, { pay: 'paid', cancel: 'cancelled' });
  assert.deepEqual(TRANSITIONS.paid, { ship: 'shipped', cancel: 'cancelled' });
  assert.deepEqual(TRANSITIONS.shipped, {});
  assert.deepEqual(TRANSITIONS.cancelled, {});
});

/** @id TEST-ORD-002 @verifies REQ-ORD-002 */
test('TEST-ORD-002 place', () => {
  const [e] = decide(initialState, cmd('place'));
  assert.equal(e.type, 'OrderPlaced');
  assert.deepEqual(e.data, { orderId: 'o1', items });
  assert.equal(evolve(initialState, e).status, 'placed');
});

/** @id TEST-ORD-003 @verifies REQ-ORD-003 */
test('TEST-ORD-003 every illegal cell throws', () => {
  let illegal = 0;
  for (const s of states) {
    for (const a of actions) {
      if (TRANSITIONS[s][a]) continue;
      illegal++;
      assert.throws(
        () => decide(at(s), cmd(a)),
        (e) => e instanceof IllegalTransitionError && e.message.includes(s) && e.message.includes(a),
        `${s}/${a}`,
      );
    }
  }
  assert.equal(illegal, 15);
});

/** @id TEST-ORD-004 @verifies REQ-ORD-004 */
test('TEST-ORD-004 pay', () => {
  const [e] = decide(at('placed'), cmd('pay'));
  assert.equal(e.type, 'OrderPaid');
  assert.equal(e.data.orderId, 'o1');
});

/** @id TEST-ORD-005 @verifies REQ-ORD-005 */
test('TEST-ORD-005 ship', () => {
  const [e] = decide(at('paid'), cmd('ship'));
  assert.equal(e.type, 'OrderShipped');
});

/** @id TEST-ORD-006 @verifies REQ-ORD-006 */
test('TEST-ORD-006 cancel from placed or paid', () => {
  for (const s of ['placed', 'paid']) {
    const [e] = decide(at(s), cmd('cancel'));
    assert.equal(e.type, 'OrderCancelled');
  }
});

/** @id TEST-ORD-007 @verifies REQ-ORD-007 */
test('TEST-ORD-007 invalid items', () => {
  for (const bad of [undefined, [], [{ sku: 'A', qty: 0 }], [{ sku: 'A', qty: 1.5 }], [{ qty: 1 }], 'x']) {
    assert.throws(() => decide(initialState, { type: 'place', orderId: 'o1', items: bad }), RangeError);
  }
});

/** @id TEST-ORD-008 @verifies REQ-ORD-008 */
test('TEST-ORD-008 evolve follows table', () => {
  const evs = [
    { type: 'OrderPlaced', data: { orderId: 'o1', items } },
    { type: 'OrderPaid', data: { orderId: 'o1' } },
    { type: 'OrderShipped', data: { orderId: 'o1' } },
  ];
  assert.deepEqual(evs.reduce(evolve, initialState), { status: 'shipped', items });
  assert.equal(evolve(at('paid'), { type: 'OrderCancelled', data: { orderId: 'o1' } }).status, 'cancelled');
  assert.deepEqual(initialState, { status: 'none', items: [] });
});
