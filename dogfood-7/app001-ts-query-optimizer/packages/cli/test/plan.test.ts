import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { scan, column, literal, compare, execute, fingerprint } from '@query/algebra';
import { optimize, printPlan, explainJSON, parseRequest } from '../src/index.ts';

/** @id TEST-PLAN-001 @verifies REQ-PLAN-001 */
test('TEST-PLAN-001 optimizer validates input before execution', () => {
  assert.throws(() => optimize({ kind: 'project', input: scan('u', ['id']), columns: ['u.bad'] }, {}), /unknown column/);
});
/** @id TEST-PLAN-002 @verifies REQ-PLAN-002 */
test('TEST-PLAN-002 end to end optimization preserves results', () => {
  const plan = { kind: 'filter' as const, input: { kind: 'join' as const, left: scan('u', ['id']), right: scan('v', ['id']), predicate: compare('eq', column('u.id'), column('v.id')) }, predicate: compare('gt', column('u.id'), literal(1)) };
  const optimized = optimize(plan, { u: { rows: 100, columns: {} }, v: { rows: 2, columns: {} } });
  const data = { u: [{ id: 1 }, { id: 2 }], v: [{ id: 2 }] };
  assert.deepEqual(execute(optimized.plan, data), execute(plan, data));
  assert.ok(optimized.cost <= optimized.originalCost);
});
/** @id TEST-PLAN-003 @verifies REQ-PLAN-003 */
test('TEST-PLAN-003 text printer exposes tree indentation and cost', () => {
  assert.equal(printPlan(optimize(scan('u', ['id']), { u: { rows: 10, columns: {} } })), 'Scan u AS u [rows=10 cost=10]');
});
/** @id TEST-PLAN-004 @verifies REQ-PLAN-004 */
test('TEST-PLAN-004 JSON explanation is structured and serializable', () => {
  const info = explainJSON(optimize(scan('u', ['id']), {}));
  assert.equal(JSON.parse(JSON.stringify(info)).tree.kind, 'scan');
  assert.equal(info.tree.rows, 1000);
});
/** @id TEST-PLAN-005 @verifies REQ-PLAN-005 */
test('TEST-PLAN-005 request parser rejects malformed logical nodes', () => {
  assert.throws(() => parseRequest('{"plan":{"kind":"wat"},"stats":{}}'), /kind/);
  assert.throws(() => parseRequest('not JSON'), /JSON/);
});
/** @id TEST-PLAN-006 @verifies REQ-PLAN-006 */
test('TEST-PLAN-006 CLI supports stdin JSON and failure exit status', () => {
  const main = new URL('../src/main.ts', import.meta.url);
  const ok = spawnSync(process.execPath, [main.pathname, '--json'], { input: JSON.stringify({ plan: scan('u', ['id']), stats: {} }), encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).tree.kind, 'scan');
  const bad = spawnSync(process.execPath, [main.pathname], { input: '{}', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Error/);
});
/** @id TEST-PLAN-007 @verifies REQ-PLAN-007 */
test('TEST-PLAN-007 optimizer obeys explicit rewrite budget', () => {
  assert.throws(() => optimize(scan('u', ['id']), {}, { maxPasses: 0 }), /budget/);
});
/** @id TEST-PLAN-008 @verifies REQ-PLAN-008 */
test('TEST-PLAN-008 repeated optimizer runs are deterministic and immutable', () => {
  const plan = { kind: 'filter' as const, input: scan('u', ['id']), predicate: literal(true) };
  const before = fingerprint(plan);
  assert.deepEqual(optimize(plan, {}), optimize(plan, {}));
  assert.equal(fingerprint(plan), before);
});
