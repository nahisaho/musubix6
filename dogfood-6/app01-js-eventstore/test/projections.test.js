import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/store.js';
import { Projector, stockLevels, orderSummaries } from '../src/projections.js';

const ev = (type, data) => ({ type, data });
const names = (m, e) => [...m, e.type];

/** @id TEST-PROJ-001 @verifies REQ-PROJ-001 */
test('TEST-PROJ-001 applies events in global order', () => {
  const store = new EventStore();
  store.append('a', 0, [ev('X'), ev('Y')]);
  store.append('b', 0, [ev('Z')]);
  store.append('a', 2, [ev('W')]);
  const p = new Projector({ store, reducer: names, initial: [] });
  p.catchUp();
  assert.deepEqual(p.model, ['X', 'Y', 'Z', 'W']);
});

/** @id TEST-PROJ-002 @verifies REQ-PROJ-002 */
test('TEST-PROJ-002 checkpoint advances and count returned', () => {
  const store = new EventStore();
  const p = new Projector({ store, reducer: names, initial: [] });
  assert.equal(p.checkpoint, 0);
  store.append('a', 0, [ev('X'), ev('Y')]);
  assert.equal(p.catchUp(), 2);
  assert.equal(p.checkpoint, 2);
  store.append('b', 0, [ev('Z')]);
  assert.equal(p.catchUp(), 1);
  assert.equal(p.checkpoint, 3);
  assert.deepEqual(p.model, ['X', 'Y', 'Z']);
});

/** @id TEST-PROJ-003 @verifies REQ-PROJ-003 */
test('TEST-PROJ-003 catchUp is idempotent', () => {
  const store = new EventStore();
  store.append('a', 0, [ev('X')]);
  let calls = 0;
  const p = new Projector({ store, reducer: (m, e) => { calls++; return names(m, e); }, initial: [] });
  p.catchUp();
  assert.equal(p.catchUp(), 0);
  assert.equal(calls, 1);
  assert.deepEqual(p.model, ['X']);
});

/** @id TEST-PROJ-004 @verifies REQ-PROJ-004 */
test('TEST-PROJ-004 rebuild replays everything', () => {
  const store = new EventStore();
  store.append('a', 0, [ev('X'), ev('Y')]);
  const p = new Projector({ store, reducer: names, initial: [] });
  p.catchUp();
  assert.equal(p.rebuild(), 2);
  assert.equal(p.checkpoint, 2);
  assert.deepEqual(p.model, ['X', 'Y']);
});

/** @id TEST-PROJ-005 @verifies REQ-PROJ-005 */
test('TEST-PROJ-005 stockLevels projection', () => {
  const store = new EventStore();
  store.append('inventory-A', 0, [
    ev('StockReceived', { sku: 'A', qty: 10 }),
    ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 4 }),
  ]);
  store.append('inventory-B', 0, [ev('StockReceived', { sku: 'B', qty: 3 })]);
  store.append('inventory-A', 2, [ev('StockShipped', { sku: 'A', orderId: 'o1', qty: 4 })]);
  store.append('order-o1', 0, [ev('OrderPlaced', { orderId: 'o1', items: [] })]);
  const p = stockLevels(store);
  p.catchUp();
  assert.deepEqual(p.model, {
    A: { onHand: 6, reserved: 0, available: 6 },
    B: { onHand: 3, reserved: 0, available: 3 },
  });
  store.append('inventory-B', 1, [ev('StockReserved', { sku: 'B', orderId: 'o2', qty: 2 })]);
  p.catchUp();
  assert.deepEqual(p.model.B, { onHand: 3, reserved: 2, available: 1 });
  store.append('inventory-B', 2, [ev('ReservationReleased', { sku: 'B', orderId: 'o2', qty: 2 })]);
  p.catchUp();
  assert.deepEqual(p.model.B, { onHand: 3, reserved: 0, available: 3 });
});

/** @id TEST-PROJ-006 @verifies REQ-PROJ-006 */
test('TEST-PROJ-006 orderSummaries projection', () => {
  const store = new EventStore();
  store.append('order-o1', 0, [
    ev('OrderPlaced', { orderId: 'o1', items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }] }),
    ev('OrderPaid', { orderId: 'o1' }),
  ]);
  store.append('order-o2', 0, [ev('OrderPlaced', { orderId: 'o2', items: [{ sku: 'A', qty: 1 }] }), ev('OrderCancelled', { orderId: 'o2' })]);
  store.append('inventory-A', 0, [ev('StockReceived', { sku: 'A', qty: 1 })]);
  const p = orderSummaries(store);
  p.catchUp();
  assert.deepEqual(p.model, {
    o1: { status: 'paid', itemCount: 2 },
    o2: { status: 'cancelled', itemCount: 1 },
  });
});

/** @id TEST-PROJ-007 @verifies REQ-PROJ-007 */
test('TEST-PROJ-007 reducer failure keeps checkpoint', () => {
  const store = new EventStore();
  store.append('a', 0, [ev('X'), ev('BOOM'), ev('Z')]);
  const reducer = (m, e) => { if (e.type === 'BOOM') throw new Error('bad event'); return names(m, e); };
  const p = new Projector({ store, reducer, initial: [] });
  assert.throws(() => p.catchUp(), /bad event/);
  assert.equal(p.checkpoint, 1);
  assert.deepEqual(p.model, ['X']);
});
