import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from './contract.mjs';
/** @id TEST-NOMATCH-001 @verifies REQ-NOMATCH-001 */
test('TEST-NOMATCH-001 sum', () => { assert.equal(add(1, 2), 3); });
