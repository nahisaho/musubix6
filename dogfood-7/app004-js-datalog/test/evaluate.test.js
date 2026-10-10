import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, tuples, query } from '../src/evaluate.js';

const reach = 'edge(a,b). edge(b,c). edge(c,a). path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), edge(Y,Z).';
const sorted = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** @id TEST-EVALUATE-001 @verifies REQ-EVALUATE-001 */
test('TEST-EVALUATE-001 recursive fixed point', () => {
  assert.equal(tuples(evaluate(reach), 'path').length, 9);
});
/** @id TEST-EVALUATE-009 @verifies REQ-EVALUATE-009 */
test('TEST-EVALUATE-009 strict standalone query contract', () => {
  const r = evaluate('p(a).');
  assert.throws(() => query(r, '?- p(X,Y).'), /arity/);
  assert.throws(() => query(r, '?- p(X). ?- p(a).'), /exactly one query/);
  assert.throws(() => query(r, 'p(b). ?- p(X).'), /exactly one query/);
  assert.throws(() => query(r, '?- p(X). q(X) :- p(X).'), /exactly one query/);
  assert.deepEqual(query(r, '?- missing(X).'), []);
});
/** @id TEST-EVALUATE-010 @verifies REQ-EVALUATE-010 */
test('TEST-EVALUATE-010 work and provenance resource limits', () => {
  const source = Array.from({ length: 12 }, (_, i) => `p(${i}).`).join('') + 'q(a) :- p(X), p(Y).';
  assert.throws(() => evaluate(source, { maxWork: 20 }), /work limit/);
  assert.throws(() => evaluate(source, { maxProofs: 10 }), /proof limit/);
  assert.throws(() => evaluate(source, { maxWork: 0 }), /positive integer/);
  assert.throws(() => evaluate(source, { maxProofs: 1.5 }), /positive integer/);
  assert.deepEqual(tuples(evaluate(source, { maxWork: 1000, maxProofs: 200 }), 'q'), [['a']]);
});
/** @id TEST-EVALUATE-002 @verifies REQ-EVALUATE-002 */
test('TEST-EVALUATE-002 typed repeated-variable joins', () => {
  const r = evaluate('pair(1,1). pair(1,"1"). pair(a,b). same(X) :- pair(X,X). join(X) :- pair(X,Y), pair(Y,X).');
  assert.deepEqual(tuples(r, 'same'), [[1]]);
  assert.deepEqual(tuples(r, 'join'), [[1]]);
});
/** @id TEST-EVALUATE-003 @verifies REQ-EVALUATE-003 */
test('TEST-EVALUATE-003 completed lower-stratum negation', () => {
  const r = evaluate('node(a). node(b). node(c). edge(a,b). edge(b,c). path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), edge(Y,Z). unreachable(X,Y) :- node(X), node(Y), not path(X,Y).');
  assert.equal(tuples(r, 'unreachable').length, 6);
  assert.ok(!tuples(r, 'unreachable').some(t => t[0] === 'a' && t[1] === 'c'));
});
/** @id TEST-EVALUATE-004 @verifies REQ-EVALUATE-004 */
test('TEST-EVALUATE-004 comparison conjunction', () => {
  const r = evaluate('v(1). v(2). v(3). v("2"). ok(X) :- X >= 2, v(X), X < 4, X != 3. eq(X) :- v(X), X = 2. ne(X) :- v(X), X != 2. le(X) :- v(X), X <= 1. gt(X) :- v(X), X > 2.');
  assert.deepEqual(tuples(r, 'ok'), [[2]]);
  assert.deepEqual(tuples(r, 'eq'), [[2]]);
  assert.deepEqual(sorted(tuples(r, 'ne')), sorted([[1], [3], ['2']]));
  assert.deepEqual(tuples(r, 'le'), [[1]]);
  assert.deepEqual(tuples(r, 'gt'), [[3]]);
});
/** @id TEST-EVALUATE-005 @verifies REQ-EVALUATE-005 */
test('TEST-EVALUATE-005 set semantics', () => {
  assert.deepEqual(tuples(evaluate('a(x). a(x). b(X) :- a(X). b(X) :- a(X).'), 'b'), [['x']]);
});
/** @id TEST-EVALUATE-006 @verifies REQ-EVALUATE-006 */
test('TEST-EVALUATE-006 query pattern matching', () => {
  const r = evaluate('p(a,a,1). p(a,b,2). p(b,b,3).');
  assert.deepEqual(query(r, '?- p(a,X,_).'), [['a', 'a', 1], ['a', 'b', 2]]);
  assert.deepEqual(query(r, '?- p(X,X,_).'), [['a', 'a', 1], ['b', 'b', 3]]);
  assert.deepEqual(query(r, '?- absent(X).'), []);
});
/** @id TEST-EVALUATE-007 @verifies REQ-EVALUATE-007 */
test('TEST-EVALUATE-007 semi-naive differential and work reduction', () => {
  const source = Array.from({ length: 18 }, (_, i) => `edge(${i},${i + 1}).`).join('') + 'path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), edge(Y,Z).';
  const a = evaluate(source), b = evaluate(source, { strategy: 'naive' });
  assert.deepEqual(sorted(tuples(a, 'path')), sorted(tuples(b, 'path')));
  assert.ok(a.stats.candidates < b.stats.candidates, `${a.stats.candidates} !< ${b.stats.candidates}`);
});
/** @id TEST-EVALUATE-008 @verifies REQ-EVALUATE-008 */
test('TEST-EVALUATE-008 explicit limits', () => {
  assert.throws(() => evaluate(reach, { maxIterations: 1 }), /iteration limit/);
  assert.throws(() => evaluate(reach, { maxFacts: 3 }), /fact limit/);
  assert.throws(() => evaluate(reach, { strategy: 'other' }), /strategy/);
  assert.throws(() => evaluate(reach, { maxFacts: -1 }), /positive integer/);
});
