import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, liveness, executeAllocated } from '../src/allocation.js';
const p = (code, registers, arity = 0) => ({ code, registers, arity });
const sum = p([['ADD', 2, 0, 1], ['RETURN', 2]], 3, 2);
/** @id TEST-RA-001 @verifies REQ-RA-001 */
test('TEST-RA-001 CFG liveness', () => {
  const result = liveness(sum);
  assert.deepEqual([...result.liveIn[0]].sort(), [0, 1]);
  assert.deepEqual([...result.liveOut[0]], [2]);
});
/** @id TEST-RA-002 @verifies REQ-RA-002 */
test('TEST-RA-002 reuse disjoint lifetimes', () => {
  const a = allocate(p([['CONST', 0, 1], ['MOV', 1, 0], ['MOV', 2, 1], ['RETURN', 2]], 3), 1);
  assert.equal(a.spillCount, 0);
  assert.equal(new Set(a.locations.map(x => x.index)).size, 1);
});
/** @id TEST-RA-003 @verifies REQ-RA-003 */
test('TEST-RA-003 interference', () => {
  const a = allocate(sum, 2);
  assert.notDeepEqual(a.locations[0], a.locations[1]);
  assert.equal(a.spillCount, 0);
});
/** @id TEST-RA-004 @verifies REQ-RA-004 */
test('TEST-RA-004 bounded spilling', () => {
  const a = allocate(p([['ADD', 3, 0, 1], ['ADD', 4, 3, 2], ['RETURN', 4]], 5, 3), 1);
  assert.equal(a.spillCount, 2);
  assert.notDeepEqual(a.locations[0], a.locations[1]);
  assert.notDeepEqual(a.locations[1], a.locations[2]);
});
/** @id TEST-RA-005 @verifies REQ-RA-005 */
test('TEST-RA-005 executable spills', () => {
  const a = allocate(sum, 1);
  assert.equal(executeAllocated(a, [17, 25]), 42);
  assert.equal(executeAllocated(a, [-5, 4]), -1);
});
/** @id TEST-RA-006 @verifies REQ-RA-006 */
test('TEST-RA-006 backedge fixed point', () => {
  const loop = p([['CONST', 1, 0], ['CONST', 2, 1], ['LT', 3, 1, 0], ['JZ', 3, 7], ['ADD', 1, 1, 2], ['JMP', 2], ['JMP', 7], ['RETURN', 1]], 4, 1);
  assert.equal(executeAllocated(allocate(loop, 2), [20]), 20);
  assert.equal(liveness(loop).liveOut[5].has(0), true);
});
/** @id TEST-RA-007 @verifies REQ-RA-007 */
test('TEST-RA-007 invalid allocation budgets', () => {
  for (const n of [0, -1, Infinity, 1.5, '2']) assert.throws(() => allocate(sum, n), /register budget/i);
});
/** @id TEST-RA-008 @verifies REQ-RA-008 */
test('TEST-RA-008 simultaneous inputs', () => {
  const a = allocate(p([['MUL', 2, 0, 1], ['RETURN', 2]], 3, 2), 1);
  assert.equal(executeAllocated(a, [6, 7]), 42);
  assert.equal(a.spillCount, 1);
});
