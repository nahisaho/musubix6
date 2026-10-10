import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../src/index.ts';

/** @id TEST-COMP-001 @verifies REQ-COMP-001 */
test('TEST-COMP-001 merges root ownership', () => {
  const schema = compose([{name:'a',sdl:'type Query { a: Int }'}, {name:'b',sdl:'type Query { b: String }'}]);
  assert.equal(schema.types.Query.fields.a.owner, 'a');
  assert.equal(schema.types.Query.fields.b.owner, 'b');
});
/** @id TEST-COMP-002 @verifies REQ-COMP-002 */
test('TEST-COMP-002 external fields keep owner', () => {
  const schema = compose([{name:'a',sdl:'type Product @key(fields:"id") { id: ID! name: String }'},
    {name:'b',sdl:'extend type Product @key(fields:"id") { id: ID! @external score: Int }'}]);
  assert.equal(schema.types.Product.fields.id.owner, 'a');
  assert.equal(schema.types.Product.fields.score.owner, 'b');
});
/** @id TEST-COMP-003 @verifies REQ-COMP-003 */
test('TEST-COMP-003 nested compound keys', () => {
  const schema = compose([{name:'a',sdl:'type Org { id: ID! } type Product @key(fields:"sku org { id }") { sku: ID! org: Org }'}]);
  assert.deepEqual(schema.types.Product.keys.a, [{sku:{},org:{id:{}}}]);
});
/** @id TEST-COMP-004 @verifies REQ-COMP-004 */
test('TEST-COMP-004 rejects owner conflict', () => {
  assert.throws(() => compose([{name:'a',sdl:'type Query { x: Int }'},{name:'b',sdl:'type Query { x: Int }'}]), /owner conflict/);
});
/** @id TEST-COMP-005 @verifies REQ-COMP-005 */
test('TEST-COMP-005 rejects type conflict', () => {
  assert.throws(() => compose([{name:'a',sdl:'type Query { x: Int @shareable }'},{name:'b',sdl:'type Query { x: String @shareable }'}]), /type conflict/);
});
/** @id TEST-COMP-006 @verifies REQ-COMP-006 */
test('TEST-COMP-006 rejects invalid key and keyless transitions', () => {
  assert.throws(() => compose([{name:'a',sdl:'type P @key(fields:"missing") { id: ID }'}]), /unknown field/);
  assert.throws(() => compose([{name:'a',sdl:'type P { x: Int }'},{name:'b',sdl:'type P { y: Int }'}]), /no usable key/);
});
/** @id TEST-COMP-007 @verifies REQ-COMP-007 */
test('TEST-COMP-007 rejects requires cycle', () => {
  assert.throws(() => compose([{name:'a',sdl:'type P { x: Int @requires(fields:"y") y: Int @requires(fields:"x") }'}]), /requires cycle/);
});
/** @id TEST-COMP-008 @verifies REQ-COMP-008 */
test('TEST-COMP-008 shareable owner is deterministic', () => {
  const schema = compose([{name:'a',sdl:'type Query { x: Int @shareable }'},{name:'b',sdl:'type Query { x: Int @shareable }'}]);
  assert.equal(schema.types.Query.fields.x.owner, 'a');
});
