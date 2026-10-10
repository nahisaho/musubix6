import test from 'node:test';
import assert from 'node:assert/strict';

/** @id CODE-NESTED-001 @implements REQ-NESTED-001 */
const constant = () => 1;

/** @id TEST-NESTED-001 @verifies REQ-NESTED-001 */
test('TEST-NESTED-001 constant', () => assert.equal(constant(), 1));
