import test from 'node:test';
import assert from 'node:assert/strict';
import { peerRequirements, checkPeers, formatViolation } from '../src/peer.js';

const reg = {
  host: { '1.0.0': { peerDeps: { react: '^16 || ^17', lodash: '>=4' }, peerMeta: { lodash: { optional: true } } } },
  plug: { '2.0.0': { peerDeps: { host: '^1.0.0' } } },
  bare: { '1.0.0': {} },
};

/** @id TEST-PEER-001 @verifies REQ-PEER-001 */
test('TEST-PEER-001 split required/optional', () => {
  const r = peerRequirements(reg.host['1.0.0']);
  assert.deepEqual(r.required, { react: '^16 || ^17' });
  assert.deepEqual(r.optional, { lodash: '>=4' });
  const r2 = peerRequirements({ peerDeps: { a: '1', b: '2' }, peerMeta: { a: { optional: false }, b: {} } });
  assert.deepEqual(r2.required, { a: '1', b: '2' });
  assert.deepEqual(r2.optional, {});
});

/** @id TEST-PEER-002 @verifies REQ-PEER-002 */
test('TEST-PEER-002 no peers', () => {
  assert.deepEqual(peerRequirements(reg.bare['1.0.0']), { required: {}, optional: {} });
  assert.deepEqual(peerRequirements(undefined), { required: {}, optional: {} });
});

/** @id TEST-PEER-003 @verifies REQ-PEER-003 */
test('TEST-PEER-003 missing required peer', () => {
  const v = checkPeers(new Map([['host', '1.0.0']]), reg);
  assert.deepEqual(v, [{ pkg: 'host', version: '1.0.0', peer: 'react', range: '^16 || ^17', kind: 'missing' }]);
});

/** @id TEST-PEER-004 @verifies REQ-PEER-004 */
test('TEST-PEER-004 mismatch', () => {
  const v = checkPeers(new Map([['host', '1.0.0'], ['react', '18.2.0']]), reg);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, 'mismatch');
  assert.equal(v[0].actual, '18.2.0');
  assert.equal(v[0].peer, 'react');
});

/** @id TEST-PEER-005 @verifies REQ-PEER-005 */
test('TEST-PEER-005 absent optional peer is silent', () => {
  const v = checkPeers(new Map([['host', '1.0.0'], ['react', '17.0.2']]), reg);
  assert.deepEqual(v, []);
});

/** @id TEST-PEER-006 @verifies REQ-PEER-006 */
test('TEST-PEER-006 present optional peer must match', () => {
  const v = checkPeers(new Map([['host', '1.0.0'], ['react', '17.0.2'], ['lodash', '3.10.1']]), reg);
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].peer, v[0].kind, v[0].actual], ['lodash', 'mismatch', '3.10.1']);
});

/** @id TEST-PEER-007 @verifies REQ-PEER-007 */
test('TEST-PEER-007 union peer range', () => {
  for (const ok of ['16.14.0', '17.0.2']) assert.deepEqual(checkPeers(new Map([['host', '1.0.0'], ['react', ok]]), reg), []);
  assert.equal(checkPeers(new Map([['host', '1.0.0'], ['react', '15.0.0']]), reg).length, 1);
});

/** @id TEST-PEER-008 @verifies REQ-PEER-008 */
test('TEST-PEER-008 sorted and order independent', () => {
  const r = { ...reg, zed: { '1.0.0': { peerDeps: { b: '*', a: '*' } } } };
  const a = checkPeers(new Map([['zed', '1.0.0'], ['plug', '2.0.0'], ['host', '1.0.0']]), r);
  const b = checkPeers(new Map([['host', '1.0.0'], ['plug', '2.0.0'], ['zed', '1.0.0']]), r);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((x) => `${x.pkg}>${x.peer}`), ['host>react', 'zed>a', 'zed>b']);
});

/** @id TEST-PEER-009 @verifies REQ-PEER-009 */
test('TEST-PEER-009 formatViolation', () => {
  assert.equal(formatViolation({ pkg: 'host', version: '1.0.0', peer: 'react', range: '^16', kind: 'missing' }),
    'host@1.0.0 requires peer react@^16 but it is missing');
  assert.equal(formatViolation({ pkg: 'host', version: '1.0.0', peer: 'react', range: '^16', kind: 'mismatch', actual: '18.0.0' }),
    'host@1.0.0 requires peer react@^16 but found 18.0.0');
});
