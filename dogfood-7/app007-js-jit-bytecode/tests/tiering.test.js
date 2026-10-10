import test from 'node:test';
import assert from 'node:assert/strict';
import { TieredEngine, optimize } from '../src/tiering.js';
import { ShapeRegistry } from '../src/caches.js';
import { Heap } from '../src/collection.js';
const sum = { registers: 3, arity: 2, code: [['ADD', 2, 0, 1], ['RETURN', 2]] };
const get = { registers: 2, arity: 1, code: [['GET', 1, 0, 'x'], ['RETURN', 1]] };
const engine = options => new TieredEngine({ baselineThreshold: 2, optimizeThreshold: 3, ...options });
const warm = (e, name, args) => { for (let i = 0; i < 3; i++) e.call(name, args); };
/** @id TEST-OPT-001 @verifies REQ-OPT-001 */
test('TEST-OPT-001 cold function registration', () => {
  const e = engine(); e.define('sum', sum);
  assert.equal(e.info('sum').state, 'cold');
  assert.equal(e.call('sum', [3, 4]), 7);
  assert.throws(() => e.define('bad', { ...sum, code: [['BAD']] }), /invalid/i);
  assert.throws(() => e.call('missing', []), /function/i);
});
/** @id TEST-OPT-002 @verifies REQ-OPT-002 */
test('TEST-OPT-002 lifecycle thresholds', () => {
  const e = engine(); e.define('sum', sum);
  e.call('sum', [1, 2]); assert.equal(e.info('sum').state, 'cold');
  e.call('sum', [1, 2]); assert.equal(e.info('sum').state, 'baseline');
  e.call('sum', [1, 2]); assert.equal(e.info('sum').state, 'optimized');
  assert.equal(e.call('sum', [7, 8]), 15);
  for (const options of [{ baselineThreshold: 0 }, { optimizeThreshold: 1 }, { physicalRegisters: 0 }]) assert.throws(() => engine(options), /threshold|register/i);
});
/** @id TEST-OPT-003 @verifies REQ-OPT-003 */
test('TEST-OPT-003 constant folding with control flow', () => {
  const p = { registers: 3, arity: 0, code: [['CONST', 0, 6], ['CONST', 1, 7], ['MUL', 2, 0, 1], ['RETURN', 2]] };
  assert.deepEqual(optimize(p).code[2], ['CONST', 2, 42]);
  const e = engine(); e.define('answer', p); warm(e, 'answer', []);
  assert.equal(e.call('answer', []), 42);
  assert.equal(e.info('answer').folded, 1);
  const branch = { registers: 3, arity: 1, code: [['JZ', 0, 4], ['CONST', 1, 7], ['JMP', 5], ['JMP', 5], ['CONST', 1, 9], ['ADD', 2, 1, 1], ['RETURN', 2]] };
  e.define('branch', branch); warm(e, 'branch', [true]);
  assert.equal(e.call('branch', [false]), 18);
});
/** @id TEST-OPT-004 @verifies REQ-OPT-004 */
test('TEST-OPT-004 type deoptimization', () => {
  const e = engine(); e.define('sum', sum); warm(e, 'sum', [1, 2]);
  assert.equal(e.call('sum', ['4', 2]), '42');
  assert.equal(e.info('sum').state, 'baseline');
  assert.equal(e.info('sum').deopts, 1);
  assert.match(e.info('sum').lastDeopt, /type/i);
});
/** @id TEST-OPT-005 @verifies REQ-OPT-005 */
test('TEST-OPT-005 shape deoptimization', () => {
  const e = engine(), a = new ShapeRegistry().create({ x: 7 });
  e.define('get', get); warm(e, 'get', [a]); a.set('y', 2);
  assert.equal(e.call('get', [a]), 7);
  assert.equal(e.info('get').deopts, 1);
  assert.match(e.info('get').lastDeopt, /shape/i);
});
/** @id TEST-OPT-006 @verifies REQ-OPT-006 */
test('TEST-OPT-006 effects run exactly once on guard failure', () => {
  const e = engine(), p = { registers: 4, arity: 2, code: [['GET', 2, 0, 'x'], ['ADD', 3, 2, 1], ['SET', 0, 'x', 3], ['GET', 2, 0, 'x'], ['RETURN', 2]] }, a = new ShapeRegistry().create({ x: 0 });
  e.define('inc', p); warm(e, 'inc', [a, 1]);
  a.set('changed', true);
  assert.equal(e.call('inc', [a, 1]), 4);
  assert.equal(a.get('x'), 4);
  assert.equal(e.info('inc').deopts, 1);
});
/** @id TEST-OPT-007 @verifies REQ-OPT-007 */
test('TEST-OPT-007 profile and cache isolation', () => {
  const e = engine(), a = new ShapeRegistry().create({ x: 3, y: 9 });
  e.define('x', get); e.define('y', { ...get, code: [['GET', 1, 0, 'y'], ['RETURN', 1]] });
  warm(e, 'x', [a]);
  assert.equal(e.info('y').calls, 0);
  assert.equal(e.call('y', [a]), 9);
  e.invalidate('x');
  assert.equal(e.info('x').state, 'baseline');
  assert.equal(e.info('x').optimized, false);
});
/** @id TEST-OPT-008 @verifies REQ-OPT-008 */
test('TEST-OPT-008 heap roots and allocation integration', () => {
  const heap = new Heap(4), a = heap.allocate({ x: 42 }), e = engine({ heap, physicalRegisters: 1, onInstruction: () => heap.collect() });
  e.define('get', get); warm(e, 'get', [a]);
  assert.equal(e.call('get', [a]), 42);
  assert.throws(() => e.call('get', [a], { budget: 1 }), /budget/i);
  assert.equal(heap.get(a, 'x'), 42);
  heap.addRoot(a);
  assert.equal(heap.collect().live, 1);
  heap.removeRoot(a);
  assert.equal(heap.collect().live, 0);
  assert.throws(() => e.call('get', [a]), /handle/i);
});
/** @id TEST-OPT-009 @verifies REQ-OPT-009 */
test('TEST-OPT-009 live register handles survive unlink and collection', () => {
  for (const physicalRegisters of [1, 2, 4]) {
    const heap = new Heap(8), e = engine({ heap, physicalRegisters, onInstruction: () => heap.collect() });
    const p = { registers: 5, arity: 2, code: [
      ['GET', 2, 0, 'child'], ['CONST', 3, null], ['SET', 0, 'child', 3],
      ['JZ', 1, 6], ['GET', 4, 2, 'x'], ['RETURN', 4], ['GET', 4, 2, 'y'], ['RETURN', 4]
    ] };
    const parent = heap.allocate({});
    e.define('detach', p);
    for (let i = 0; i < 5; i++) {
      const child = heap.allocate({ x: 42 + i, y: 84 + i }, [parent]);
      heap.set(parent, 'child', child);
      assert.equal(e.call('detach', [parent, i % 2 === 0]), (i % 2 === 0 ? 42 : 84) + i);
    }
    assert.equal(e.info('detach').state, 'optimized');
    assert.equal(heap.collect().live, 0);
  }
  const heap = new Heap(8);
  let explode = false;
  const e = engine({ heap, physicalRegisters: 1, onInstruction: pc => {
    heap.collect();
    if (explode && pc === 4) throw new Error('hook failure');
  } });
  const loop = { registers: 5, arity: 2, code: [
    ['GET', 2, 0, 'child'], ['CONST', 3, null], ['SET', 0, 'child', 3],
    ['CONST', 4, 1], ['JZ', 1, 7], ['SUB', 1, 1, 4], ['JMP', 4],
    ['GET', 3, 2, 'x'], ['RETURN', 3]
  ] };
  const parent = heap.allocate({});
  e.define('loop', loop);
  for (let i = 0; i < 4; i++) {
    heap.set(parent, 'child', heap.allocate({ x: 42 }, [parent]));
    assert.equal(e.call('loop', [parent, 3]), 42);
  }
  heap.set(parent, 'child', heap.allocate({ x: 9 }, [parent]));
  explode = true;
  assert.throws(() => e.call('loop', [parent, 3]), /hook failure/);
  assert.equal(heap.collect().live, 0);
});
/** @id TEST-OPT-010 @verifies REQ-OPT-010 */
test('TEST-OPT-010 sparse arguments have dense undefined semantics in every tier', () => {
  for (const physicalRegisters of [1, 4]) {
    for (const sparseFirst of [false, true]) {
      const e = engine({ physicalRegisters });
      e.define('identity', { registers: 1, arity: 1, code: [['RETURN', 0]] });
      for (let i = 0; i < 6; i++) {
        const args = (i % 2 === 0) === sparseFirst ? new Array(1) : [undefined];
        assert.equal(e.call('identity', args), undefined);
      }
      assert.equal(e.info('identity').state, 'optimized');
      assert.equal(e.info('identity').deopts, 0);
      assert.equal(e.call('identity', [42]), 42);
      assert.equal(e.info('identity').state, 'baseline');
      assert.equal(e.call('identity', new Array(1)), undefined);
    }
  }
});
