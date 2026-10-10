import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/registry.js';
/** @id TEST-FIXTURE-001 @verifies REQ-FIXTURE-001 */
test('TEST-FIXTURE-001 unrelated selected test', () => {
  assert.equal(42, 42);
});
/** @id TEST-FIXTURE-002 @verifies REQ-FIXTURE-002 */
test('TEST-FIXTURE-002 sibling child factory', () => {
  const child = new Registry().create();
  assert.equal(child.get(), 42);
});
