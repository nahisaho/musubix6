import test from 'node:test';
import assert from 'node:assert/strict';
import { LogicalClock, TimerQueue } from '../src/index.ts';
/** @id TEST-TIMERS-001 @verifies REQ-TIMERS-001 */
test('TEST-TIMERS-001 logical origin', () => assert.equal(new LogicalClock(123).now, 123));
/** @id TEST-TIMERS-002 @verifies REQ-TIMERS-002 */
test('TEST-TIMERS-002 clock advancement', () => {
  const c = new LogicalClock(1); c.advanceTo(3); c.advanceTo(3); assert.equal(c.now, 3);
});
/** @id TEST-TIMERS-003 @verifies REQ-TIMERS-003 */
test('TEST-TIMERS-003 invalid clocks', () => {
  const c = new LogicalClock(10);
  for (const t of [9, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => c.advanceTo(t), /time/i);
  assert.throws(() => new LogicalClock(-1), /time/i);
});
/** @id TEST-TIMERS-004 @verifies REQ-TIMERS-004 */
test('TEST-TIMERS-004 drain exactly once', () => {
  const q = new TimerQueue(); q.schedule('r', 't', 10);
  assert.deepEqual(q.drain(10), [{ runId: 'r', key: 't', due: 10 }]); assert.deepEqual(q.drain(10), []);
});
/** @id TEST-TIMERS-005 @verifies REQ-TIMERS-005 */
test('TEST-TIMERS-005 future timers retained', () => {
  const q = new TimerQueue(); q.schedule('r', 't', 10);
  assert.deepEqual(q.drain(9), []); assert.equal(q.snapshot().length, 1);
});
/** @id TEST-TIMERS-006 @verifies REQ-TIMERS-006 */
test('TEST-TIMERS-006 stable tie ordering', () => {
  const q = new TimerQueue();
  q.schedule('z', 'a', 2); q.schedule('a', 'b', 2); q.schedule('a', 'a', 2); q.schedule('z', 'b', 1);
  assert.deepEqual(q.drain(2).map(t => [t.runId, t.key]), [['z', 'b'], ['a', 'a'], ['a', 'b'], ['z', 'a']]);
});
/** @id TEST-TIMERS-007 @verifies REQ-TIMERS-007 */
test('TEST-TIMERS-007 schedule idempotency and tuple identity', () => {
  const q = new TimerQueue(); q.schedule('a:b', 'c', 1); q.schedule('a:b', 'c', 1); q.schedule('a', 'b:c', 1);
  assert.equal(q.snapshot().length, 2);
});
/** @id TEST-TIMERS-008 @verifies REQ-TIMERS-008 */
test('TEST-TIMERS-008 changed timer rejected', () => {
  const q = new TimerQueue(); q.schedule('r', 't', 1);
  assert.throws(() => q.schedule('r', 't', 2), /conflict/i); assert.throws(() => q.schedule('', 't', 1), /identifier/i);
});
/** @id TEST-TIMERS-009 @verifies REQ-TIMERS-009 */
test('TEST-TIMERS-009 cancel is idempotent', () => {
  const q = new TimerQueue(); q.schedule('r', 't', 1);
  assert.equal(q.cancel('r', 't'), true); assert.equal(q.cancel('r', 't'), false); assert.deepEqual(q.drain(2), []);
});
/** @id TEST-TIMERS-010 @verifies REQ-TIMERS-010 */
test('TEST-TIMERS-010 snapshot restoration', () => {
  const q = new TimerQueue(); q.schedule('r', 't', 10); const snapshot = q.snapshot();
  const restored = TimerQueue.restore(snapshot); snapshot[0].due = 20;
  assert.equal(restored.drain(10)[0].due, 10);
  assert.throws(() => TimerQueue.restore([{ runId: 'r', key: 't', due: NaN }]), /time/i);
});
