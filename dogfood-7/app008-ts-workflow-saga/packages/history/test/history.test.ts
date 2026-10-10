import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { History } from '../src/index.ts';

function fixture(fn: (store: History, path: string) => void) {
  const path = mkdtempSync(join(process.cwd(), '.test-work-'));
  try { fn(new History(path), path); } finally { rmSync(path, { recursive: true, force: true }); }
}
const event = (value: number) => ({ type: 'Value', data: { value } });

/** @id TEST-HISTORY-001 @verifies REQ-HISTORY-001 */
test('TEST-HISTORY-001 contiguous append', () => fixture(h => {
  assert.deepEqual(h.append('r', 0, [event(1), event(2)]).map(e => e.seq), [1, 2]);
  assert.deepEqual(h.read('r').map(e => e.data.value), [1, 2]);
}));
/** @id TEST-HISTORY-002 @verifies REQ-HISTORY-002 */
test('TEST-HISTORY-002 reopen persisted history', () => fixture((h, path) => {
  h.append('r', 0, [event(4)]);
  assert.equal(new History(path).read('r')[0].data.value, 4);
}));
/** @id TEST-HISTORY-003 @verifies REQ-HISTORY-003 */
test('TEST-HISTORY-003 stale CAS no write', () => fixture((h, path) => {
  h.append('r', 0, [event(1)]);
  assert.throws(() => new History(path).append('r', 0, [event(2)]), /conflict/i);
  assert.equal(h.read('r').length, 1);
}));
/** @id TEST-HISTORY-004 @verifies REQ-HISTORY-004 */
test('TEST-HISTORY-004 per-run isolation', () => fixture(h => {
  h.append('a', 0, [event(1)]); h.append('b', 0, [event(2)]); h.append('a', 1, [event(3)]);
  assert.deepEqual(h.read('b').map(e => e.seq), [1]);
  assert.deepEqual(h.read('a').map(e => e.seq), [1, 2]);
}));
/** @id TEST-HISTORY-005 @verifies REQ-HISTORY-005 */
test('TEST-HISTORY-005 defensive snapshots', () => fixture(h => {
  const input = event(5); const returned = h.append('r', 0, [input]);
  input.data.value = 7; returned[0].data.value = 8; h.read('r')[0].data.value = 9;
  assert.equal(h.read('r')[0].data.value, 5);
}));
/** @id TEST-HISTORY-006 @verifies REQ-HISTORY-006 */
test('TEST-HISTORY-006 corruption detection', () => fixture((h, path) => {
  h.append('r', 0, [event(4)]);
  const file = join(path, 'history.jsonl');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"value":4', '"value":9'));
  assert.throws(() => h.read('r'), /corrupt/i);
  appendFileSync(file, '{bad\n');
  assert.throws(() => h.read('r'), /corrupt/i);
}));
/** @id TEST-HISTORY-007 @verifies REQ-HISTORY-007 */
test('TEST-HISTORY-007 invalid batch writes nothing', () => fixture(h => {
  for (const invalid of [NaN, Infinity, undefined, () => 1, 1n]) {
    assert.throws(() => h.append('r', 0, [event(1), { type: 'Bad', data: { invalid } }]), /JSON/i);
    assert.equal(h.read('r').length, 0);
  }
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.throws(() => h.append('r', 0, [{ type: 'Bad', data: cycle }]), /JSON/i);
}));
/** @id TEST-HISTORY-008 @verifies REQ-HISTORY-008 */
test('TEST-HISTORY-008 identifier validation', () => fixture(h => {
  assert.throws(() => h.append('', 0, [event(1)]), /identifier/i);
  assert.throws(() => h.append('r', 0, [{ type: '', data: {} }]), /type/i);
  assert.throws(() => h.append('r', -1, [event(1)]), /sequence/i);
}));
/** @id TEST-HISTORY-009 @verifies REQ-HISTORY-009 */
test('TEST-HISTORY-009 run leases across instances', () => fixture((h, path) => {
  const release = h.acquireLease('r');
  assert.throws(() => new History(path).acquireLease('r'), /busy/i);
  const releaseOther = h.acquireLease('other'); releaseOther();
  release(); release();
  h.acquireLease('r')();
}));
/** @id TEST-HISTORY-010 @verifies REQ-HISTORY-010 */
test('TEST-HISTORY-010 store lock is fail closed', () => fixture((h, path) => {
  mkdirSync(join(path, 'append.lock'));
  assert.throws(() => h.append('r', 0, [event(1)]), /busy/i);
  assert.equal(h.read('r').length, 0);
  rmSync(join(path, 'append.lock'), { recursive: true });
  assert.equal(h.append('r', 0, [event(2)])[0].seq, 1);
}));
