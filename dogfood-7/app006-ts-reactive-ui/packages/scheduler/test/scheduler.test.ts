import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../src/index.ts';

/** @id TEST-SCHEDULER-001 @verifies REQ-SCHEDULER-001 */
test('TEST-SCHEDULER-001 priorities', () => {
  const s = createScheduler(); const out: string[] = [];
  s.schedule(() => out.push('idle'), 'idle'); s.schedule(() => out.push('normal')); s.schedule(() => out.push('now'), 'immediate');
  s.flush(); assert.deepEqual(out, ['now', 'normal', 'idle']);
});
/** @id TEST-SCHEDULER-002 @verifies REQ-SCHEDULER-002 */
test('TEST-SCHEDULER-002 FIFO', () => {
  const s = createScheduler(); const out: number[] = [];
  s.schedule(() => out.push(1)); s.schedule(() => out.push(2)); s.flush(); assert.deepEqual(out, [1, 2]);
});
/** @id TEST-SCHEDULER-003 @verifies REQ-SCHEDULER-003 */
test('TEST-SCHEDULER-003 keyed replacement', () => {
  const s = createScheduler(); const out: number[] = [];
  s.schedule(() => out.push(1), 'idle', 'x'); s.schedule(() => out.push(2), 'immediate', 'x');
  assert.equal(s.pending, 1); s.flush(); assert.deepEqual(out, [2]);
});
/** @id TEST-SCHEDULER-004 @verifies REQ-SCHEDULER-004 */
test('TEST-SCHEDULER-004 cancel', () => {
  const s = createScheduler(); let n = 0; const cancel = s.schedule(() => { n++; });
  cancel(); cancel(); s.flush(); assert.equal(n, 0);
});
/** @id TEST-SCHEDULER-005 @verifies REQ-SCHEDULER-005 */
test('TEST-SCHEDULER-005 enqueue during flush', () => {
  const s = createScheduler(); const out: number[] = [];
  s.schedule(() => { out.push(1); s.schedule(() => out.push(2), 'immediate'); });
  s.schedule(() => out.push(3), 'idle'); s.flush(); assert.deepEqual(out, [1, 2, 3]);
});
/** @id TEST-SCHEDULER-006 @verifies REQ-SCHEDULER-006 */
test('TEST-SCHEDULER-006 budget', () => {
  const s = createScheduler(); let n = 0; s.schedule(() => { n++; }); s.schedule(() => { n++; });
  assert.equal(s.flush(1), 1); assert.equal(n, 1); assert.equal(s.pending, 1); s.flush(); assert.equal(n, 2);
});
/** @id TEST-SCHEDULER-007 @verifies REQ-SCHEDULER-007 */
test('TEST-SCHEDULER-007 error isolation', () => {
  const s = createScheduler(); let n = 0;
  s.schedule(() => { throw new Error('bad'); }); s.schedule(() => { n++; });
  assert.throws(() => s.flush(), AggregateError); assert.equal(n, 1); assert.equal(s.pending, 0);
});
/** @id TEST-SCHEDULER-008 @verifies REQ-SCHEDULER-008 */
test('TEST-SCHEDULER-008 reentrancy', () => {
  const s = createScheduler(); let n = 0;
  s.schedule(() => { assert.throws(() => s.flush(), /reentrant/); }); s.schedule(() => { n++; });
  s.flush(); assert.equal(n, 1);
});
/** @id TEST-SCHEDULER-009 @verifies REQ-SCHEDULER-009 */
test('TEST-SCHEDULER-009 microtask drain', async () => {
  const s = createScheduler({ auto: true }); let n = 0;
  s.schedule(() => { n++; }, 'normal', 'x'); s.schedule(() => { n += 2; }, 'normal', 'x');
  assert.equal(n, 0); await new Promise<void>(resolve => queueMicrotask(resolve)); assert.equal(n, 2); assert.equal(s.pending, 0);
});
/** @id TEST-SCHEDULER-010 @verifies REQ-SCHEDULER-010 */
test('TEST-SCHEDULER-010 validation', () => {
  const s = createScheduler(); s.schedule(() => {});
  assert.throws(() => s.schedule(() => {}, 'invalid' as never), /priority/);
  assert.throws(() => s.flush(-1), /budget/); assert.throws(() => s.flush(NaN), /budget/); assert.equal(s.pending, 1);
});
/** @id TEST-SCHEDULER-011 @verifies REQ-SCHEDULER-011 */
test('TEST-SCHEDULER-011 cancellation generation', () => {
  const s = createScheduler(); let n = 0;
  const old = s.schedule(() => { n++; }, 'normal', 'x');
  const fresh = s.schedule(() => { n += 2; }, 'normal', 'x');
  old(); s.flush(); assert.equal(n, 2); fresh(); assert.equal(s.pending, 0);
  s.schedule(() => { n++; }, 'normal', 'y'); const cancel = s.schedule(() => { n += 2; }, 'normal', 'y');
  cancel(); s.flush(); assert.equal(n, 2);
});
/** @id TEST-SCHEDULER-012 @verifies REQ-SCHEDULER-012 */
test('TEST-SCHEDULER-012 automatic errors', async () => {
  const errors: AggregateError[] = []; const s = createScheduler({ auto: true, onError: e => errors.push(e) }); let n = 0;
  s.schedule(() => { throw new Error('auto failure'); }); s.schedule(() => { n++; });
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(n, 1); assert.equal(errors.length, 1); assert.equal(errors[0].errors[0].message, 'auto failure');
  const fallback = createScheduler({ auto: true }); fallback.schedule(() => { throw new Error('retained'); });
  await new Promise<void>(resolve => queueMicrotask(resolve)); assert.equal(fallback.errors.length, 1);
});
