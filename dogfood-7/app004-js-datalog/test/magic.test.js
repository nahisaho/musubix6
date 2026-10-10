import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { stratify } from '../src/stratify.js';
import { evaluate, tuples, query } from '../src/evaluate.js';
import { magicRewrite } from '../src/magic.js';

const source = 'edge(a,b). edge(b,c). edge(x,y). edge(y,z). path(X,Y) :- edge(X,Y). path(X,Z) :- edge(X,Y), path(Y,Z).';
const answers = (p, q) => {
  const m = magicRewrite(p, q);
  return { m, result: evaluate(m.program), rows: query(evaluate(m.program), m.query) };
};

/** @id TEST-MAGIC-001 @verifies REQ-MAGIC-001 */
test('TEST-MAGIC-001 bound seed', () => {
  const m = magicRewrite(parse(source), parse('?- path(a,Y).').queries[0]);
  assert.ok(m.program.facts.some(a => a.predicate === 'magic_path__bf' && a.terms[0].value === 'a'));
});
/** @id TEST-MAGIC-010 @verifies REQ-MAGIC-010 */
test('TEST-MAGIC-010 linear base bridging for mixed predicates', () => {
  const p = parse(Array.from({ length: 1000 }, (_, i) => `p(${i}).`).join('') + 'p(X) :- p(X).');
  const m = magicRewrite(p, parse('?- p(X).').queries[0]);
  assert.equal(query(evaluate(m.program), m.query).length, 1000);
  assert.equal(m.program.rules.filter(r => r.id.startsWith('base:')).length, 1);
});
/** @id TEST-MAGIC-009 @verifies REQ-MAGIC-009 */
test('TEST-MAGIC-009 mixed base and derived predicate facts', () => {
  const p = parse('p(a). edge(a,b). edge(b,c). p(Y) :- p(X), edge(X,Y).');
  for (const text of ['?- p(a).', '?- p(X).', '?- p(c).']) {
    const q = parse(text).queries[0];
    assert.deepEqual(answers(p, q).rows, query(evaluate(p), q));
  }
});
/** @id TEST-MAGIC-002 @verifies REQ-MAGIC-002 */
test('TEST-MAGIC-002 unbound seed', () => {
  const { rows, m } = answers(parse(source), parse('?- path(X,Y).').queries[0]);
  assert.equal(rows.length, 6);
  assert.ok(m.program.facts.some(a => a.predicate === 'magic_path__ff' && a.terms.length === 0));
});
/** @id TEST-MAGIC-003 @verifies REQ-MAGIC-003 */
test('TEST-MAGIC-003 recursive demand propagation', () => {
  const { result } = answers(parse(source), parse('?- path(a,Y).').queries[0]);
  assert.deepEqual(tuples(result, 'magic_path__bf'), [['a'], ['b'], ['c']]);
});
/** @id TEST-MAGIC-004 @verifies REQ-MAGIC-004 */
test('TEST-MAGIC-004 answer preservation and pruning', () => {
  const p = parse(source), q = parse('?- path(a,Y).').queries[0];
  const { rows, result, m } = answers(p, q);
  assert.deepEqual(rows, query(evaluate(p), q));
  assert.ok(tuples(result, m.query.predicate).length < tuples(evaluate(p), 'path').length);
});
/** @id TEST-MAGIC-005 @verifies REQ-MAGIC-005 */
test('TEST-MAGIC-005 multiple adornments', () => {
  const p = parse('e(a,b). e(b,c). p(X,Y) :- e(X,Y). p(X,Z) :- p(X,Y), e(Y,Z).');
  const m = magicRewrite(p, parse('?- p(X,c).').queries[0]);
  assert.equal(m.query.predicate, 'p__fb');
  assert.ok(m.stats.adornments.includes('p__ff'));
  assert.deepEqual(query(evaluate(m.program), m.query), query(evaluate(p), parse('?- p(X,c).').queries[0]));
});
/** @id TEST-MAGIC-006 @verifies REQ-MAGIC-006 */
test('TEST-MAGIC-006 complete negative dependencies', () => {
  const p = parse('node(a). node(b). node(c). edge(a,b). edge(b,c). path(X,Y) :- edge(X,Y). path(X,Z) :- edge(X,Y), path(Y,Z). bad(X) :- path(X,c). good(X) :- node(X), not bad(X).');
  const q = parse('?- good(X).').queries[0], { rows } = answers(p, q);
  assert.deepEqual(rows, [['c']]);
  assert.deepEqual(rows, query(evaluate(p), q));
});
/** @id TEST-MAGIC-007 @verifies REQ-MAGIC-007 */
test('TEST-MAGIC-007 extensional query', () => {
  const p = parse(source), q = parse('?- edge(a,Y).').queries[0];
  assert.deepEqual(answers(p, q).rows, [['a', 'b']]);
});
/** @id TEST-MAGIC-008 @verifies REQ-MAGIC-008 */
test('TEST-MAGIC-008 detached safe rewrite', () => {
  const p = parse(source), before = JSON.stringify(p);
  const m = magicRewrite(p, parse('?- path(a,Y).').queries[0]);
  assert.equal(JSON.stringify(p), before);
  assert.ok(stratify(m.program).groups.length > 0);
  m.program.facts[0].terms[0].value = 'changed';
  assert.equal(JSON.stringify(p), before);
  for (const s of ['magic_path__bf(a).', 'magic_path__bf(a,b).', 'p__fb(a).']) {
    assert.throws(() => magicRewrite(parse(s), parse('?- p__fb(X).').queries[0]), /reserved/);
  }
});
