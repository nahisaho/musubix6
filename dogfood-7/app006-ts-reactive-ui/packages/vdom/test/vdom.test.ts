import test from 'node:test';
import assert from 'node:assert/strict';
import { h, text, diff } from '../src/index.ts';

/** @id TEST-VDOM-001 @verifies REQ-VDOM-001 */
test('TEST-VDOM-001 child flattening', () => {
  assert.equal(h('div', {}, ['a', [null, false, h('b', {})]]).children.length, 2);
});
/** @id TEST-VDOM-002 @verifies REQ-VDOM-002 */
test('TEST-VDOM-002 text normalization', () => {
  assert.deepEqual(h('p', {}, 0, 'x').children.map(c => c.value), ['0', 'x']);
});
/** @id TEST-VDOM-003 @verifies REQ-VDOM-003 */
test('TEST-VDOM-003 immutable snapshot', () => {
  const props = { id: 'x', style: { color: 'red' } }; const children = [text('a')]; const v = h('p', props, children);
  props.id = 'y'; props.style.color = 'blue'; children.push(text('b'));
  assert.equal(v.props.id, 'x'); assert.equal((v.props.style as Record<string,string>).color, 'red'); assert.equal(v.children.length, 1);
  assert.ok(Object.isFrozen(v)); assert.ok(Object.isFrozen(v.children)); assert.ok(Object.isFrozen(v.props));
});
/** @id TEST-VDOM-004 @verifies REQ-VDOM-004 */
test('TEST-VDOM-004 text patch', () => {
  assert.deepEqual(diff(text('a'), text('b')), [{ op: 'text', path: [], value: 'b' }]);
});
/** @id TEST-VDOM-005 @verifies REQ-VDOM-005 */
test('TEST-VDOM-005 replace', () => {
  assert.equal(diff(h('p', {}), h('b', {}))[0].op, 'replace');
  assert.equal(diff(h('p', { key: 1 }), h('p', { key: 2 }))[0].op, 'replace');
});
/** @id TEST-VDOM-006 @verifies REQ-VDOM-006 */
test('TEST-VDOM-006 prop delta', () => {
  const patches = diff(h('p', { id: 'a', title: 'old' }), h('p', { id: 'b' }));
  assert.deepEqual(patches[0], { op: 'props', path: [], changes: { id: 'b', title: undefined } });
});
/** @id TEST-VDOM-007 @verifies REQ-VDOM-007 */
test('TEST-VDOM-007 keyed move', () => {
  const a = h('li', { key: 'a' }), b = h('li', { key: 'b' });
  const patches = diff(h('ul', {}, a, b), h('ul', {}, b, a));
  assert.deepEqual(patches.filter(p => p.op === 'move').map(p => [p.from, p.to]), [[1, 0], [0, 1]]);
});
/** @id TEST-VDOM-008 @verifies REQ-VDOM-008 */
test('TEST-VDOM-008 structural edits', () => {
  const patches = diff(h('ul', {}, h('li', { key: 'a' })), h('ul', {}, h('li', { key: 'b' })));
  assert.deepEqual(patches.map(p => p.op), ['insert', 'remove']);
});
/** @id TEST-VDOM-009 @verifies REQ-VDOM-009 */
test('TEST-VDOM-009 duplicates', () => {
  const dup = h('ul', {}, h('li', { key: 'x' }), h('li', { key: 'x' }));
  assert.throws(() => diff(h('ul', {}), dup), /duplicate/i);
  assert.throws(() => diff(dup, h('ul', {})), /duplicate/i);
});
/** @id TEST-VDOM-010 @verifies REQ-VDOM-010 */
test('TEST-VDOM-010 positional reuse', () => {
  const patches = diff(h('ul', {}, h('li', {}, 'a')), h('ul', {}, h('li', {}, 'b')));
  assert.deepEqual(patches, [{ op: 'text', path: [0, 0], value: 'b' }]);
});
/** @id TEST-VDOM-011 @verifies REQ-VDOM-011 */
test('TEST-VDOM-011 NaN key rejection', () => {
  assert.throws(() => h('li', { key: NaN }), /key/i);
  const node = h('li', { key: 0 }); assert.deepEqual(diff(node, node), []);
});
