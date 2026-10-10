import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';

/** @id TEST-PARSER-001 @verifies REQ-PARSER-001 */
test('TEST-PARSER-001 typed facts', () => {
  assert.deepEqual(parse('edge(a, "2", 2).').facts[0].terms.map(t => t.value), ['a', '2', 2]);
  assert.equal(parse('edge(a,b).').facts[0].predicate, 'edge');
});
/** @id TEST-PARSER-002 @verifies REQ-PARSER-002 */
test('TEST-PARSER-002 rules and IDs', () => {
  const p = parse('path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), edge(Y,Z).');
  assert.deepEqual(p.rules.map(r => r.id), ['r1', 'r2']);
  assert.equal(p.rules[1].body[1].terms[0].name, 'Y');
});
/** @id TEST-PARSER-003 @verifies REQ-PARSER-003 */
test('TEST-PARSER-003 negation and comparisons', () => {
  const p = parse('ok(X) :- item(X), not banned(X), X >= 3, X != 4.');
  assert.equal(p.rules[0].body[1].negated, true);
  assert.deepEqual(p.rules[0].body.slice(2).map(x => x.op), ['>=', '!=']);
});
/** @id TEST-PARSER-004 @verifies REQ-PARSER-004 */
test('TEST-PARSER-004 comments and escaping', () => {
  assert.deepEqual(parse('% hello\n// hello\nword("a\\n\\"b", \'it\\\'s\', "//").').facts[0].terms.map(t => t.value), ['a\n"b', "it's", '//']);
});
/** @id TEST-PARSER-005 @verifies REQ-PARSER-005 */
test('TEST-PARSER-005 queries', () => {
  const q = parse('?- edge(a,X,X,_).').queries[0];
  assert.deepEqual(q.terms.map(t => t.kind), ['const', 'var', 'var', 'wildcard']);
});
/** @id TEST-PARSER-006 @verifies REQ-PARSER-006 */
test('TEST-PARSER-006 located syntax errors', () => {
  for (const s of ['a(x)', 'a(x).\nb(@).', 'a("unterminated).', 'a(x) :- .']) {
    assert.throws(() => parse(s), e => e instanceof SyntaxError && /line \d+, column \d+/.test(e.message));
  }
});
/** @id TEST-PARSER-007 @verifies REQ-PARSER-007 */
test('TEST-PARSER-007 non-ground facts', () => {
  assert.throws(() => parse('a(X).'), /ground/);
  assert.throws(() => parse('a(_).'), /ground/);
});
/** @id TEST-PARSER-008 @verifies REQ-PARSER-008 */
test('TEST-PARSER-008 zero arity and numbers', () => {
  assert.deepEqual(parse('ready(). val(-2.5,+3,0).').facts.map(a => a.terms.map(t => t.value)), [[], [-2.5, 3, 0]]);
  assert.throws(() => parse(`val(${'9'.repeat(400)}).`), /finite/);
  assert.throws(() => parse(`val(-${'9'.repeat(400)}).`), /finite/);
});
