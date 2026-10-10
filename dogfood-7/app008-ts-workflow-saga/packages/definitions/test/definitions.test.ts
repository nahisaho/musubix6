import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, digest } from '../src/index.ts';
import type { Definition } from '../src/index.ts';
const definition = (version = 1): Definition => ({
  name: 'checkout', version,
  steps: [{ id: 'charge', kind: 'activity', activity: 'charge', compensation: 'refund',
    retry: { maxAttempts: 3, base: 10, cap: 100 } }]
});
/** @id TEST-DEFINITIONS-001 @verifies REQ-DEFINITIONS-001 */
test('TEST-DEFINITIONS-001 exact lookup', () => {
  const r = new Registry(); r.register(definition());
  assert.deepEqual(r.get('checkout', 1), definition());
});
/** @id TEST-DEFINITIONS-002 @verifies REQ-DEFINITIONS-002 */
test('TEST-DEFINITIONS-002 no version replacement', () => {
  const r = new Registry(); r.register(definition());
  assert.throws(() => r.register(definition()), /exists/i);
});
/** @id TEST-DEFINITIONS-003 @verifies REQ-DEFINITIONS-003 */
test('TEST-DEFINITIONS-003 latest version is numeric maximum', () => {
  const r = new Registry(); r.register(definition(10)); r.register(definition(2));
  assert.equal(r.get('checkout').version, 10);
});
/** @id TEST-DEFINITIONS-004 @verifies REQ-DEFINITIONS-004 */
test('TEST-DEFINITIONS-004 unknown definition rejected', () => {
  const r = new Registry(); r.register(definition());
  assert.throws(() => r.get('missing'), /unknown/i);
  assert.throws(() => r.get('checkout', 2), /unknown/i);
});
/** @id TEST-DEFINITIONS-005 @verifies REQ-DEFINITIONS-005 */
test('TEST-DEFINITIONS-005 owned immutable copies', () => {
  const r = new Registry(); const d = definition(); r.register(d);
  d.steps[0].id = 'mutated'; r.get('checkout').steps[0].id = 'also-mutated';
  assert.equal(r.get('checkout').steps[0].id, 'charge');
});
/** @id TEST-DEFINITIONS-006 @verifies REQ-DEFINITIONS-006 */
test('TEST-DEFINITIONS-006 duplicate ids rejected', () => {
  const d = definition(); d.steps.push({ ...d.steps[0] });
  assert.throws(() => new Registry().register(d), /duplicate/i);
});
/** @id TEST-DEFINITIONS-007 @verifies REQ-DEFINITIONS-007 */
test('TEST-DEFINITIONS-007 public schema rejected', () => {
  for (const d of [{ ...definition(), name: '' }, { ...definition(), version: 0 },
    { ...definition(), version: 1.5 }, { ...definition(), steps: [{ id: 'x', kind: 'random' }] }]) {
    assert.throws(() => new Registry().register(d as Definition), /invalid/i);
  }
});
/** @id TEST-DEFINITIONS-008 @verifies REQ-DEFINITIONS-008 */
test('TEST-DEFINITIONS-008 timer and retry bounds', () => {
  for (const retry of [{ maxAttempts: 0, base: 1, cap: 2 }, { maxAttempts: 2, base: -1, cap: 2 },
    { maxAttempts: 2, base: 3, cap: 2 }]) {
    const d = definition(); (d.steps[0] as Extract<Definition['steps'][number], { kind: 'activity' }>).retry = retry;
    assert.throws(() => new Registry().register(d), /invalid/i);
  }
  assert.throws(() => new Registry().register({ name: 'x', version: 1, steps: [{ id: 't', kind: 'timer', duration: -1 }] }), /invalid/i);
});
/** @id TEST-DEFINITIONS-009 @verifies REQ-DEFINITIONS-009 */
test('TEST-DEFINITIONS-009 canonical digest', () => {
  assert.equal(digest({ b: 2, a: { y: 3, x: 4 } }), digest({ a: { x: 4, y: 3 }, b: 2 }));
});
/** @id TEST-DEFINITIONS-010 @verifies REQ-DEFINITIONS-010 */
test('TEST-DEFINITIONS-010 semantic digest changes', () => {
  assert.notEqual(digest(definition()), digest(definition(2)));
});
