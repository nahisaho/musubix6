import test from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../src/value.js';
/** @id TEST-CHANGED-001 @verifies REQ-CHANGED-001 */
test('TEST-CHANGED-001', () => assert.equal(value(), 1));
