import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, column, literal, compare, and, validate, outputColumns, references, fingerprint, execute } from '@query/algebra';

/** @id TEST-ALG-001 @verifies REQ-ALG-001 */
test('TEST-ALG-001 scan constructors retain alias and schema', () => {
  assert.deepEqual(scan('users', ['id'], 'u'), { kind: 'scan', table: 'users', alias: 'u', columns: ['id'] });
});
/** @id TEST-ALG-002 @verifies REQ-ALG-002 */
test('TEST-ALG-002 references collect qualified columns once', () => {
  assert.deepEqual(references(and(compare('eq', column('u.id'), literal(1)), compare('eq', column('u.id'), column('v.id')))), ['u.id', 'v.id']);
});
/** @id TEST-ALG-003 @verifies REQ-ALG-003 */
test('TEST-ALG-003 validate rejects unknown filter columns', () => {
  assert.throws(() => validate({ kind: 'filter', input: scan('u', ['id']), predicate: compare('eq', column('u.nope'), literal(1)) }), /unknown column/);
});
/** @id TEST-ALG-004 @verifies REQ-ALG-004 */
test('TEST-ALG-004 output schema is qualified and respects projection', () => {
  assert.deepEqual(outputColumns({ kind: 'project', input: scan('u', ['id', 'name']), columns: ['u.name'] }), ['u.name']);
});
/** @id TEST-ALG-005 @verifies REQ-ALG-005 */
test('TEST-ALG-005 duplicate aliases fail before joining', () => {
  assert.throws(() => validate({ kind: 'join', left: scan('u', ['id']), right: scan('u', ['id']), predicate: literal(true) }), /duplicate alias/);
});
/** @id TEST-ALG-006 @verifies REQ-ALG-006 */
test('TEST-ALG-006 fingerprints ignore object insertion order', () => {
  assert.equal(fingerprint({ kind: 'filter', input: scan('u', ['id']), predicate: literal(true) }), fingerprint({ predicate: literal(true), input: scan('u', ['id']), kind: 'filter' }));
});
/** @id TEST-ALG-007 @verifies REQ-ALG-007 */
test('TEST-ALG-007 interpreter evaluates equijoins and projection', () => {
  const input = { kind: 'join' as const, left: scan('u', ['id']), right: scan('v', ['id']), predicate: compare('eq', column('u.id'), column('v.id')) };
  assert.deepEqual(execute({ kind: 'project', input, columns: ['u.id'] }, { u: [{ id: 1 }, { id: 2 }], v: [{ id: 2 }] }), [{ 'u.id': 2 }]);
});
/** @id TEST-ALG-008 @verifies REQ-ALG-008 */
test('TEST-ALG-008 interpreter preserves duplicate row multiplicity', () => {
  assert.equal(execute(scan('u', ['id']), { u: [{ id: 1 }, { id: 1 }] }).length, 2);
});
/** @id TEST-ALG-009 @verifies REQ-ALG-009 */
test('TEST-ALG-009 SQL truth table characterization', async () => {
  const { TRUTH_TABLES, evaluate } = await import('../src/index.ts');
  assert.deepEqual(TRUTH_TABLES, {
    and: { TT: true, TF: false, TU: null, FT: false, FF: false, FU: false, UT: null, UF: false, UU: null },
    or: { TT: true, TF: true, TU: true, FT: true, FF: false, FU: null, UT: true, UF: null, UU: null }
  });
  for (const kind of ['and', 'or'] as const) {
    for (const a of [true, false, null]) {
      for (const b of [true, false, null]) {
        const key = ((a === null ? 'U' : a ? 'T' : 'F') + (b === null ? 'U' : b ? 'T' : 'F')) as keyof typeof TRUTH_TABLES.and;
        assert.equal(evaluate({ kind, terms: [literal(a), literal(b)] }, {}), TRUTH_TABLES[kind][key]);
      }
    }
  }
});
/** @id TEST-ALG-010 @verifies REQ-ALG-010 */
test('TEST-ALG-010 inherited object names are not table or row values', () => {
  assert.deepEqual(execute(scan('u', ['constructor']), { u: [{}] }), [{ 'u.constructor': null }]);
  assert.throws(() => execute(scan('constructor', ['id']), {}), /missing table/);
  assert.deepEqual(execute(scan('constructor', ['id']), { constructor: [{ id: 1 }] }), [{ 'constructor.id': 1 }]);
});
