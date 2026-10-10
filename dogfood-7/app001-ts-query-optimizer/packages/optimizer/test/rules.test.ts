import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, column, literal, compare, and, fingerprint, execute } from '@query/algebra';
import { rewrite, simplify, type Rule } from '../src/rules.ts';

/** @id TEST-RULE-001 @verifies REQ-RULE-001 */
test('TEST-RULE-001 boolean simplification folds literal conjunctions', () => {
  assert.deepEqual(simplify(and(literal(true), compare('eq', column('u.id'), literal(1)))), compare('eq', column('u.id'), literal(1)));
});
/** @id TEST-RULE-002 @verifies REQ-RULE-002 */
test('TEST-RULE-002 redundant true filter is removed', () => {
  assert.deepEqual(rewrite({ kind: 'filter', input: scan('u', ['id']), predicate: literal(true) }).plan, scan('u', ['id']));
});
/** @id TEST-RULE-003 @verifies REQ-RULE-003 */
test('TEST-RULE-003 adjacent filters merge', () => {
  const plan = rewrite({ kind: 'filter', predicate: compare('gt', column('u.id'), literal(1)), input: { kind: 'filter', input: scan('u', ['id']), predicate: compare('lt', column('u.id'), literal(8)) } }).plan;
  assert.equal(plan.kind, 'filter');
  assert.equal(plan.kind === 'filter' && plan.input.kind, 'scan');
});
/** @id TEST-RULE-004 @verifies REQ-RULE-004 */
test('TEST-RULE-004 left-only predicate moves below inner join', () => {
  const plan = rewrite({ kind: 'filter', input: { kind: 'join', left: scan('u', ['id']), right: scan('v', ['id']), predicate: literal(true) }, predicate: compare('gt', column('u.id'), literal(1)) }).plan;
  assert.equal(plan.kind === 'join' && plan.left.kind, 'filter');
});
/** @id TEST-RULE-005 @verifies REQ-RULE-005 */
test('TEST-RULE-005 cross-side filters become join conditions', () => {
  const pred = compare('eq', column('u.id'), column('v.id'));
  const plan = rewrite({ kind: 'filter', input: { kind: 'join', left: scan('u', ['id']), right: scan('v', ['id']), predicate: literal(true) }, predicate: pred }).plan;
  assert.equal(plan.kind, 'join');
  assert.deepEqual(plan.kind === 'join' && plan.predicate, pred);
});
/** @id TEST-RULE-006 @verifies REQ-RULE-006 */
test('TEST-RULE-006 identity projection disappears without row changes', () => {
  const input = scan('u', ['id']);
  const original = { kind: 'project' as const, input, columns: ['u.id'] };
  const result = rewrite(original);
  assert.deepEqual(result.plan, input);
  assert.deepEqual(execute(result.plan, { u: [{ id: 2 }] }), execute(original, { u: [{ id: 2 }] }));
});
/** @id TEST-RULE-007 @verifies REQ-RULE-007 */
test('TEST-RULE-007 rewrite is immutable and idempotent', () => {
  const input = { kind: 'filter' as const, input: scan('u', ['id']), predicate: literal(true) };
  const before = fingerprint(input);
  const result = rewrite(input);
  assert.equal(fingerprint(input), before);
  assert.deepEqual(rewrite(result.plan).plan, result.plan);
  assert.ok(result.applied.length > 0);
});
/** @id TEST-RULE-008 @verifies REQ-RULE-008 */
test('TEST-RULE-008 cyclic user rules and exhausted budgets terminate', () => {
  const cycle: Rule = { name: 'toggle', apply: p => p.kind === 'filter' ? p.input : { kind: 'filter', input: p, predicate: literal(true) } };
  assert.throws(() => rewrite(scan('u', ['id']), { rules: [cycle] }), /cycle/);
  assert.throws(() => rewrite(scan('u', ['id']), { maxPasses: 0 }), /budget/);
});
/** @id TEST-RULE-009 @verifies REQ-RULE-009 */
test('TEST-RULE-009 scalar singleton AND/OR keeps SQL UNKNOWN', () => {
  for (const kind of ['and', 'or'] as const) {
    for (const term of [literal(1), literal('s'), column('u.id')]) {
      const input = { kind: 'filter' as const, input: scan('u', ['id']), predicate: compare('eq', { kind, terms: [term] }, literal(1)) };
      const data = { u: [{ id: 1 }, { id: null }] };
      assert.deepEqual(execute(rewrite(input).plan, data), execute(input, data), `${kind} ${JSON.stringify(term)}`);
    }
  }
});
