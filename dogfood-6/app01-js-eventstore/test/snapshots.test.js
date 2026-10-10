import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/store.js';
import { SnapshotStore, loadAggregate, maybeSnapshot } from '../src/snapshots.js';

const counter = (s, e) => ({ n: s.n + e.data.by });
const init = { n: 0 };
const fill = (store, k) => store.append('c', 0, Array.from({ length: k }, () => ({ type: 'Inc', data: { by: 1 } })));

/** @id TEST-SNAP-001 @verifies REQ-SNAP-001 */
test('TEST-SNAP-001 save stores a deep copy', () => {
  const snaps = new SnapshotStore();
  const state = { n: 1, deep: { x: 1 } };
  assert.equal(snaps.save('c', 3, state), true);
  state.deep.x = 99;
  assert.equal(snaps.get('c').state.deep.x, 1);
  snaps.get('c').state.deep.x = 50;
  assert.equal(snaps.get('c').state.deep.x, 1);
});

/** @id TEST-SNAP-002 @verifies REQ-SNAP-002 */
test('TEST-SNAP-002 get returns latest or null', () => {
  const snaps = new SnapshotStore();
  assert.equal(snaps.get('c'), null);
  snaps.save('c', 2, { n: 2 });
  snaps.save('c', 5, { n: 5 });
  assert.deepEqual(snaps.get('c'), { version: 5, state: { n: 5 } });
});

/** @id TEST-SNAP-003 @verifies REQ-SNAP-003 */
test('TEST-SNAP-003 stale save ignored', () => {
  const snaps = new SnapshotStore();
  snaps.save('c', 5, { n: 5 });
  assert.equal(snaps.save('c', 5, { n: 9 }), false);
  assert.equal(snaps.save('c', 4, { n: 9 }), false);
  assert.deepEqual(snaps.get('c'), { version: 5, state: { n: 5 } });
});

/** @id TEST-SNAP-004 @verifies REQ-SNAP-004 */
test('TEST-SNAP-004 load from snapshot replays only tail', () => {
  const store = new EventStore();
  const snaps = new SnapshotStore();
  fill(store, 6);
  snaps.save('c', 4, { n: 1000 });
  const r = loadAggregate(store, snaps, 'c', counter, init);
  assert.deepEqual(r, { state: { n: 1002 }, version: 6 });
  assert.deepEqual(loadAggregate(store, new SnapshotStore(), 'c', counter, init), { state: { n: 6 }, version: 6 });
  assert.deepEqual(init, { n: 0 });
});

/** @id TEST-SNAP-005 @verifies REQ-SNAP-005 */
test('TEST-SNAP-005 future snapshot ignored', () => {
  const store = new EventStore();
  const snaps = new SnapshotStore();
  fill(store, 3);
  snaps.save('c', 10, { n: 1000 });
  assert.deepEqual(loadAggregate(store, snaps, 'c', counter, init), { state: { n: 3 }, version: 3 });
});

/** @id TEST-SNAP-006 @verifies REQ-SNAP-006 */
test('TEST-SNAP-006 maybeSnapshot honours interval', () => {
  const snaps = new SnapshotStore();
  assert.equal(maybeSnapshot(snaps, 'c', { n: 2 }, 2, 3), false);
  assert.equal(snaps.get('c'), null);
  assert.equal(maybeSnapshot(snaps, 'c', { n: 3 }, 3, 3), true);
  assert.equal(snaps.get('c').version, 3);
  assert.equal(maybeSnapshot(snaps, 'c', { n: 5 }, 5, 3), false);
  assert.equal(maybeSnapshot(snaps, 'c', { n: 6 }, 6, 3), true);
});
