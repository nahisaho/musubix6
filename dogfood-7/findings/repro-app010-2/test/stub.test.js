import test from 'node:test';
import assert from 'node:assert/strict';
import { Box } from '../src/box.js';
/** @id TEST-STUB-001 @verifies REQ-STUB-001 */
test('TEST-STUB-001', () => {
  const b = new Box();
  assert.equal(b.first(), 1);
});
/** @id TEST-STUB-002 @verifies REQ-STUB-002 */
test('TEST-STUB-002', () => {
  const b = new Box();
  assert.equal(b.second(), 2);
});
