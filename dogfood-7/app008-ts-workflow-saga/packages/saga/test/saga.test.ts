import test from 'node:test';
import assert from 'node:assert/strict';
import { backoff, retryDecision, compensations, PermanentError } from '../src/index.ts';
const policy = { maxAttempts: 3, base: 10, cap: 25 };
const successful = [
  { step: 'a', compensation: 'undo-a', output: { amount: 10 } },
  { step: 'b', compensation: 'undo-b', output: { amount: 20 } }
];
/** @id TEST-SAGA-001 @verifies REQ-SAGA-001 */
test('TEST-SAGA-001 exponential backoff', () => assert.deepEqual([1, 2, 3].map(a => backoff(a, 10, 100)), [10, 20, 40]));
/** @id TEST-SAGA-002 @verifies REQ-SAGA-002 */
test('TEST-SAGA-002 cap before overflow', () => {
  assert.equal(backoff(9999, 10, 100), 100); assert.equal(backoff(2, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});
/** @id TEST-SAGA-003 @verifies REQ-SAGA-003 */
test('TEST-SAGA-003 invalid policy', () => {
  for (const args of [[0, 10, 100], [1.5, 10, 100], [1, -1, 100], [1, 10, 9]]) {
    assert.throws(() => backoff(args[0], args[1], args[2]), /invalid/i);
  }
});
/** @id TEST-SAGA-004 @verifies REQ-SAGA-004 */
test('TEST-SAGA-004 deterministic retry deadline', () => assert.equal(retryDecision(policy, 2, 100, new Error('offline')), 120));
/** @id TEST-SAGA-005 @verifies REQ-SAGA-005 */
test('TEST-SAGA-005 exhausted attempts', () => assert.equal(retryDecision(policy, 3, 100, new Error('offline')), null));
/** @id TEST-SAGA-006 @verifies REQ-SAGA-006 */
test('TEST-SAGA-006 permanent error', () => assert.equal(retryDecision(policy, 1, 100, new PermanentError('declined')), null));
/** @id TEST-SAGA-007 @verifies REQ-SAGA-007 */
test('TEST-SAGA-007 reverse compensation', () => assert.deepEqual(compensations('run', successful, []).map(c => c.step), ['b', 'a']));
/** @id TEST-SAGA-008 @verifies REQ-SAGA-008 */
test('TEST-SAGA-008 skip absent and completed compensation', () => {
  assert.deepEqual(compensations('run', [...successful, { step: 'c', output: null }], ['b']).map(c => c.step), ['a']);
});
/** @id TEST-SAGA-009 @verifies REQ-SAGA-009 */
test('TEST-SAGA-009 compensation payload and key', () => {
  const item = compensations('run', successful, [])[0];
  assert.equal(item.effectKey, 'run:compensate:b'); assert.deepEqual(item.output, { amount: 20 });
  item.output = null; assert.deepEqual(successful[1].output, { amount: 20 });
});
/** @id TEST-SAGA-010 @verifies REQ-SAGA-010 */
test('TEST-SAGA-010 deadline overflow', () => {
  assert.throws(() => retryDecision(policy, 1, Number.MAX_SAFE_INTEGER, new Error('offline')), /time/i);
});
