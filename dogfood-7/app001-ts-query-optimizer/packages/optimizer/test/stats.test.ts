import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, column, literal, compare, and } from '@query/algebra';
import { Catalog, selectivity, estimate, cost } from '../src/stats.ts';

/** @id TEST-STAT-001 @verifies REQ-STAT-001 */
test('TEST-STAT-001 catalog rejects invalid statistics', () => {
  assert.throws(() => new Catalog({ u: { rows: -1, columns: {} } }), /rows/);
});
/** @id TEST-STAT-002 @verifies REQ-STAT-002 */
test('TEST-STAT-002 missing relation statistics use conservative fallback', () => {
  assert.equal(estimate(scan('missing', ['id']), new Catalog({})), 1000);
});
/** @id TEST-STAT-003 @verifies REQ-STAT-003 */
test('TEST-STAT-003 equality accounts for distinct count and null fraction', () => {
  const cat = new Catalog({ u: { rows: 100, columns: { id: { distinct: 10, nullFraction: 0.2 } } } });
  assert.equal(selectivity(compare('eq', column('u.id'), literal(3)), { 'u.id': cat.column('u', 'id') }), 0.08);
});
/** @id TEST-STAT-004 @verifies REQ-STAT-004 */
test('TEST-STAT-004 conjunction uses independence', () => {
  assert.equal(selectivity(and(literal(true), literal(false)), {}), 0);
  assert.equal(selectivity(compare('lt', column('u.id'), literal(9)), {}), 1 / 3);
});
/** @id TEST-STAT-005 @verifies REQ-STAT-005 */
test('TEST-STAT-005 join equality uses maximum distinct cardinality', () => {
  const cat = new Catalog({ u: { rows: 100, columns: { id: { distinct: 100 } } }, v: { rows: 20, columns: { id: { distinct: 10 } } } });
  assert.equal(estimate({ kind: 'join', left: scan('u', ['id']), right: scan('v', ['id']), predicate: compare('eq', column('u.id'), column('v.id')) }, cat), 20);
});
/** @id TEST-STAT-006 @verifies REQ-STAT-006 */
test('TEST-STAT-006 projection does not change cardinality', () => {
  assert.equal(estimate({ kind: 'project', input: scan('u', ['id', 'x']), columns: ['u.id'] }, new Catalog({ u: { rows: 17, columns: {} } })), 17);
});
/** @id TEST-STAT-007 @verifies REQ-STAT-007 */
test('TEST-STAT-007 cost includes child work and output rows', () => {
  const cat = new Catalog({ u: { rows: 10, columns: {} } });
  assert.equal(cost({ kind: 'filter', input: scan('u', ['id']), predicate: literal(true) }, cat), 20);
});
/** @id TEST-STAT-008 @verifies REQ-STAT-008 */
test('TEST-STAT-008 catalog snapshots caller-owned input', () => {
  const data = { u: { rows: 10, columns: { id: { distinct: 5 } } } };
  const cat = new Catalog(data);
  data.u.rows = 999;
  assert.equal(estimate(scan('u', ['id']), cat), 10);
});
/** @id TEST-STAT-009 @verifies REQ-STAT-009 */
test('TEST-STAT-009 explicit null statistics cannot use omitted default', () => {
  for (const invalid of [null, '0', false, -0.1, 1.1]) {
    assert.throws(() => new Catalog(JSON.parse(JSON.stringify({ u: { rows: 10, columns: { id: { distinct: 1, nullFraction: invalid } } } }))), /null fraction/);
  }
});
/** @id TEST-STAT-010 @verifies REQ-STAT-010 */
test('TEST-STAT-010 selective parent recovers oversized intermediate rows', () => {
  const cat = new Catalog({ a: { rows: 1e12, columns: { id: { distinct: 1e12 } } }, b: { rows: 1e12, columns: {} }, empty: { rows: 0, columns: {} } });
  const cross = { kind: 'join' as const, left: scan('a', ['id']), right: scan('b', ['id']), predicate: literal(true) };
  const filtered = { kind: 'filter' as const, input: cross, predicate: compare('eq', column('a.id'), literal(1)) };
  assert.ok(Math.abs(estimate(filtered, cat) / 1e12 - 1) < 1e-12);
  assert.equal(estimate({ kind: 'join', left: cross, right: scan('empty', ['id']), predicate: literal(true) }, cat), 0);
  const names = Array.from({ length: 22 }, (_, i) => `t${i}`);
  const hugeCat = new Catalog(Object.fromEntries(names.map(n => [n, { rows: 1e15, columns: { id: { distinct: 1e15 } } }])));
  let huge: import('@query/algebra').Plan = scan(names[0], ['id']);
  for (const n of names.slice(1)) huge = { kind: 'join', left: huge, right: scan(n, ['id']), predicate: literal(true) };
  for (const n of names) huge = { kind: 'filter', input: huge, predicate: compare('eq', column(`${n}.id`), literal(1)) };
  assert.ok(Math.abs(estimate(huge, hugeCat) - 1) < 1e-10);
  assert.equal(estimate({ kind: 'filter', input: huge, predicate: literal(false) }, hugeCat), 0);
});
/** @id TEST-STAT-011 @verifies REQ-STAT-011 */
test('TEST-STAT-011 combined AND retains tiny nonzero selectivity', () => {
  const names = Array.from({ length: 22 }, (_, i) => `t${i}`);
  const cat = new Catalog(Object.fromEntries(names.map(n => [n, { rows: 1e15, columns: { id: { distinct: 1e15 } } }])));
  let cross: import('@query/algebra').Plan = scan(names[0], ['id']);
  for (const n of names.slice(1)) cross = { kind: 'join', left: cross, right: scan(n, ['id']), predicate: literal(true) };
  const terms = names.map(n => compare('eq', column(`${n}.id`), literal(1)));
  const combined = { kind: 'filter' as const, input: cross, predicate: and(...terms) };
  assert.ok(Math.abs(estimate(combined, cat) - 1) < 1e-10);
  const disjunction = { ...combined, predicate: { kind: 'or' as const, terms: [and(...terms), and(...terms)] } };
  assert.ok(Math.abs(estimate(disjunction, cat) - 2) < 1e-9);
  assert.equal(estimate({ ...combined, predicate: and(...terms, literal(false)) }, cat), 0);
});
/** @id TEST-STAT-012 @verifies REQ-STAT-012 */
test('TEST-STAT-012 positive subnormal probability recovers without quantization', () => {
  const names = Array.from({ length: 22 }, (_, i) => `t${i}`);
  const cat = new Catalog(Object.fromEntries(names.map(n => [n, { rows: 1e15, columns: { id: { distinct: 1e15 }, extra: { distinct: 1e15 }, small: { distinct: 1e8 } } }])));
  let cross: import('@query/algebra').Plan = scan(names[0], ['id', 'extra', 'small']);
  for (const n of names.slice(1, 20)) cross = { kind: 'join', left: cross, right: scan(n, ['id']), predicate: literal(true) };
  const terms = [...names.slice(0, 20).map(n => compare('eq', column(`${n}.id`), literal(1))), compare('eq', column('t0.extra'), literal(1)), compare('eq', column('t0.small'), literal(1))];
  let combined: import('@query/algebra').Plan = { kind: 'filter', input: cross, predicate: and(...terms) };
  let separate: import('@query/algebra').Plan = cross;
  for (const predicate of terms) separate = { kind: 'filter', input: separate, predicate };
  for (const n of names.slice(20)) {
    combined = { kind: 'join', left: combined, right: scan(n, ['id']), predicate: literal(true) };
    separate = { kind: 'join', left: separate, right: scan(n, ['id']), predicate: literal(true) };
  }
  assert.ok(Math.abs(estimate(combined, cat) / estimate(separate, cat) - 1) < 1e-10);
  assert.ok(Math.abs(estimate(combined, cat) / 1e7 - 1) < 1e-10);
});
/** @id TEST-STAT-013 @verifies REQ-STAT-013 */
test('TEST-STAT-013 inherited statistic names get the documented fallback', () => {
  const cat = new Catalog({ u: { rows: 10, columns: {} } });
  assert.deepEqual(cat.column('u', 'constructor'), { distinct: 10, nullFraction: 0 });
  assert.deepEqual(cat.column('constructor', 'id'), { distinct: 10, nullFraction: 0 });
  assert.equal(cat.rows('constructor'), 1000);
  const own = new Catalog({ constructor: { rows: 7, columns: { constructor: { distinct: 2 } } } });
  assert.equal(own.rows('constructor'), 7);
  assert.deepEqual(own.column('constructor', 'constructor'), { distinct: 2 });
});
