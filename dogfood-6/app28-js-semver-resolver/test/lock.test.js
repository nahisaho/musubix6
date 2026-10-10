import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeLock, parseLock, serializeLock, verifyLock, diffLock, LockError } from '../src/lock.js';

const reg = {
  a: { '1.0.0': { deps: { b: '^1' } }, '2.0.0': {} },
  b: { '1.2.0': {} },
  Z: { '1.0.0': {} },
  '@scope/pkg': { '0.1.0': { deps: { b: '^1' } } },
};
const tree = (...pairs) => new Map(pairs);
const full = () => writeLock(tree(['a', '1.0.0'], ['b', '1.2.0'], ['Z', '1.0.0'], ['@scope/pkg', '0.1.0']), reg, { a: '^1', Z: '*', '@scope/pkg': '^0.1.0' });
const integrity = (n, v) => `sha512-${createHash('sha512').update(`${n}@${v}`).digest('base64')}`;
const kinds = (issues) => issues.map((i) => `${i.kind}:${i.pkg}`);

/** @id TEST-LOCK-001 @verifies REQ-LOCK-001 */
test('TEST-LOCK-001 deterministic', () => {
  const r = { a: '^1' };
  const t1 = writeLock(tree(['a', '1.0.0'], ['b', '1.2.0']), reg, r);
  const t2 = writeLock(tree(['b', '1.2.0'], ['a', '1.0.0']), reg, r);
  assert.equal(t1, t2);
});

/** @id TEST-LOCK-002 @verifies REQ-LOCK-002 */
test('TEST-LOCK-002 sorted by code point', () => {
  assert.deepEqual(Object.keys(JSON.parse(full()).packages), ['@scope/pkg', 'Z', 'a', 'b']);
});

/** @id TEST-LOCK-003 @verifies REQ-LOCK-003 */
test('TEST-LOCK-003 entry shape', () => {
  const e = JSON.parse(full()).packages.a;
  assert.deepEqual(e, {
    dependencies: { b: '1.2.0' },
    integrity: integrity('a', '1.0.0'),
    resolved: 'https://registry.example/a/-/a-1.0.0.tgz',
    version: '1.0.0',
  });
  assert.deepEqual(JSON.parse(full()).root, { '@scope/pkg': '^0.1.0', Z: '*', a: '^1' });
  assert.throws(() => writeLock(tree(['a', '1.0.0']), reg, {}), LockError);
});

/** @id TEST-LOCK-004 @verifies REQ-LOCK-004 */
test('TEST-LOCK-004 formatting', () => {
  const t = full();
  assert.ok(t.endsWith('}\n'));
  assert.ok(!t.endsWith('\n\n'));
  assert.ok(!t.includes('\r'));
  assert.ok(t.startsWith('{\n  "lockfileVersion": 1,\n'));
});

/** @id TEST-LOCK-005 @verifies REQ-LOCK-005 */
test('TEST-LOCK-005 parse errors', () => {
  const good = JSON.parse(full());
  const mut = (f) => { const c = structuredClone(good); f(c); return JSON.stringify(c); };
  for (const bad of ['not json', '[]', 'null', '{}',
    mut((c) => { c.lockfileVersion = 2; }),
    mut((c) => { delete c.packages.a.version; }),
    mut((c) => { c.packages.a.version = 'nope'; }),
    mut((c) => { c.packages.a.integrity = 'md5-xx'; }),
    mut((c) => { c.packages.a.dependencies = []; }),
    mut((c) => { c.root = 'x'; })])
    assert.throws(() => parseLock(bad), LockError, bad.slice(0, 60));
});

/** @id TEST-LOCK-006 @verifies REQ-LOCK-006 */
test('TEST-LOCK-006 roundtrip', () => {
  const t = full();
  assert.equal(serializeLock(parseLock(t)), t);
  const g = JSON.parse(t);
  const shuffled = JSON.stringify({ packages: Object.fromEntries(Object.entries(g.packages).reverse()), root: g.root, lockfileVersion: 1 });
  assert.equal(serializeLock(parseLock(shuffled)), t);
});

/** @id TEST-LOCK-007 @verifies REQ-LOCK-007 */
test('TEST-LOCK-007 dangling', () => {
  const l = JSON.parse(full());
  delete l.packages.b;
  assert.deepEqual(kinds(verifyLock(l)), ['dangling:@scope/pkg', 'dangling:a']);
  const l2 = JSON.parse(full());
  l2.packages.a.dependencies.b = '9.9.9';
  assert.deepEqual(kinds(verifyLock(l2)), ['dangling:a']);
});

/** @id TEST-LOCK-008 @verifies REQ-LOCK-008 */
test('TEST-LOCK-008 extraneous', () => {
  const l = JSON.parse(full());
  l.packages.junk = { version: '1.0.0', resolved: 'x', integrity: integrity('junk', '1.0.0'), dependencies: {} };
  assert.deepEqual(kinds(verifyLock(l)), ['extraneous:junk']);
  assert.deepEqual(verifyLock(JSON.parse(full())), []);
});

/** @id TEST-LOCK-009 @verifies REQ-LOCK-009 */
test('TEST-LOCK-009 root mismatch', () => {
  const l = JSON.parse(full());
  l.root.a = '^2';
  l.root.ghost = '*';
  assert.deepEqual(kinds(verifyLock(l)), ['root-mismatch:a', 'root-mismatch:ghost']);
});

/** @id TEST-LOCK-010 @verifies REQ-LOCK-010 */
test('TEST-LOCK-010 diff', () => {
  const a = parseLock(writeLock(tree(['a', '1.0.0'], ['b', '1.2.0']), reg, { a: '*' }));
  const b = parseLock(writeLock(tree(['a', '2.0.0'], ['Z', '1.0.0']), reg, { a: '*', Z: '*' }));
  assert.deepEqual(diffLock(a, b), {
    added: [{ pkg: 'Z', version: '1.0.0' }],
    removed: [{ pkg: 'b', version: '1.2.0' }],
    changed: [{ pkg: 'a', from: '1.0.0', to: '2.0.0' }],
  });
  assert.deepEqual(diffLock(a, a), { added: [], removed: [], changed: [] });
});

/** @id TEST-LOCK-011 @verifies REQ-LOCK-011 */
test('TEST-LOCK-011 integrity', () => {
  const l = JSON.parse(full());
  l.packages.b.integrity = integrity('b', '1.2.1');
  assert.deepEqual(kinds(verifyLock(l)), ['integrity:b']);
});

/** @id TEST-LOCK-012 @verifies REQ-LOCK-012 */
test('TEST-LOCK-012 integer-like and astral names keep code-point order', () => {
  const names = ['9', '10', '1', '\uFF5Eq', '\u{1F600}x', 'b'];
  const regN = Object.fromEntries(names.map((n) => [n, { '1.0.0': {} }]));
  const text = writeLock(new Map(names.map((n) => [n, '1.0.0'])), regN, Object.fromEntries(names.map((n) => [n, '*'])));
  const want = ['1', '10', '9', 'b', '\uFF5Eq', '\u{1F600}x'];
  const order = (section) => [...text.matchAll(/^ {4}"([^"]+)": \{|^ {4}"([^"]+)": "\*"/gm)].map((m) => m[1] ?? m[2]);
  const keys = order('packages');
  assert.deepEqual(keys.slice(0, want.length), want);
  assert.deepEqual(keys.slice(want.length), want);
  assert.equal(serializeLock(parseLock(text)), text);
  assert.deepEqual(diffLock(parseLock(text), parseLock(text)).added, []);
});
