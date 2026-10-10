import test from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../src/one.ts';
/** @id TEST-SCOPE-001 @verifies REQ-SCOPE-001 */
test('TEST-SCOPE-001',()=>assert.equal(one(),1));
