import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStore, ConcurrencyError } from '../src/store.js';
import { SnapshotStore } from '../src/snapshots.js';
import { DomainError, InsufficientStockError } from '../src/inventory.js';
import { IllegalTransitionError } from '../src/orders.js';
import { CommandHandler, UnknownCommandError } from '../src/commands.js';

let n = 0;
const id = () => `c${++n}`;
const receive = (qty, commandId = id()) => ({ commandId, type: 'inventory-receive', sku: 'A', qty });

/** @id TEST-CMD-001 @verifies REQ-CMD-001 */
test('TEST-CMD-001 handle appends at loaded version', () => {
  const store = new EventStore();
  const h = new CommandHandler({ store });
  const r1 = h.handle(receive(5));
  assert.equal(r1.version, 1);
  assert.equal(r1.events[0].type, 'StockReceived');
  const r2 = h.handle({ commandId: id(), type: 'inventory-reserve', sku: 'A', orderId: 'o1', qty: 3 });
  assert.equal(r2.version, 2);
  assert.equal(store.read('inventory-A').length, 2);
});

/** @id TEST-CMD-002 @verifies REQ-CMD-002 */
test('TEST-CMD-002 duplicate commandId is idempotent', () => {
  const store = new EventStore();
  const h = new CommandHandler({ store });
  const cmd = receive(5, 'dup-1');
  const first = h.handle(cmd);
  const second = h.handle(cmd);
  assert.deepEqual(second, first);
  assert.equal(store.readAll(0).length, 1);
  const fresh = new CommandHandler({ store });
  assert.deepEqual(fresh.handle(cmd), first);
});

const racing = (times) => {
  const store = new EventStore();
  const orig = store.append.bind(store);
  let left = times;
  store.append = (stream, ver, events) => {
    if (left-- > 0) orig(stream, 'any', [{ type: 'StockReceived', data: { sku: 'A', qty: 1 }, meta: {} }]);
    return orig(stream, ver, events);
  };
  return store;
};

/** @id TEST-CMD-003 @verifies REQ-CMD-003 */
test('TEST-CMD-003 retries on conflict', () => {
  const store = racing(2);
  const h = new CommandHandler({ store, maxRetries: 3 });
  const r = h.handle(receive(5));
  assert.equal(r.version, 3);
  assert.equal(store.read('inventory-A').length, 3);
});

/** @id TEST-CMD-004 @verifies REQ-CMD-004 */
test('TEST-CMD-004 retries exhausted throws', () => {
  const store = racing(10);
  const h = new CommandHandler({ store, maxRetries: 2 });
  assert.throws(() => h.handle(receive(5, 'x1')), ConcurrencyError);
  assert.equal(store.findByCommandId('x1').length, 0);
});

/** @id TEST-CMD-005 @verifies REQ-CMD-005 */
test('TEST-CMD-005 domain error leaves no trace', () => {
  const store = new EventStore();
  const h = new CommandHandler({ store });
  const cmd = { commandId: 'r1', type: 'inventory-reserve', sku: 'A', orderId: 'o1', qty: 5 };
  assert.throws(() => h.handle(cmd), InsufficientStockError);
  assert.equal(store.readAll(0).length, 0);
  h.handle(receive(10));
  assert.equal(h.handle(cmd).events[0].type, 'StockReserved');
  assert.throws(() => h.handle({ commandId: 'o-1', type: 'order-pay', orderId: 'o9' }), IllegalTransitionError);
  assert.ok(new IllegalTransitionError('a', 'b') instanceof Error);
  assert.ok(DomainError.prototype instanceof Error);
});

/** @id TEST-CMD-006 @verifies REQ-CMD-006 */
test('TEST-CMD-006 unknown command', () => {
  const h = new CommandHandler({ store: new EventStore() });
  assert.throws(() => h.handle({ commandId: 'u1', type: 'bogus' }), UnknownCommandError);
  assert.throws(() => h.handle({ commandId: 'u2', type: 'inventory-explode', sku: 'A' }), UnknownCommandError);
});

/** @id TEST-CMD-007 @verifies REQ-CMD-007 */
test('TEST-CMD-007 commandId required', () => {
  const h = new CommandHandler({ store: new EventStore() });
  assert.throws(() => h.handle({ type: 'inventory-receive', sku: 'A', qty: 1 }), TypeError);
  assert.throws(() => h.handle({ commandId: 5, type: 'inventory-receive', sku: 'A', qty: 1 }), TypeError);
  assert.throws(() => h.handle({ commandId: '', type: 'inventory-receive', sku: 'A', qty: 1 }), TypeError);
});

/** @id TEST-CMD-008 @verifies REQ-CMD-008 */
test('TEST-CMD-008 snapshots after interval', () => {
  const store = new EventStore();
  const snapshots = new SnapshotStore();
  const h = new CommandHandler({ store, snapshots, interval: 2 });
  h.handle(receive(1));
  assert.equal(snapshots.get('inventory-A'), null);
  h.handle(receive(2));
  assert.deepEqual(snapshots.get('inventory-A'), { version: 2, state: { onHand: 3, reserved: {} } });
  h.handle(receive(4));
  assert.equal(snapshots.get('inventory-A').version, 2);
  h.handle(receive(8));
  assert.deepEqual(snapshots.get('inventory-A').state.onHand, 15);
});

/** @id TEST-CMD-009 @verifies REQ-CMD-009 */
test('TEST-CMD-009 routing and stream ids', () => {
  const store = new EventStore();
  const h = new CommandHandler({ store });
  h.handle(receive(5));
  h.handle({ commandId: id(), type: 'order-place', orderId: 'o1', items: [{ sku: 'A', qty: 1 }] });
  h.handle({ commandId: id(), type: 'order-pay', orderId: 'o1' });
  assert.deepEqual(store.read('inventory-A').map((e) => e.type), ['StockReceived']);
  assert.deepEqual(store.read('order-o1').map((e) => e.type), ['OrderPlaced', 'OrderPaid']);
  assert.equal(store.read('order-o1')[1].meta.commandId.startsWith('c'), true);
});

/** @id TEST-CMD-010 @verifies REQ-CMD-010 */
test('TEST-CMD-010 aggregate key required', () => {
  const store = new EventStore();
  const h = new CommandHandler({ store });
  assert.throws(() => h.handle({ commandId: 'k1', type: 'inventory-receive', qty: 1 }), TypeError);
  assert.throws(() => h.handle({ commandId: 'k2', type: 'order-place', orderId: '', items: [{ sku: 'A', qty: 1 }] }), TypeError);
  assert.throws(() => h.handle({ commandId: 'k3', type: 'order-pay', orderId: 7 }), TypeError);
  assert.equal(store.readAll(0).length, 0);
});
