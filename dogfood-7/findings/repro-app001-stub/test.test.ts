import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '@repro/missing-entry';
/** @id TEST-STUB-001 @verifies REQ-STUB-001 */
test('TEST-STUB-001', () => assert.equal(add(1, 2), 3));
