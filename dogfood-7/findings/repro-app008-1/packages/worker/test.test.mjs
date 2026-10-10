import test from 'node:test';
import assert from 'node:assert/strict';
import { answer } from './answer.mjs';
/** @id TEST-NESTED-001 @verifies REQ-NESTED-001 */
test('TEST-NESTED-001', () => assert.equal(answer(), 1));
