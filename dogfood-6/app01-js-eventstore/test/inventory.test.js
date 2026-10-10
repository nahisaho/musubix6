import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, evolve, decide, DomainError, InsufficientStockError } from '../src/inventory.js';

const fold = (events) => events.reduce(evolve, initialState);
const ev = (type, data) => ({ type, data });
const stocked = fold([ev('StockReceived', { sku: 'A', qty: 10 })]);

/** @id TEST-INV-001 @verifies REQ-INV-001 */
test('TEST-INV-001 evolve folds events', () => {
  const s = fold([
    ev('StockReceived', { sku: 'A', qty: 10 }),
    ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 3 }),
    ev('StockReserved', { sku: 'A', orderId: 'o2', qty: 2 }),
    ev('ReservationReleased', { sku: 'A', orderId: 'o2', qty: 2 }),
    ev('StockShipped', { sku: 'A', orderId: 'o1', qty: 3 }),
  ]);
  assert.deepEqual(s, { onHand: 7, reserved: {} });
  assert.deepEqual(initialState, { onHand: 0, reserved: {} });
});

/** @id TEST-INV-002 @verifies REQ-INV-002 */
test('TEST-INV-002 receive validates qty', () => {
  const [e] = decide(initialState, { type: 'receive', sku: 'A', qty: 5 });
  assert.equal(e.type, 'StockReceived');
  assert.deepEqual(e.data, { sku: 'A', qty: 5 });
  for (const q of [0, -1, 1.5, '3', NaN]) {
    assert.throws(() => decide(initialState, { type: 'receive', sku: 'A', qty: q }), RangeError);
  }
});

/** @id TEST-INV-003 @verifies REQ-INV-003 */
test('TEST-INV-003 reserve when available', () => {
  const [e] = decide(stocked, { type: 'reserve', sku: 'A', orderId: 'o1', qty: 10 });
  assert.equal(e.type, 'StockReserved');
  assert.deepEqual(e.data, { sku: 'A', orderId: 'o1', qty: 10 });
});

/** @id TEST-INV-004 @verifies REQ-INV-004 */
test('TEST-INV-004 reserve beyond available', () => {
  const s = evolve(stocked, ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 8 }));
  assert.throws(() => decide(s, { type: 'reserve', sku: 'A', orderId: 'o2', qty: 3 }), InsufficientStockError);
  assert.ok(new InsufficientStockError('x') instanceof DomainError);
});

/** @id TEST-INV-005 @verifies REQ-INV-005 */
test('TEST-INV-005 duplicate reservation', () => {
  const s = evolve(stocked, ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 1 }));
  assert.throws(() => decide(s, { type: 'reserve', sku: 'A', orderId: 'o1', qty: 1 }), (e) => e instanceof DomainError && !(e instanceof InsufficientStockError));
});

/** @id TEST-INV-006 @verifies REQ-INV-006 */
test('TEST-INV-006 release', () => {
  const s = evolve(stocked, ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 4 }));
  const [e] = decide(s, { type: 'release', sku: 'A', orderId: 'o1' });
  assert.equal(e.type, 'ReservationReleased');
  assert.deepEqual(e.data, { sku: 'A', orderId: 'o1', qty: 4 });
  assert.throws(() => decide(s, { type: 'release', sku: 'A', orderId: 'zz' }), DomainError);
});

/** @id TEST-INV-007 @verifies REQ-INV-007 */
test('TEST-INV-007 ship', () => {
  const s = evolve(stocked, ev('StockReserved', { sku: 'A', orderId: 'o1', qty: 4 }));
  const [e] = decide(s, { type: 'ship', sku: 'A', orderId: 'o1' });
  assert.equal(e.type, 'StockShipped');
  assert.equal(e.data.qty, 4);
  assert.deepEqual(evolve(s, e), { onHand: 6, reserved: {} });
  assert.throws(() => decide(s, { type: 'ship', sku: 'A', orderId: 'zz' }), DomainError);
});
