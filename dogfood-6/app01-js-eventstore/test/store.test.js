import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStore, ConcurrencyError } from '../src/store.js';

const ev = (type, data = {}, meta = {}) => ({ type, data, meta });

/** @id TEST-STORE-001 @verifies REQ-STORE-001 */
test('TEST-STORE-001 append to new stream assigns versions', () => {
  const s = new EventStore();
  const out = s.append('a', 0, [ev('X'), ev('Y')]);
  assert.deepEqual(out.map((e) => e.version), [1, 2]);
  assert.equal(out[0].streamId, 'a');
  assert.equal(out[1].type, 'Y');
});

/** @id TEST-STORE-002 @verifies REQ-STORE-002 */
test('TEST-STORE-002 conflict throws and stores nothing', () => {
  const s = new EventStore();
  s.append('a', 0, [ev('X')]);
  assert.throws(() => s.append('a', 0, [ev('Y')]), ConcurrencyError);
  assert.throws(() => s.append('a', 5, [ev('Y')]), ConcurrencyError);
  assert.equal(s.read('a').length, 1);
  assert.equal(s.readAll(0).length, 1);
});

/** @id TEST-STORE-003 @verifies REQ-STORE-003 */
test('TEST-STORE-003 any skips version check', () => {
  const s = new EventStore();
  s.append('a', 0, [ev('X')]);
  const out = s.append('a', 'any', [ev('Y')]);
  assert.equal(out[0].version, 2);
  assert.throws(() => s.append('a', -1, [ev('Z')]), TypeError);
  assert.throws(() => s.append('a', 'foo', [ev('Z')]), TypeError);
});

/** @id TEST-STORE-004 @verifies REQ-STORE-004 */
test('TEST-STORE-004 globalSeq increases across streams', () => {
  const s = new EventStore();
  const a = s.append('a', 0, [ev('X'), ev('Y')]);
  const b = s.append('b', 0, [ev('Z')]);
  const c = s.append('a', 2, [ev('W')]);
  assert.deepEqual([...a, ...b, ...c].map((e) => e.globalSeq), [1, 2, 3, 4]);
});

/** @id TEST-STORE-005 @verifies REQ-STORE-005 */
test('TEST-STORE-005 read from version', () => {
  const s = new EventStore();
  s.append('a', 0, [ev('X'), ev('Y'), ev('Z')]);
  assert.deepEqual(s.read('a', 2).map((e) => e.type), ['Y', 'Z']);
  assert.deepEqual(s.read('a').map((e) => e.type), ['X', 'Y', 'Z']);
  assert.deepEqual(s.read('nope'), []);
});

/** @id TEST-STORE-006 @verifies REQ-STORE-006 */
test('TEST-STORE-006 empty append is RangeError', () => {
  const s = new EventStore();
  assert.throws(() => s.append('a', 0, []), RangeError);
});

/** @id TEST-STORE-007 @verifies REQ-STORE-007 */
test('TEST-STORE-007 events are frozen and input untouched', () => {
  const s = new EventStore();
  const input = ev('X', { n: 1 });
  const [stored] = s.append('a', 0, [input]);
  assert.ok(Object.isFrozen(stored));
  assert.equal(input.version, undefined);
  assert.equal(input.globalSeq, undefined);
  assert.throws(() => { stored.type = 'Q'; }, TypeError);
});

/** @id TEST-STORE-008 @verifies REQ-STORE-008 */
test('TEST-STORE-008 findByCommandId', () => {
  const s = new EventStore();
  s.append('a', 0, [ev('X', {}, { commandId: 'c1' }), ev('Y', {}, { commandId: 'c1' })]);
  s.append('b', 0, [ev('Z', {}, { commandId: 'c2' })]);
  assert.deepEqual(s.findByCommandId('c1').map((e) => e.type), ['X', 'Y']);
  assert.deepEqual(s.findByCommandId('zzz'), []);
});

/** @id TEST-STORE-009 @verifies REQ-STORE-009 */
test('TEST-STORE-009 readAll after seq', () => {
  const s = new EventStore();
  s.append('a', 0, [ev('X'), ev('Y')]);
  s.append('b', 0, [ev('Z')]);
  assert.deepEqual(s.readAll(1).map((e) => e.type), ['Y', 'Z']);
  assert.deepEqual(s.readAll(3), []);
});
