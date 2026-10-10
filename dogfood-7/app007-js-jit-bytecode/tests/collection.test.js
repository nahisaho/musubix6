import test from 'node:test';
import assert from 'node:assert/strict';
import { Heap } from '../src/collection.js';
/** @id TEST-GC-001 @verifies REQ-GC-001 */
test('TEST-GC-001 allocation handles', () => {
  const h = new Heap(8), a = h.allocate({ x: 7 });
  assert.equal(Object.isFrozen(a), true);
  assert.equal(h.get(a, 'x'), 7);
  assert.equal(h.address(a), 0);
});
/** @id TEST-GC-002 @verifies REQ-GC-002 */
test('TEST-GC-002 transitive marking', () => {
  const h = new Heap(8), leaf = h.allocate({ x: 1 }), root = h.allocate({ child: leaf }), garbage = h.allocate({});
  assert.equal(h.collect([root]).live, 2);
  assert.equal(h.get(h.get(root, 'child'), 'x'), 1);
  assert.throws(() => h.get(garbage, 'x'), /handle/i);
});
/** @id TEST-GC-003 @verifies REQ-GC-003 */
test('TEST-GC-003 compact stable handles', () => {
  const h = new Heap(8);
  h.allocate({ garbage: 1 });
  const a = h.allocate({ x: 7 }), b = h.allocate({ child: a });
  const old = h.address(a);
  h.collect([b]);
  assert.equal(h.address(a), 0);
  assert.notEqual(old, h.address(a));
  assert.equal(h.get(b, 'child'), a);
});
/** @id TEST-GC-004 @verifies REQ-GC-004 */
test('TEST-GC-004 iterative cyclic marking', () => {
  const h = new Heap(15000), a = h.allocate({}), b = h.allocate({ child: a });
  h.set(a, 'child', b);
  assert.equal(h.collect([a]).live, 2);
  assert.equal(h.collect([]).reclaimed, 2);
  let root = h.allocate({});
  for (let i = 0; i < 12000; i++) root = h.allocate({ child: root });
  assert.equal(h.collect([root]).live, 12001);
});
/** @id TEST-GC-005 @verifies REQ-GC-005 */
test('TEST-GC-005 allocation pressure and new edges', () => {
  const h = new Heap(2), a = h.allocate({ x: 1 });
  h.allocate({ garbage: true });
  const b = h.allocate({ child: a });
  assert.equal(h.get(h.get(b, 'child'), 'x'), 1);
  assert.throws(() => h.allocate({}, [b]), /OutOfMemory/);
});
/** @id TEST-GC-006 @verifies REQ-GC-006 */
test('TEST-GC-006 invalid handles', () => {
  const h = new Heap(4), a = h.allocate({}), other = new Heap(4).allocate({});
  assert.throws(() => h.get(other, 'x'), /handle/i);
  assert.throws(() => h.get({ id: a.id }, 'x'), /handle/i);
  assert.throws(() => h.set(a, 'next', other), /handle/i);
  assert.equal(h.get(a, 'next'), undefined);
  assert.throws(() => h.addRoot(other), /handle/i);
  assert.throws(() => h.collect([other]), /handle/i);
  assert.equal(h.address(a), 0);
  h.collect([]);
  assert.throws(() => h.get(a, 'x'), /handle/i);
  assert.throws(() => h.allocate({ bad: other }), /handle/i);
});
/** @id TEST-GC-007 @verifies REQ-GC-007 */
test('TEST-GC-007 changed graph and explicit roots', () => {
  const h = new Heap(4), a = h.allocate({}), b = h.allocate({});
  h.addRoot(a); h.set(a, 'next', b);
  assert.equal(h.collect().live, 2);
  h.set(a, 'next', null);
  assert.equal(h.collect().live, 1);
  h.removeRoot(a);
  assert.equal(h.collect().live, 0);
});
/** @id TEST-GC-008 @verifies REQ-GC-008 */
test('TEST-GC-008 collection accounting', () => {
  const h = new Heap(4);
  h.allocate({});
  const a = h.allocate({});
  assert.deepEqual(h.collect([a]), { marked: 1, reclaimed: 1, moved: 1, live: 1 });
  assert.deepEqual(h.collect([a]), { marked: 1, reclaimed: 0, moved: 0, live: 1 });
  assert.throws(() => new Heap(0), /capacity/i);
  const full = new Heap(1), live = full.allocate({ x: 7 }), foreign = new Heap(1).allocate({});
  assert.throws(() => full.allocate({ bad: foreign }), /handle/i);
  assert.equal(full.get(live, 'x'), 7);
});
