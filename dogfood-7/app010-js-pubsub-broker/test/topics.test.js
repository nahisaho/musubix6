import test from 'node:test';
import assert from 'node:assert/strict';
import { Log } from '../src/log.js';

/** @id TEST-TOPICS-001 @verifies REQ-TOPICS-001 REQ-TOPICS-002 */
test('TEST-TOPICS-001 topic lifecycle validates before mutation', () => {
  const b = new Log({ clock: () => 100 });
  assert.deepEqual(b.createTopic('orders', 3), { name: 'orders', partitions: 3 });
  assert.throws(() => b.createTopic('orders', 2), /exists/);
  for (const [name, count] of [['', 1], ['bad name', 1], ['x', 0], ['x', 1.5], ['x', NaN]]) {
    assert.throws(() => b.createTopic(name, count));
  }
  assert.deepEqual(b.topics(), [{ name: 'orders', partitions: 3 }]);
});

/** @id TEST-TOPICS-002 @verifies REQ-TOPICS-003 REQ-TOPICS-004 */
test('TEST-TOPICS-002 deterministic keyed and unkeyed partitioning', () => {
  const b = new Log({ clock: () => 100 });
  b.createTopic('orders', 3);
  const records = Array.from({ length: 7 }, (_, i) => b.publish('orders', i));
  assert.deepEqual(records.map(r => r.partition), [0, 1, 2, 0, 1, 2, 0]);
  assert.deepEqual(records.map(r => r.offset), [0, 0, 0, 1, 1, 1, 2]);
  assert.equal(b.publish('orders', 10, { key: '日本語' }).partition,
    b.publish('orders', 11, { key: '日本語' }).partition);
  assert.equal(b.publish('orders', 12, { key: '日本語', partition: 2 }).partition, 2);
});

/** @id TEST-TOPICS-003 @verifies REQ-TOPICS-005 REQ-TOPICS-006 */
test('TEST-TOPICS-003 snapshots isolate producers and readers', () => {
  const b = new Log({ clock: () => 123 });
  b.createTopic('orders', 1);
  const payload = { nested: { value: 3 }, bytes: new Uint8Array([4]) };
  payload.self = payload;
  const record = b.publish('orders', payload);
  payload.nested.value = 99;
  record.value.bytes[0] = 99;
  const read = b.read('orders', 0);
  assert.equal(read[0].timestamp, 123);
  assert.equal(read[0].value.nested.value, 3);
  assert.equal(read[0].value.bytes[0], 4);
  assert.equal(read[0].value.self, read[0].value);
  read[0].value.nested.value = 999;
  const metadata = b.topics();
  metadata[0].partitions = 0;
  assert.equal(b.read('orders', 0)[0].value.nested.value, 3);
  assert.equal(b.topics()[0].partitions, 1);
  for (const shared of [new SharedArrayBuffer(2), { nested: new Uint8Array(new SharedArrayBuffer(2)) },
    new Map([['shared', new SharedArrayBuffer(2)]])]) {
    assert.throws(() => b.publish('orders', shared), /shared/i);
  }
});

/** @id TEST-TOPICS-004 @verifies REQ-TOPICS-007 REQ-TOPICS-008 */
test('TEST-TOPICS-004 read ranges and invalid append preserve round robin', () => {
  const b = new Log({ clock: () => 100 });
  b.createTopic('orders', 2);
  for (const options of [{ partition: -1 }, { partition: 2 }, { key: {} }]) {
    assert.throws(() => b.publish('orders', 'bad', options));
  }
  assert.throws(() => b.publish('orders', () => {}));
  assert.throws(() => b.publish('missing', 0));
  assert.equal(b.publish('orders', 'first').partition, 0);
  b.publish('orders', 'second', { partition: 0 });
  b.publish('orders', 'third', { partition: 0 });
  assert.deepEqual(b.read('orders', 0, { offset: 1, limit: 1 }).map(r => r.value), ['second']);
  assert.deepEqual(b.read('orders', 0, { offset: 20 }), []);
  for (const options of [{ offset: -1 }, { limit: 0 }, { limit: 1.5 }]) {
    assert.throws(() => b.read('orders', 0, options));
  }
  assert.throws(() => b.read('orders', 3));
});

/** @id TEST-TOPICS-005 @verifies REQ-TOPICS-009 */
test('TEST-TOPICS-005 shared memory hidden in Error causes is rejected', () => {
  const b = new Log({ clock: () => 100 });
  b.createTopic('orders', 2);
  const shared = new SharedArrayBuffer(2);
  for (const cause of [shared, { nested: new Uint8Array(shared) },
    new Map([['shared', shared]]), new Error('inner', { cause: shared })]) {
    assert.throws(() => b.publish('orders', new Error('outer', { cause })), /shared/i);
  }
  assert.equal(b.read('orders', 0).length, 0);
  assert.equal(b.publish('orders', 'valid').partition, 0);
});
