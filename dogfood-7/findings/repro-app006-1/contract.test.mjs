import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from './contract.mjs';
/** @id TEST-FIXTUREGATE-001 @verifies REQ-FIXTUREGATE-001 */
test('TEST-FIXTUREGATE-001 sum', () => { assert.equal(add(1, 2), 3); });
