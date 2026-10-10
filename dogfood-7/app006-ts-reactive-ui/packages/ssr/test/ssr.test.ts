import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from '../src/index.ts';
import { h } from '../../vdom/src/index.ts';
import { signal, effect } from '../../signals/src/index.ts';

/** @id TEST-SSR-001 @verifies REQ-SSR-001 */
test('TEST-SSR-001 deterministic HTML', () => {
  assert.equal(renderToString(h('p', { title: 'x', id: 'a' }, 'hello')), '<p id="a" title="x">hello</p>');
});
/** @id TEST-SSR-002 @verifies REQ-SSR-002 */
test('TEST-SSR-002 text escaping', () => {
  assert.equal(renderToString(h('p', {}, '<&>')), '<p>&lt;&amp;&gt;</p>');
});
/** @id TEST-SSR-003 @verifies REQ-SSR-003 */
test('TEST-SSR-003 attribute escaping', () => {
  assert.equal(renderToString(h('p', { title: '"<&>' })), '<p title="&quot;&lt;&amp;&gt;"></p>');
});
/** @id TEST-SSR-004 @verifies REQ-SSR-004 */
test('TEST-SSR-004 event omission', () => {
  assert.equal(renderToString(h('button', { key: 1, onClick: () => {}, onclick: 'alert(1)' })), '<button></button>');
});
/** @id TEST-SSR-005 @verifies REQ-SSR-005 */
test('TEST-SSR-005 boolean attributes', () => {
  assert.equal(renderToString(h('input', { disabled: true, checked: false })), '<input disabled>');
});
/** @id TEST-SSR-006 @verifies REQ-SSR-006 */
test('TEST-SSR-006 void children', () => {
  assert.throws(() => renderToString(h('img', {}, 'x')), /void/i);
});
/** @id TEST-SSR-007 @verifies REQ-SSR-007 */
test('TEST-SSR-007 styles', () => {
  assert.equal(renderToString(h('p', { style: { marginTop: '2px', color: 'red' } })), '<p style="color:red;margin-top:2px"></p>');
});
/** @id TEST-SSR-008 @verifies REQ-SSR-008 */
test('TEST-SSR-008 unsafe names', () => {
  assert.throws(() => renderToString(h('p><script', {})), /name/i);
  assert.throws(() => renderToString(h('p', { 'x" onclick': 'bad' })), /name/i);
});
/** @id TEST-SSR-009 @verifies REQ-SSR-009 */
test('TEST-SSR-009 URL policy', () => {
  for (const href of ['javascript:alert(1)', ' JaVa\nScRiPt:alert(1)', 'vbscript:x']) {
    assert.throws(() => renderToString(h('a', { href })), /URL/i);
  }
  assert.equal(renderToString(h('a', { href: '/safe' })), '<a href="/safe"></a>');
});
/** @id TEST-SSR-010 @verifies REQ-SSR-010 */
test('TEST-SSR-010 untracked snapshot', () => {
  const s = signal(1); let n = 0;
  const stop = effect(() => { n++; assert.equal(renderToString(() => h('p', {}, s.get())), '<p>1</p>'); });
  s.set(2); assert.equal(n, 1); assert.equal(renderToString(() => h('p', {}, s.get())), '<p>2</p>'); stop();
});
/** @id TEST-SSR-011 @verifies REQ-SSR-011 */
test('TEST-SSR-011 single coercion policy', () => {
  let calls = 0;
  const href = { toString() { return ++calls === 1 ? '/safe' : 'javascript:blocked'; } };
  assert.equal(renderToString(h('a', { href })), '<a href="/safe"></a>'); assert.equal(calls, 1);
  let titleCalls = 0; const title = { toString() { titleCalls++; return 'x'; } };
  assert.equal(renderToString(h('p', { title })), '<p title="x"></p>'); assert.equal(titleCalls, 1);
});
/** @id TEST-SSR-012 @verifies REQ-SSR-012 */
test('TEST-SSR-012 raw text rejection', () => {
  assert.throws(() => renderToString(h('script', {}, 'if (1 < 2) {}')), /raw.text/i);
  assert.throws(() => renderToString(h('style', {}, 'p > b {}')), /raw.text/i);
});
