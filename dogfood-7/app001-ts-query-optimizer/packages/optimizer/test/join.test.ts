import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, column, literal, compare, execute, fingerprint, type Plan } from '@query/algebra';
import { Catalog, cost } from '../src/stats.ts';
import { reorder } from '../src/join.ts';

/** @id TEST-JOIN-001 @verifies REQ-JOIN-001 */
test('TEST-JOIN-001 empty join graph is rejected', () => {
  assert.throws(() => reorder([], [], new Catalog({})), /empty/);
});
/** @id TEST-JOIN-002 @verifies REQ-JOIN-002 */
test('TEST-JOIN-002 singleton returns the original relation', () => {
  assert.deepEqual(reorder([scan('u', ['id'])], [], new Catalog({})).plan, scan('u', ['id']));
});
/** @id TEST-JOIN-003 @verifies REQ-JOIN-003 */
test('TEST-JOIN-003 every equijoin condition is retained', () => {
  const rels = ['a', 'b', 'c'].map(n => scan(n, ['id']));
  const preds = [compare('eq', column('a.id'), column('b.id')), compare('eq', column('b.id'), column('c.id'))];
  const result = reorder(rels, preds, new Catalog({}));
  assert.equal(JSON.stringify(result.plan).split('"op":"eq"').length - 1, 2);
  assert.deepEqual(execute(result.plan, { a: [{ id: 1 }], b: [{ id: 1 }, { id: 2 }], c: [{ id: 1 }] }), [{ 'a.id': 1, 'b.id': 1, 'c.id': 1 }]);
});
/** @id TEST-JOIN-004 @verifies REQ-JOIN-004 */
test('TEST-JOIN-004 DP equals exhaustive bushy enumeration minimum', () => {
  const rels = ['a', 'b', 'c', 'd'].map(n => scan(n, ['id']));
  const cat = new Catalog(Object.fromEntries([1000, 2, 40, 3].map((rows, i) => [rels[i].table, { rows, columns: {} }])));
  const trees = (items: typeof rels): Plan[] => {
    if (items.length === 1) return items;
    const out: Plan[] = [];
    for (let mask = 1; mask < (1 << items.length) - 1; mask++) {
      for (const left of trees(items.filter((_, i) => mask & (1 << i)))) {
        for (const right of trees(items.filter((_, i) => !(mask & (1 << i))))) out.push({ kind: 'join', left, right, predicate: literal(true) });
      }
    }
    return out;
  };
  assert.equal(reorder(rels, [], cat).cost, Math.min(...trees(rels).map(p => cost(p, cat))));
});
/** @id TEST-JOIN-005 @verifies REQ-JOIN-005 */
test('TEST-JOIN-005 deterministic tie breaks ignore relation input order', () => {
  const rels = ['c', 'a', 'b'].map(n => scan(n, ['id']));
  assert.equal(fingerprint(reorder(rels, [], new Catalog({})).plan), fingerprint(reorder([...rels].reverse(), [], new Catalog({})).plan));
});
/** @id TEST-JOIN-006 @verifies REQ-JOIN-006 */
test('TEST-JOIN-006 relation limit protects exponential search', () => {
  assert.throws(() => reorder(Array.from({ length: 13 }, (_, i) => scan(`t${i}`, ['id'])), [], new Catalog({})), /limit/);
});
/** @id TEST-JOIN-007 @verifies REQ-JOIN-007 */
test('TEST-JOIN-007 disconnected graphs get explicit cross joins', () => {
  const result = reorder([scan('a', ['id']), scan('b', ['id'])], [], new Catalog({}));
  assert.deepEqual(result.plan.kind === 'join' && result.plan.predicate, literal(true));
});
/** @id TEST-JOIN-008 @verifies REQ-JOIN-008 */
test('TEST-JOIN-008 malformed edge endpoints are rejected', () => {
  assert.throws(() => reorder([scan('a', ['id']), scan('b', ['id'])], [compare('eq', column('a.id'), column('z.id'))], new Catalog({})), /unknown column/);
});
