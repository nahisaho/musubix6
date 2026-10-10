import test from 'node:test';
import assert from 'node:assert/strict';
import { answer } from '../src/index.ts';
/** @id TEST-PREFIX-001 @verifies REQ-PREFIX-001 */
test('TEST-PREFIX-001',()=>assert.equal(answer(),1));
