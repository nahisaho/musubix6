import test from 'node:test';
import assert from 'node:assert/strict';
import { signal, effect, computed, batch, untrack } from '../src/index.ts';

/** @id TEST-SIGNALS-001 @verifies REQ-SIGNALS-001 */
test('TEST-SIGNALS-001 read/write', () => {
  const s = signal(1); s.set(2); assert.equal(s.get(), 2);
});
/** @id TEST-SIGNALS-002 @verifies REQ-SIGNALS-002 */
test('TEST-SIGNALS-002 effects', () => {
  const s = signal(1); const seen: number[] = []; const stop = effect(() => { seen.push(s.get()); });
  s.set(2); assert.deepEqual(seen, [1, 2]); stop();
});
/** @id TEST-SIGNALS-003 @verifies REQ-SIGNALS-003 */
test('TEST-SIGNALS-003 equality', () => {
  const s = signal(NaN); let n = 0; const stop = effect(() => { s.get(); n++; });
  s.set(NaN); assert.equal(n, 1); stop();
});
/** @id TEST-SIGNALS-004 @verifies REQ-SIGNALS-004 */
test('TEST-SIGNALS-004 dynamic dependencies', () => {
  const choose = signal(true), a = signal(1), b = signal(9); const seen: number[] = [];
  const stop = effect(() => { seen.push(choose.get() ? a.get() : b.get()); });
  choose.set(false); a.set(2); b.set(10); assert.deepEqual(seen, [1, 9, 10]); stop();
});
/** @id TEST-SIGNALS-005 @verifies REQ-SIGNALS-005 */
test('TEST-SIGNALS-005 nested batches', () => {
  const a = signal(0), b = signal(0); const seen: number[] = []; const stop = effect(() => { seen.push(a.get() + b.get()); });
  batch(() => { a.set(1); batch(() => b.set(2)); a.set(3); }); assert.deepEqual(seen, [0, 5]); stop();
});
/** @id TEST-SIGNALS-006 @verifies REQ-SIGNALS-006 */
test('TEST-SIGNALS-006 lazy computed', () => {
  const s = signal(2); let n = 0; const c = computed(() => { n++; return s.get() * 2; });
  assert.equal(n, 0); assert.equal(c.get(), 4); assert.equal(c.get(), 4); assert.equal(n, 1);
  s.set(3); assert.equal(n, 1); assert.equal(c.get(), 6); assert.equal(n, 2);
});
/** @id TEST-SIGNALS-007 @verifies REQ-SIGNALS-007 */
test('TEST-SIGNALS-007 disposal', () => {
  const s = signal(0); let runs = 0, clean = 0;
  const stop = effect(() => { s.get(); runs++; return () => { clean++; }; });
  stop(); stop(); s.set(1); assert.equal(runs, 1); assert.equal(clean, 1);
});
/** @id TEST-SIGNALS-008 @verifies REQ-SIGNALS-008 */
test('TEST-SIGNALS-008 cleanup order', () => {
  const s = signal(0); const seen: string[] = [];
  const stop = effect(() => { const v = s.get(); seen.push(`run${v}`); return () => { seen.push(`clean${v}`); }; });
  s.set(1); stop(); assert.deepEqual(seen, ['run0', 'clean0', 'run1', 'clean1']);
});
/** @id TEST-SIGNALS-009 @verifies REQ-SIGNALS-009 */
test('TEST-SIGNALS-009 untrack', () => {
  const s = signal(0); let n = 0; const stop = effect(() => { untrack(() => s.get()); n++; });
  s.set(1); assert.equal(n, 1); stop();
});
/** @id TEST-SIGNALS-010 @verifies REQ-SIGNALS-010 */
test('TEST-SIGNALS-010 cycle recovery', () => {
  const s = signal(0); assert.throws(() => effect(() => s.set(s.get() + 1)), /cycle/i);
  const other = signal(1); const seen: number[] = []; const stop = effect(() => { seen.push(other.get()); });
  other.set(2); assert.deepEqual(seen, [1, 2]); stop();
});
/** @id TEST-SIGNALS-011 @verifies REQ-SIGNALS-011 */
test('TEST-SIGNALS-011 computed propagation and diamond consistency', () => {
  const s = signal(1); const twice = computed(() => s.get() * 2), chained = computed(() => twice.get() + 1);
  const only: number[] = [], pairs: number[][] = [];
  const a = effect(() => { only.push(chained.get()); });
  const b = effect(() => { pairs.push([s.get(), twice.get()]); });
  s.set(2); assert.deepEqual(only, [3, 5]); assert.deepEqual(pairs, [[1, 2], [2, 4]]); a(); b();
});
/** @id TEST-SIGNALS-012 @verifies REQ-SIGNALS-012 */
test('TEST-SIGNALS-012 failed computed retries', () => {
  const s = signal(0); const c = computed(() => { const value = s.get(); if (value === 1) throw new Error('derive failed'); return value; });
  const seen: (number | string)[] = [];
  const stop = effect(() => { try { seen.push(c.get()); } catch { seen.push('error'); } });
  s.set(1); s.set(2); assert.deepEqual(seen, [0, 'error', 2]); stop();
});
/** @id TEST-SIGNALS-013 @verifies REQ-SIGNALS-013 */
test('TEST-SIGNALS-013 self disposal cleanup ownership', () => {
  const s = signal(0); let runs = 0, clean = 0; let stop = () => {};
  stop = effect(() => { s.get(); runs++; return () => { clean++; stop(); }; });
  s.set(1); s.set(2); assert.equal(runs, 1); assert.equal(clean, 1);
  const t = signal(0); let bodyRuns = 0, bodyClean = 0; let dispose = () => {};
  dispose = effect(() => { bodyRuns++; if (t.get() === 1) dispose(); return () => { bodyClean++; }; });
  t.set(1); t.set(2); assert.equal(bodyRuns, 2); assert.equal(bodyClean, 2);
});
