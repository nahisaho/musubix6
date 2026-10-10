import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, explain } from '../src/resolver.js';
import { checkPeers } from '../src/peer.js';

const mkReg = (spec) => {
  const reg = {};
  for (const [name, versions] of Object.entries(spec)) {
    reg[name] = {};
    for (const [v, meta] of Object.entries(versions)) reg[name][v] = meta ?? {};
  }
  return reg;
};
const obj = (r) => Object.fromEntries(r.tree);

/** @id TEST-RSLV-001 @verifies REQ-RSLV-001 */
test('TEST-RSLV-001 picks highest satisfying', () => {
  const reg = mkReg({ a: { '1.0.0': {}, '1.1.0': {}, '2.0.0': {} } });
  assert.deepEqual(obj(resolve({ a: '^1.0.0' }, reg)), { a: '1.1.0' });
  assert.deepEqual(obj(resolve({ a: '*' }, reg)), { a: '2.0.0' });
  assert.equal(resolve({ a: '^1.0.0' }, reg).ok, true);
});

/** @id TEST-RSLV-002 @verifies REQ-RSLV-002 */
test('TEST-RSLV-002 transitive closure once', () => {
  const reg = mkReg({
    app: { '1.0.0': { deps: { x: '^1', y: '^1' } } },
    x: { '1.0.0': { deps: { z: '^1' } } },
    y: { '1.0.0': { deps: { z: '^1' } } },
    z: { '1.0.0': {}, '1.2.0': {} },
    unused: { '1.0.0': {} },
  });
  const r = resolve({ app: '^1' }, reg);
  assert.deepEqual([...r.tree.keys()], ['app', 'x', 'y', 'z']);
  assert.equal(r.tree.get('z'), '1.2.0');
});

/** @id TEST-RSLV-003 @verifies REQ-RSLV-003 */
test('TEST-RSLV-003 intersection of ranges', () => {
  const reg = mkReg({
    x: { '1.0.0': { deps: { z: '>=1.0.0 <2.5.0' } } },
    y: { '1.0.0': { deps: { z: '^2.0.0' } } },
    z: { '1.0.0': {}, '2.0.0': {}, '2.4.0': {}, '2.6.0': {}, '3.0.0': {} },
  });
  assert.equal(resolve({ x: '^1', y: '^1' }, reg).tree.get('z'), '2.4.0');
});

/** @id TEST-RSLV-004 @verifies REQ-RSLV-004 */
test('TEST-RSLV-004 backtracking', () => {
  const reg = mkReg({
    b: { '1.0.0': {}, '2.0.0': {} },
    d: { '1.0.0': { deps: { c: '*' } } },
    c: { '1.0.0': {}, '2.0.0': {}, '3.0.0': {}, '4.0.0': {}, '5.0.0': { deps: { b: '^1' } } },
  });
  const r = resolve({ b: '*', d: '*' }, reg);
  assert.deepEqual(obj(r), { b: '2.0.0', c: '4.0.0', d: '1.0.0' });
  const r2 = resolve({ a: '^1', b: '^1' }, mkReg({
    a: { '1.0.0': { deps: { c: '^1' } }, '1.1.0': { deps: { c: '^2' } } },
    b: { '1.0.0': { deps: { c: '^1' } } },
    c: { '1.0.0': {}, '2.0.0': {} },
  }));
  assert.deepEqual(obj(r2), { a: '1.0.0', b: '1.0.0', c: '1.0.0' });
});

/** @id TEST-RSLV-005 @verifies REQ-RSLV-005 */
test('TEST-RSLV-005 missing package', () => {
  const r = resolve({ ghost: '^1' }, {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
  assert.equal(r.pkg, 'ghost');
  assert.deepEqual(r.constraints, [{ range: '^1', by: 'root' }]);
  const r2 = resolve({ app: '*' }, mkReg({ app: { '1.0.0': { deps: { ghost: '^2' } } } }));
  assert.deepEqual([r2.reason, r2.pkg, r2.constraints[0].by], ['missing', 'ghost', 'app@1.0.0']);
});

const conflictReg = mkReg({
  x: { '1.0.0': { deps: { z: '^1' } } },
  y: { '1.0.0': { deps: { z: '^2' } } },
  z: { '1.0.0': {}, '2.0.0': {} },
});

/** @id TEST-RSLV-006 @verifies REQ-RSLV-006 */
test('TEST-RSLV-006 no candidate', () => {
  const r = resolve({ x: '^1', y: '^1' }, conflictReg);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-candidate');
  assert.equal(r.pkg, 'z');
  assert.deepEqual(r.constraints, [{ range: '^1', by: 'x@1.0.0' }, { range: '^2', by: 'y@1.0.0' }]);
  assert.equal(resolve({ z: '^3' }, conflictReg).reason, 'no-candidate');
});

/** @id TEST-RSLV-007 @verifies REQ-RSLV-007 */
test('TEST-RSLV-007 explain', () => {
  const text = explain(resolve({ x: '^1', y: '^1' }, conflictReg));
  assert.equal(text, ['z@^1 required by x@1.0.0', 'z@^2 required by y@1.0.0', '=> no version of z satisfies all of the above'].join('\n'));
  assert.equal(explain(resolve({ ghost: '^1' }, {})), 'ghost@^1 required by root\n=> ghost is not in the registry');
  assert.equal(explain({ ok: false, reason: 'limit', steps: 7 }), '=> gave up after 7 steps');
  assert.match(explain({ ok: false, reason: 'conflict', pkg: 'b', version: '2.0.0', constraints: [{ range: '^1', by: 'c@5.0.0' }] }),
    /b@\^1 required by c@5.0.0\n=> b@2.0.0 was selected earlier but violates the above/);
  assert.equal(explain({ ok: true, tree: new Map() }), '');
});

/** @id TEST-RSLV-008 @verifies REQ-RSLV-008 */
test('TEST-RSLV-008 cycles', () => {
  const reg = mkReg({
    a: { '1.0.0': { deps: { b: '^1' } } },
    b: { '1.0.0': { deps: { a: '^1', c: '^1' } } },
    c: { '1.0.0': { deps: { c: '^1' } } },
  });
  assert.deepEqual(obj(resolve({ a: '^1' }, reg)), { a: '1.0.0', b: '1.0.0', c: '1.0.0' });
});

/** @id TEST-RSLV-009 @verifies REQ-RSLV-009 */
test('TEST-RSLV-009 prerelease exclusion', () => {
  const reg = mkReg({ z: { '1.0.0': {}, '1.1.0-beta.1': {} } });
  assert.equal(resolve({ z: '^1' }, reg).tree.get('z'), '1.0.0');
  assert.equal(resolve({ z: '^1.1.0-beta.0' }, reg).tree.get('z'), '1.1.0-beta.1');
  assert.equal(resolve({ z: '*' }, mkReg({ z: { '1.0.0-rc.1': {} } })).reason, 'no-candidate');
});

/** @id TEST-RSLV-010 @verifies REQ-RSLV-010 */
test('TEST-RSLV-010 registry order independence', () => {
  const spec = {
    app: { '1.0.0': { deps: { x: '*', y: '*' } } },
    x: { '2.0.0': { deps: { z: '^1' } }, '1.0.0': { deps: { z: '^2' } } },
    y: { '1.0.0': { deps: { z: '^2' } } },
    z: { '1.0.0': {}, '2.0.0': {} },
  };
  const rev = {};
  for (const k of Object.keys(spec).reverse()) {
    rev[k] = {};
    for (const v of Object.keys(spec[k]).reverse()) rev[k][v] = spec[k][v];
  }
  const a = resolve({ app: '*' }, spec);
  const b = resolve({ app: '*' }, rev);
  assert.deepEqual([...a.tree], [...b.tree]);
  assert.deepEqual(obj(a), { app: '1.0.0', x: '1.0.0', y: '1.0.0', z: '2.0.0' });
});

/** @id TEST-RSLV-011 @verifies REQ-RSLV-011 */
test('TEST-RSLV-011 prefer lowest', () => {
  const reg = mkReg({ a: { '1.0.0': { deps: { b: '^1' } }, '1.5.0': {} }, b: { '1.0.0': {}, '1.9.0': {} } });
  assert.deepEqual(obj(resolve({ a: '^1' }, reg, { prefer: 'lowest' })), { a: '1.0.0', b: '1.0.0' });
});

/** @id TEST-RSLV-012 @verifies REQ-RSLV-012 */
test('TEST-RSLV-012 step limit', () => {
  const reg = mkReg({ a: { '1.0.0': { deps: { b: '^1' } } }, b: { '1.0.0': {} } });
  assert.equal(resolve({ a: '*' }, reg, { maxSteps: 100 }).ok, true);
  const r = resolve({ a: '*' }, reg, { maxSteps: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'limit');
});

/** @id TEST-RSLV-013 @verifies REQ-RSLV-013 */
test('TEST-RSLV-013 peers', () => {
  const reg = mkReg({
    host: { '1.0.0': { peerDeps: { react: '^17', lodash: '>=4' }, peerMeta: { lodash: { optional: true } } } },
    react: { '16.0.0': {}, '17.0.2': {}, '18.0.0': {} },
    lodash: { '3.10.1': {}, '4.17.0': {} },
  });
  const r = resolve({ host: '^1' }, reg);
  assert.deepEqual(obj(r), { host: '1.0.0', react: '17.0.2' });
  assert.deepEqual(checkPeers(r.tree, reg), []);
  assert.equal(resolve({ host: '^1', lodash: '^4' }, reg).tree.get('lodash'), '4.17.0');
  const bad = resolve({ host: '^1', lodash: '^3' }, reg);
  assert.equal(bad.ok, false);
  assert.equal(bad.pkg, 'lodash');
  assert.deepEqual(bad.constraints.map((c) => c.by), ['host@1.0.0', 'root']);
});
