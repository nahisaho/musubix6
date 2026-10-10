import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker, TRANSITIONS } from '../src/broker.js';

function make(options = {}) {
  let now = 0;
  const b = new Broker({ clock: () => now, sessionTimeout: 10, dedupeTtl: 20, ...options });
  b.createTopic('in', 1); b.createTopic('out', 1); b.createTopic('dlq', 1);
  return { b, set: time => { now = time; } };
}

/** @id TEST-LIFECYCLE-001 @verifies REQ-LIFECYCLE-001 REQ-LIFECYCLE-002 */
test('TEST-LIFECYCLE-001 heartbeat and exact session boundary batch expiry', () => {
  const { b, set } = make();
  b.join('g', 'one', ['in']); b.join('g', 'two', ['in']);
  set(5);
  assert.equal(b.heartbeat(b.token('g', 'one')), 5);
  assert.equal(b.group('g').members.find(m => m.member === 'one').activity, 5);
  set(10);
  assert.equal(b.maintenance().expiredMembers, 1);
  assert.equal(b.group('g').generation, 3);
  assert.deepEqual(b.group('g').members.map(m => m.member), ['one']);
  assert.throws(() => b.heartbeat({ group: 'g', member: 'one', generation: 2 }), /stale/);
  set(15);
  assert.equal(b.maintenance().expiredMembers, 1);
  const a = b.join('g', 'a', ['in']); b.join('g', 'b', ['in']);
  set(25);
  const generation = b.group('g').generation;
  assert.equal(b.maintenance().expiredMembers, 2);
  assert.equal(b.group('g').generation, generation + 1);
  assert.throws(() => b.poll(a));
});

/** @id TEST-LIFECYCLE-002 @verifies REQ-LIFECYCLE-003 REQ-LIFECYCLE-004 */
test('TEST-LIFECYCLE-002 retention preserves offsets and handles old commits', () => {
  const { b, set } = make({ retentionMs: 10, sessionTimeout: 100 });
  const token = b.join('g', 'one', ['in']);
  const first = b.publish('in', 'old'); b.poll(token);
  set(5); b.publish('in', 'boundary');
  set(14); b.publish('in', 'new');
  set(15);
  assert.equal(b.maintenance().prunedRecords, 1);
  assert.deepEqual(b.read('in', 0).map(r => r.offset), [1, 2]);
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.throws(() => b.fail(token, first, 'error', { deadLetterTopic: 'dlq' }), /retained/);
  b.leave('g', 'one');
  const fresh = b.join('g', 'two', ['in']);
  assert.deepEqual(b.poll(fresh).map(r => r.offset), [1, 2]);
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.equal(b.publish('in', 'last').offset, 3);
  assert.throws(() => b.seek(fresh, 'in', 0, 0), /retained/);
});

/** @id TEST-LIFECYCLE-003 @verifies REQ-LIFECYCLE-005 REQ-LIFECYCLE-006 */
test('TEST-LIFECYCLE-003 dedupe outlives retention and expires at TTL', () => {
  const { b, set } = make({ retentionMs: 5, sessionTimeout: 100 });
  const token = b.join('g', 'one', ['in']);
  const result = b.publish('out', 'one', { idempotencyKey: 'id' });
  b.publish('in', 'input'); b.poll(token);
  const request = { outputs: [{ topic: 'out', value: 'tx' }],
    commits: [{ topic: 'in', partition: 0, offset: 1 }] };
  const tx = b.transaction(token, 'tx', request);
  set(10);
  assert.equal(b.maintenance().prunedRecords, 3);
  assert.deepEqual(b.publish('out', 'one', { idempotencyKey: 'id' }), result);
  assert.deepEqual(b.transaction(token, 'tx', request), tx);
  set(20);
  assert.equal(b.maintenance().expiredDedupe, 2);
  assert.equal(b.publish('out', 'two', { idempotencyKey: 'id' }).offset, 2);
  assert.equal(b.transaction(token, 'tx', { outputs: [{ topic: 'out', value: 'tx again' }],
    commits: [{ topic: 'in', partition: 0, offset: 1 }] })[0].offset, 3);
});

/** @id TEST-LIFECYCLE-004 @verifies REQ-LIFECYCLE-007 REQ-LIFECYCLE-008 */
test('TEST-LIFECYCLE-004 invalid clocks/options cannot partially expire state', () => {
  const { b, set } = make();
  b.join('g', 'one', ['in']);
  set(5); b.publish('in', 1);
  for (const bad of [-1, NaN, Infinity]) {
    set(bad);
    assert.throws(() => b.maintenance(), /clock/);
    assert.equal(b.group('g').members.length, 1);
  }
  set(10);
  for (const options of [{ sessionTimeout: 0 }, { dedupeTtl: -1 }, { retentionMs: NaN }]) {
    assert.throws(() => b.maintenance(options));
    assert.equal(b.group('g').members.length, 1);
  }
  assert.deepEqual(b.maintenance(), { expiredMembers: 1, prunedRecords: 0, expiredDedupe: 0 });
  assert.deepEqual(b.maintenance(), { expiredMembers: 0, prunedRecords: 0, expiredDedupe: 0 });
});

/** @id TEST-LIFECYCLE-005 @verifies REQ-LIFECYCLE-009 */
test('TEST-LIFECYCLE-005 lifecycle transition table characterization', () => {
  assert.deepEqual(TRANSITIONS, {
    active: { heartbeat: 'active', timeout: 'absent' },
    absent: { join: 'active', heartbeat: 'error' }
  });
  assert.equal(Object.isFrozen(TRANSITIONS), true);
  assert.equal(Object.isFrozen(TRANSITIONS.active), true);
});
