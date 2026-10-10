import test from 'node:test';
import assert from 'node:assert/strict';
import { VM, validate } from '../src/bytecode.js';
import { ShapeRegistry } from '../src/caches.js';
const program = (code, registers = 5, arity = 0) => ({ code, registers, arity });
/** @id TEST-BC-001 @verifies REQ-BC-001 */
test('TEST-BC-001 constants and returns', () => {
  assert.equal(new VM().run(program([['CONST', 0, 42], ['RETURN', 0]])), 42);
});
/** @id TEST-BC-002 @verifies REQ-BC-002 */
test('TEST-BC-002 arithmetic and moves', () => {
  assert.equal(new VM().run(program([['ADD', 2, 0, 1], ['SUB', 3, 2, 1], ['MUL', 3, 3, 1], ['MOV', 4, 3], ['RETURN', 4]], 5, 2), [7, 3]), 21);
  assert.equal(new VM().run(program([['LT', 2, 0, 1], ['RETURN', 2]], 3, 2), [7, 3]), false);
  assert.equal(new VM().run(program([['ADD', 2, 0, 1], ['RETURN', 2]], 3, 2), ['7', 3]), '73');
});
/** @id TEST-BC-003 @verifies REQ-BC-003 */
test('TEST-BC-003 absolute branches', () => {
  const p = program([['JZ', 0, 3], ['CONST', 1, 11], ['JMP', 4], ['CONST', 1, 22], ['RETURN', 1]], 2, 1);
  assert.equal(new VM().run(p, [true]), 11);
  assert.equal(new VM().run(p, [0]), 22);
});
/** @id TEST-BC-004 @verifies REQ-BC-004 */
test('TEST-BC-004 malformed instructions', () => {
  for (const code of [[['BOOM']], [['CONST', 9, 1]], [['JMP', 99]], [['ADD', 0, 1]], [['CONST', 0, 1], ['RETURN', 0, 7]]]) {
    assert.throws(() => validate(program(code)), /invalid/i);
  }
  assert.throws(() => validate(program([['CONST', 0, 1]])), /fallthrough/i);
  assert.throws(() => new VM().run(program([['RETURN', 0]], 1, 1), []), /arity/i);
  for (const bad of [
    program([['CONST', -1, 7]]), program([['CONST', 0.5, 7]]),
    program([['CONST', 0, {}]]), program([['GET', 1, 0, 9]], 2, 1),
    program([['RETURN', 0]], 0), program([['RETURN', 0]], 1, 2)
  ]) assert.throws(() => validate(bad), /invalid/i);
});
/** @id TEST-BC-005 @verifies REQ-BC-005 */
test('TEST-BC-005 definite initialization at joins', () => {
  assert.throws(() => validate(program([['JZ', 0, 2], ['CONST', 1, 4], ['RETURN', 1]], 2, 1)), /uninitialized/i);
  assert.throws(() => validate(program([['MOV', 0, 1], ['RETURN', 0]], 2)), /uninitialized/i);
  assert.equal(validate(program([['JMP', 2], ['RETURN', 4], ['CONST', 0, 7], ['RETURN', 0]])), true);
});
/** @id TEST-BC-006 @verifies REQ-BC-006 */
test('TEST-BC-006 bounded execution', () => {
  assert.throws(() => new VM().run(program([['JMP', 0]]), [], { budget: 12 }), /budget/i);
  for (const budget of [0, -1, Infinity, 1.2]) assert.throws(() => new VM().run(program([['CONST', 0, 1], ['RETURN', 0]]), [], { budget }), /budget/i);
});
/** @id TEST-BC-007 @verifies REQ-BC-007 */
test('TEST-BC-007 cache integration', () => {
  const calls = [];
  const cache = { get(site, obj, key) { calls.push(site); return obj[key]; }, set(site, obj, key, value) { calls.push(site); obj[key] = value; } };
  const obj = { x: 1 };
  assert.equal(new VM().run(program([['SET', 0, 'x', 1], ['GET', 2, 0, 'x'], ['RETURN', 2]], 3, 2), [obj, 9], { cache }), 9);
  assert.deepEqual(calls, [0, 1]);
});
/** @id TEST-BC-008 @verifies REQ-BC-008 */
test('TEST-BC-008 invocation isolation', () => {
  const p = program([['ADD', 2, 0, 1], ['RETURN', 2]], 3, 2), before = structuredClone(p), vm = new VM();
  assert.equal(vm.run(p, [2, 4]), 6);
  assert.equal(vm.run(p, [10, 3]), 13);
  assert.deepEqual(p, before);
});
/** @id TEST-BC-009 @verifies REQ-BC-009 */
test('TEST-BC-009 ordinary get/set method names are not protocols', () => {
  let effects = 0;
  const obj = { x: 42, get() { effects++; return -1; }, set() { effects++; } };
  const vm = new VM();
  assert.equal(vm.run(program([['GET', 1, 0, 'x'], ['RETURN', 1]], 2, 1), [obj]), 42);
  assert.equal(vm.run(program([['SET', 0, 'x', 1], ['GET', 2, 0, 'x'], ['RETURN', 2]], 3, 2), [obj, 7]), 7);
  assert.equal(effects, 0);
  const shaped = new ShapeRegistry().create({ x: 9 });
  assert.equal(vm.run(program([['GET', 1, 0, 'x'], ['RETURN', 1]], 2, 1), [shaped]), 9);
  assert.equal(vm.run(program([['SET', 0, 'x', 1], ['GET', 2, 0, 'x'], ['RETURN', 2]], 3, 2), [shaped, 11]), 11);
  assert.equal(shaped.get('x'), 11);
});
