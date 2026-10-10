import test from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../src/p.js';

/** @id TEST-S-001 @verifies REQ-S-001 */
test('TEST-S-001 one', () => { assert.equal(one(), 1); });

const expected = 99;

/** @id TEST-S-002 @verifies REQ-S-002 */
test('TEST-S-002 two', () => { assert.equal(one() + 1, expected); });
