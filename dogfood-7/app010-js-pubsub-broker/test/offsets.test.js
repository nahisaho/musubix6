import test from 'node:test';
import assert from 'node:assert/strict';
import { Offsets } from '../src/offsets.js';

function make() {
  const b = new Offsets({ clock: () => 100 });
  b.createTopic('a', 2);
  for (let i = 0; i < 3; i++) {
    b.publish('a', `p0-${i}`, { partition: 0 });
    b.publish('a', `p1-${i}`, { partition: 1 });
  }
  return { b, token: b.join('g', 'one', ['a']) };
}

/** @id TEST-OFFSETS-001 @verifies REQ-OFFSETS-001 REQ-OFFSETS-002 */
test('TEST-OFFSETS-001 poll is capped and cursor differs from commit', () => {
  const { b, token } = make();
  assert.deepEqual(b.poll(token, { limit: 2 }).map(r => r.value), ['p0-0', 'p0-1']);
  assert.deepEqual(b.poll(token, { limit: 3 }).map(r => r.value), ['p0-2', 'p1-0', 'p1-1']);
  assert.equal(b.committed('g', 'a', 0), 0);
  assert.deepEqual(b.poll(token).map(r => r.value), ['p1-2']);
  assert.deepEqual(b.poll(token), []);
});

/** @id TEST-OFFSETS-002 @verifies REQ-OFFSETS-003 REQ-OFFSETS-004 */
test('TEST-OFFSETS-002 commit next offsets is monotonic and batch atomic', () => {
  const { b, token } = make();
  b.poll(token, { limit: 2 });
  assert.deepEqual(b.commit(token, [{ topic: 'a', partition: 0, offset: 1 }]),
    [{ topic: 'a', partition: 0, offset: 1 }]);
  b.join('other', 'reader', ['a']);
  assert.equal(b.committed('other', 'a', 0), 0);
  for (const offset of [0, -1, 1.5, 3, NaN]) {
    assert.throws(() => b.commit(token, [{ topic: 'a', partition: 0, offset }]));
  }
  assert.throws(() => b.commit(token, [
    { topic: 'a', partition: 0, offset: 2 }, { topic: 'a', partition: 1, offset: 3 }
  ]), /delivered/);
  assert.equal(b.committed('g', 'a', 0), 1);
  assert.throws(() => b.commit(token, [
    { topic: 'a', partition: 0, offset: 2 }, { topic: 'a', partition: 0, offset: 1 }
  ]), /duplicate/);
});

/** @id TEST-OFFSETS-003 @verifies REQ-OFFSETS-005 REQ-OFFSETS-006 */
test('TEST-OFFSETS-003 rebalance replays only uncommitted input and fences owners', () => {
  const { b, token: old } = make();
  b.poll(old, { limit: 3 });
  b.commit(old, [{ topic: 'a', partition: 0, offset: 1 }]);
  const next = b.join('g', 'two', ['a']);
  const one = b.token('g', 'one');
  assert.throws(() => b.poll(old), /stale/);
  assert.throws(() => b.commit(next, [{ topic: 'a', partition: 0, offset: 1 }]), /unowned/);
  assert.deepEqual(b.poll(one).map(r => r.value), ['p0-1', 'p0-2']);
  assert.deepEqual(b.poll(next).map(r => r.value), ['p1-0', 'p1-1', 'p1-2']);
  b.leave('g', 'one'); b.leave('g', 'two');
  assert.equal(b.committed('g', 'a', 0), 1);
  assert.equal(b.poll(b.join('g', 'one', ['a']))[0].offset, 1);
});

/** @id TEST-OFFSETS-004 @verifies REQ-OFFSETS-007 REQ-OFFSETS-008 */
test('TEST-OFFSETS-004 seek can replay without erasing delivered history', () => {
  const { b, token } = make();
  b.poll(token, { limit: 3 });
  assert.equal(b.seek(token, 'a', 0, 1), 1);
  assert.equal(b.poll(token, { limit: 1 })[0].offset, 1);
  b.commit(token, [{ topic: 'a', partition: 0, offset: 3 }]);
  assert.equal(b.committed('g', 'a', 0), 3);
  for (const offset of [-1, 1.5, 4, NaN]) assert.throws(() => b.seek(token, 'a', 0, offset));
  for (const limit of [0, -1, 1.5, NaN]) assert.throws(() => b.poll(token, { limit }));
  assert.equal(b.poll(token, { limit: 1 })[0].offset, 2);
  assert.equal(b.committed('g', 'a', 0), 3);
});
