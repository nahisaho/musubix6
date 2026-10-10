import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, memoryHost, domHost } from '../src/index.ts';
import { parseHTML } from 'linkedom';
import { signal } from '../../signals/src/index.ts';
import { createScheduler } from '../../scheduler/src/index.ts';
import { h } from '../../vdom/src/index.ts';
import { renderToString } from '../../ssr/src/index.ts';

/** @id TEST-RUNTIME-001 @verifies REQ-RUNTIME-001 */
test('TEST-RUNTIME-001 mount', () => {
  const host = memoryHost(); const m = mount(() => h('p', {}, 'hi'), host); assert.equal(host.html(), '<p>hi</p>'); m.dispose();
});
/** @id TEST-RUNTIME-002 @verifies REQ-RUNTIME-002 */
test('TEST-RUNTIME-002 coalesced updates', () => {
  const s = signal(0), scheduler = createScheduler(), host = memoryHost();
  const m = mount(() => h('p', {}, s.get()), host, scheduler); s.set(1); s.set(2);
  assert.equal(host.html(), '<p>0</p>'); assert.equal(scheduler.pending, 1); scheduler.flush(); assert.equal(host.html(), '<p>2</p>'); m.dispose();
});
/** @id TEST-RUNTIME-003 @verifies REQ-RUNTIME-003 */
test('TEST-RUNTIME-003 keyed identity', () => {
  const order = signal(['a', 'b']); const host = memoryHost(), scheduler = createScheduler();
  const m = mount(() => h('ul', {}, order.get().map(key => h('li', { key }, key))), host, scheduler);
  const first = host.root!.children[0], second = host.root!.children[1]; order.set(['b', 'a']); scheduler.flush();
  assert.equal(host.root!.children[0], second); assert.equal(host.root!.children[1], first); m.dispose();
});
/** @id TEST-RUNTIME-004 @verifies REQ-RUNTIME-004 */
test('TEST-RUNTIME-004 type replacement', () => {
  const tag = signal('p'), host = memoryHost(), scheduler = createScheduler();
  const m = mount(() => h(tag.get(), {}, 'x'), host, scheduler); const old = host.root;
  tag.set('b'); scheduler.flush(); assert.notEqual(host.root, old); assert.equal(host.html(), '<b>x</b>'); m.dispose();
});
/** @id TEST-RUNTIME-005 @verifies REQ-RUNTIME-005 */
test('TEST-RUNTIME-005 in-place changes', () => {
  const s = signal(1), host = memoryHost(), scheduler = createScheduler();
  const m = mount(() => h('p', { id: String(s.get()) }, s.get()), host, scheduler); const old = host.root, textNode = old!.children[0];
  s.set(2); scheduler.flush(); assert.equal(host.root, old); assert.equal(host.root!.children[0], textNode);
  assert.equal(host.html(), '<p id="2">2</p>'); m.dispose();
});
/** @id TEST-RUNTIME-006 @verifies REQ-RUNTIME-006 */
test('TEST-RUNTIME-006 disposal cancels', () => {
  const s = signal(1), host = memoryHost(), scheduler = createScheduler();
  const m = mount(() => h('p', {}, s.get()), host, scheduler); s.set(2); m.dispose(); m.dispose(); scheduler.flush();
  assert.equal(host.root, null); assert.equal(scheduler.pending, 0); s.set(3); assert.equal(scheduler.pending, 0);
});
/** @id TEST-RUNTIME-007 @verifies REQ-RUNTIME-007 */
test('TEST-RUNTIME-007 listener cleanup', () => {
  const visible = signal(true), host = memoryHost(), scheduler = createScheduler(); const click = () => {};
  const m = mount(() => h('div', {}, visible.get() ? h('button', { onClick: click }) : null), host, scheduler);
  const button = host.root!.children[0]; assert.equal(button.listeners.size, 1);
  visible.set(false); scheduler.flush(); assert.equal(button.listeners.size, 0); m.dispose();
});
/** @id TEST-RUNTIME-008 @verifies REQ-RUNTIME-008 */
test('TEST-RUNTIME-008 shared scheduler', () => {
  const s = signal(0), scheduler = createScheduler(), a = memoryHost(), b = memoryHost();
  const ma = mount(() => h('p', {}, s.get()), a, scheduler), mb = mount(() => h('b', {}, s.get()), b, scheduler);
  s.set(2); assert.equal(scheduler.pending, 2); scheduler.flush();
  assert.equal(a.html(), '<p>2</p>'); assert.equal(b.html(), '<b>2</b>'); ma.dispose(); mb.dispose();
});
/** @id TEST-RUNTIME-009 @verifies REQ-RUNTIME-009 */
test('TEST-RUNTIME-009 failed render recovery', () => {
  const s = signal(0), host = memoryHost(), scheduler = createScheduler();
  const m = mount(() => { if (s.get() === 1) throw new Error('view failed'); return h('p', {}, s.get()); }, host, scheduler);
  s.set(1); assert.throws(() => scheduler.flush(), AggregateError); assert.equal(host.html(), '<p>0</p>');
  s.set(2); scheduler.flush(); assert.equal(host.html(), '<p>2</p>'); m.dispose();
});
/** @id TEST-RUNTIME-010 @verifies REQ-RUNTIME-010 */
test('TEST-RUNTIME-010 SSR parity', () => {
  const s = signal(0), host = memoryHost(), scheduler = createScheduler(); const view = () => h('button', { disabled: s.get() > 0 }, s.get());
  const snapshot = renderToString(view); const m = mount(view, host, scheduler); assert.equal(host.html(), snapshot);
  s.set(1); scheduler.flush(); assert.equal(host.html(), renderToString(view)); m.dispose();
});
/** @id TEST-RUNTIME-011 @verifies REQ-RUNTIME-011 REQ-RUNTIME-009 */
test('TEST-RUNTIME-011 preflight preserves committed state', () => {
  const state = signal(0), host = memoryHost(), scheduler = createScheduler(), click = () => {};
  const view = () => h('div', { id: String(state.get()) }, h('button', { onClick: click }, state.get()),
    state.get() === 1 ? h('bad<tag', {}) : null);
  const m = mount(view, host, scheduler); const root = host.root!, button = root.children[0], child = button.children[0];
  state.set(1); assert.throws(() => scheduler.flush(), AggregateError);
  assert.equal(host.root, root); assert.equal(root.props.id, '0'); assert.equal(root.children.length, 1);
  assert.equal(root.children[0], button); assert.equal(button.children[0], child); assert.equal(button.listeners.get('click'), click);
  assert.equal(host.html(), '<div id="0"><button>0</button></div>');
  state.set(2); scheduler.flush(); assert.equal(host.html(), '<div id="2"><button>2</button></div>'); m.dispose();
});
/** @id TEST-RUNTIME-012 @verifies REQ-RUNTIME-012 */
test('TEST-RUNTIME-012 DOM single coercion policy', () => {
  const { document } = parseHTML('<div id="app"></div>');
  const host = domHost(document.querySelector('#app')! as unknown as Element);
  let calls = 0; const href = { toString() { return ++calls === 1 ? '/safe' : 'javascript:blocked'; } };
  const node = host.create(h('a', { href })) as Element;
  assert.equal(node.getAttribute('href'), '/safe'); assert.equal(calls, 1);
  let updateCalls = 0;
  host.update(node, h('a', { href: { toString() { return ++updateCalls === 1 ? '/updated' : 'javascript:blocked'; } } }));
  assert.equal(node.getAttribute('href'), '/updated'); assert.equal(updateCalls, 1);
  let badCalls = 0;
  assert.throws(() => host.update(node, h('a', { href: { toString() { badCalls++; return 'javascript:blocked'; } } })), /URL/i);
  assert.equal(node.getAttribute('href'), '/updated'); assert.equal(badCalls, 1);
});
/** @id TEST-RUNTIME-013 @verifies REQ-RUNTIME-013 */
test('TEST-RUNTIME-013 real DOM identity and listener lifecycle', () => {
  const { document, Event } = parseHTML('<div id="app"></div>');
  const container = document.querySelector('#app')!; const host = domHost(container as unknown as Element);
  const order = signal(['a', 'b']), scheduler = createScheduler(); let clicks = 0;
  const m = mount(() => h('ul', {}, order.get().map(key => h('li', { key }, h('button', { onClick: () => { clicks++; } }, key)))), host, scheduler);
  const a = container.querySelectorAll('li')[0], b = container.querySelectorAll('li')[1], button = a.querySelector('button')!;
  button.dispatchEvent(new Event('click')); assert.equal(clicks, 1);
  order.set(['b', 'a']); scheduler.flush();
  assert.equal(container.querySelectorAll('li')[0], b); assert.equal(container.querySelectorAll('li')[1], a);
  order.set(['b']); scheduler.flush(); button.dispatchEvent(new Event('click')); assert.equal(clicks, 1);
  const remaining = b.querySelector('button')!; m.dispose(); remaining.dispatchEvent(new Event('click'));
  assert.equal(clicks, 1); assert.equal(container.innerHTML, '');
});
