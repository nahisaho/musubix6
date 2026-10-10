import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from './src.mjs';
/** @id TEST-CHECK-001 @verifies REQ-CHECK-001 */
test('TEST-CHECK-001', () => assert.equal(check(), true));
