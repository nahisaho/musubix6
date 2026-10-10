import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/p.js';
const obj = (r) => Object.fromEntries(r);

/** @id TEST-S-001 @verifies REQ-S-001 */
test('TEST-S-001 wrapped', () => {
  const r = run(1);
  assert.deepEqual(obj(r), { a: 1 });
});

/** @id TEST-S-002 @verifies REQ-S-002 */
test('TEST-S-002 direct', () => {
  const r = run(1);
  assert.deepEqual(r, new Map([['a', 1]]));
});
