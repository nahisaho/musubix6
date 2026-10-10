import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { stratify } from '../src/stratify.js';

/** @id TEST-STRATIFY-001 @verifies REQ-STRATIFY-001 */
test('TEST-STRATIFY-001 positive recursion', () => {
  assert.deepEqual([...stratify(parse('a(X) :- b(X). b(X) :- a(X).')).strata.values()], [0, 0]);
});
/** @id TEST-STRATIFY-002 @verifies REQ-STRATIFY-002 */
test('TEST-STRATIFY-002 negative ordering', () => {
  const s = stratify(parse('item(a). good(X) :- item(X), not bad(X). best(X) :- good(X), not worse(X).')).strata;
  assert.ok(s.get('good') > s.get('bad'));
  assert.ok(s.get('best') >= s.get('good'));
  assert.ok(s.get('best') > s.get('worse'));
});
/** @id TEST-STRATIFY-003 @verifies REQ-STRATIFY-003 */
test('TEST-STRATIFY-003 negative cycles', () => {
  assert.throws(() => stratify(parse('d(a). a(X) :- d(X), not b(X). b(X) :- a(X).')), /negative.*cycle|unstratifiable/);
  assert.throws(() => stratify(parse('d(a). a(X) :- d(X), not a(X).')), /negative.*cycle|unstratifiable/);
});
/** @id TEST-STRATIFY-004 @verifies REQ-STRATIFY-004 */
test('TEST-STRATIFY-004 unsafe heads', () => {
  assert.throws(() => stratify(parse('a(X) :- b(Y).')), /unsafe.*X/);
});
/** @id TEST-STRATIFY-005 @verifies REQ-STRATIFY-005 */
test('TEST-STRATIFY-005 unsafe filters', () => {
  assert.throws(() => stratify(parse('a(X) :- b(X), not c(Y).')), /unsafe.*Y/);
  assert.throws(() => stratify(parse('a(X) :- b(X), Y > 1.')), /unsafe.*Y/);
});
/** @id TEST-STRATIFY-006 @verifies REQ-STRATIFY-006 */
test('TEST-STRATIFY-006 consistent arity', () => {
  assert.throws(() => stratify(parse('a(x). a(x,y).')), /arity/);
  assert.throws(() => stratify(parse('a(x). ?- a(X,Y).')), /arity/);
});
/** @id TEST-STRATIFY-007 @verifies REQ-STRATIFY-007 */
test('TEST-STRATIFY-007 disconnected predicates', () => {
  const p = stratify(parse('isolated(a). b(X) :- c(X). a(X) :- c(X), not absent(X).'));
  assert.ok(p.strata.has('isolated'));
  assert.ok(p.strata.has('absent'));
  assert.deepEqual(p.groups.map(g => g.level), [0, 1]);
});
/** @id TEST-STRATIFY-008 @verifies REQ-STRATIFY-008 */
test('TEST-STRATIFY-008 wildcard safety', () => {
  assert.throws(() => stratify(parse('a(_) :- b(X).')), /anonymous/);
  assert.throws(() => stratify(parse('a(X) :- b(X), not c(_).')), /anonymous/);
  assert.throws(() => stratify(parse('a(X) :- b(X), _ = 1.')), /anonymous/);
  assert.equal(stratify(parse('a(X) :- b(X,_).')).groups.length, 1);
});
