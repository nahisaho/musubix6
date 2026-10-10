import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeRegistry, InlineCache } from '../src/caches.js';
/** @id TEST-IC-001 @verifies REQ-IC-001 */
test('TEST-IC-001 shape interning', () => {
  const r = new ShapeRegistry(), a = r.create({ x: 1, y: 2 }), b = r.create({ x: 3, y: 4 });
  assert.equal(a.shape, b.shape);
  assert.notEqual(a.shape, r.create({ y: 2, x: 1 }).shape);
});
/** @id TEST-IC-002 @verifies REQ-IC-002 */
test('TEST-IC-002 shape transitions', () => {
  const a = new ShapeRegistry().create({ x: 1 }), old = a.shape;
  a.set('x', 4);
  assert.equal(a.shape, old);
  a.set('y', 8);
  assert.notEqual(a.shape, old);
  assert.equal(a.get('x'), 4);
  assert.equal(a.get('y'), 8);
});
/** @id TEST-IC-003 @verifies REQ-IC-003 */
test('TEST-IC-003 monomorphic hit', () => {
  const c = new InlineCache(), a = new ShapeRegistry().create({ x: 7 });
  assert.equal(c.get('s', a, 'x'), 7);
  assert.equal(c.get('s', a, 'x'), 7);
  assert.deepEqual(c.stats('s', 'x'), { state: 'monomorphic', hits: 1, misses: 1, shapes: 1 });
});
/** @id TEST-IC-004 @verifies REQ-IC-004 */
test('TEST-IC-004 polymorphic dispatch', () => {
  const c = new InlineCache(2), r = new ShapeRegistry(), a = r.create({ x: 1 }), b = r.create({ y: 0, x: 2 });
  assert.equal(c.get(0, a, 'x'), 1);
  assert.equal(c.get(0, b, 'x'), 2);
  assert.equal(c.get(0, a, 'x'), 1);
  assert.equal(c.stats(0, 'x').state, 'polymorphic');
});
/** @id TEST-IC-005 @verifies REQ-IC-005 */
test('TEST-IC-005 megamorphic absorbing state', () => {
  const c = new InlineCache(1), r = new ShapeRegistry(), a = r.create({ x: 1 }), b = r.create({ y: 0, x: 2 });
  c.get(0, a, 'x');
  assert.equal(c.get(0, b, 'x'), 2);
  assert.equal(c.get(0, a, 'x'), 1);
  assert.equal(c.stats(0, 'x').state, 'megamorphic');
});
/** @id TEST-IC-006 @verifies REQ-IC-006 */
test('TEST-IC-006 refreshed shape guard', () => {
  const c = new InlineCache(), a = new ShapeRegistry().create({ x: 1 });
  c.get('s', a, 'x'); c.set('w', a, 'z', 3); c.set('w', a, 'x', 9);
  assert.equal(c.get('s', a, 'x'), 9);
  assert.equal(c.stats('s', 'x').misses, 2);
});
/** @id TEST-IC-007 @verifies REQ-IC-007 */
test('TEST-IC-007 negative lookup invalidation', () => {
  const c = new InlineCache(), a = new ShapeRegistry().create({});
  assert.equal(c.get(0, a, 'x'), undefined);
  a.set('x', 5);
  assert.equal(c.get(0, a, 'x'), 5);
});
/** @id TEST-IC-008 @verifies REQ-IC-008 */
test('TEST-IC-008 invalid input is atomic', () => {
  for (const limit of [0, -1, Infinity, 1.2]) assert.throws(() => new InlineCache(limit), /limit/i);
  const c = new InlineCache(), a = new ShapeRegistry().create({ x: 1 });
  assert.throws(() => c.get(0, {}, 'x'), /object/i);
  assert.throws(() => c.set(0, a, 99, 2), /property/i);
  assert.equal(a.get('x'), 1);
  assert.equal(c.stats(0, 'x').state, 'empty');
});
