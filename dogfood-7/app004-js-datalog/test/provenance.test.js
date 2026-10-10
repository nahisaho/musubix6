import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/evaluate.js';
import { explain, formatExplanation } from '../src/provenance.js';

/** @id TEST-PROVENANCE-001 @verifies REQ-PROVENANCE-001 */
test('TEST-PROVENANCE-001 ground leaf', () => {
  const x = explain(evaluate('p(a).'), 'p', ['a']);
  assert.equal(x.kind, 'fact');
  assert.equal(x.base, true);
  assert.deepEqual(x.tuple, ['a']);
});
/** @id TEST-PROVENANCE-009 @verifies REQ-PROVENANCE-009 */
test('TEST-PROVENANCE-009 shared proof DAG expansion budget', () => {
  const source = 'p0(a).' + Array.from({ length: 14 }, (_, i) => `p${i + 1}(X) :- p${i}(X), p${i}(X).`).join('');
  const r = evaluate(source);
  const tree = explain(r, 'p14', ['a'], { maxNodes: 32 });
  const encoded = JSON.stringify(tree);
  assert.ok((encoded.match(/"predicate":/g) ?? []).length <= 64);
  assert.match(encoded, /truncated/);
  assert.equal(explain(r, 'p14', ['a'], { maxNodes: 0 }).kind, 'truncated');
  assert.throws(() => explain(r, 'p14', ['a'], { maxNodes: -1 }), /nonnegative integer/);
});
/** @id TEST-PROVENANCE-002 @verifies REQ-PROVENANCE-002 */
test('TEST-PROVENANCE-002 proof parents and bindings', () => {
  const x = explain(evaluate('edge(a,b). path(X,Y) :- edge(X,Y).'), 'path', ['a', 'b']);
  assert.equal(x.alternatives[0].rule, 'r1');
  assert.deepEqual(x.alternatives[0].bindings, { X: 'a', Y: 'b' });
  assert.equal(x.alternatives[0].parents[0].predicate, 'edge');
});
/** @id TEST-PROVENANCE-003 @verifies REQ-PROVENANCE-003 */
test('TEST-PROVENANCE-003 alternative proofs', () => {
  const x = explain(evaluate('a(x). b(x). p(X) :- a(X). p(X) :- b(X).'), 'p', ['x']);
  assert.deepEqual(x.alternatives.map(a => a.rule), ['r1', 'r2']);
});
/** @id TEST-PROVENANCE-004 @verifies REQ-PROVENANCE-004 */
test('TEST-PROVENANCE-004 recursive proof cycle', () => {
  const x = explain(evaluate('p(a). q(X) :- p(X). p(X) :- q(X).'), 'p', ['a']);
  assert.match(JSON.stringify(x), /"kind":"cycle"/);
});
/** @id TEST-PROVENANCE-005 @verifies REQ-PROVENANCE-005 */
test('TEST-PROVENANCE-005 absent evidence', () => {
  const x = explain(evaluate('node(a). good(X) :- node(X), not bad(X).'), 'good', ['a']);
  assert.deepEqual(x.alternatives[0].negatives, [{ predicate: 'bad', tuple: ['a'], absent: true }]);
});
/** @id TEST-PROVENANCE-006 @verifies REQ-PROVENANCE-006 */
test('TEST-PROVENANCE-006 missing tuple', () => {
  assert.equal(explain(evaluate('p(a).'), 'p', ['missing']), null);
});
/** @id TEST-PROVENANCE-007 @verifies REQ-PROVENANCE-007 */
test('TEST-PROVENANCE-007 explanation bounds', () => {
  const r = evaluate('p(a). q(X) :- p(X). q(X) :- p(X).');
  assert.equal(explain(r, 'q', ['a'], { maxDepth: 0 }).kind, 'truncated');
  assert.equal(explain(r, 'q', ['a'], { maxDerivations: 1 }).alternatives.at(-1).kind, 'truncated');
  assert.throws(() => explain(r, 'q', ['a'], { maxDepth: -1 }), /nonnegative integer/);
});
/** @id TEST-PROVENANCE-008 @verifies REQ-PROVENANCE-008 */
test('TEST-PROVENANCE-008 deterministic detached formatting', () => {
  const r = evaluate('p(a). q(X) :- p(X).'), a = explain(r, 'q', ['a']);
  const before = JSON.stringify(a);
  assert.equal(formatExplanation(a), formatExplanation(explain(r, 'q', ['a'])));
  assert.match(formatExplanation(a), /q\("a"\).*[\s\S]*r1[\s\S]*p\("a"\)/);
  a.alternatives[0].parents[0].tuple[0] = 'mutated';
  assert.equal(JSON.stringify(explain(r, 'q', ['a'])), before);
});
