import test from 'node:test';
import assert from 'node:assert/strict';
import {add} from '../src/add.mjs';
/** @id TEST-CHANGE-001 @verifies REQ-CHANGE-001 */
test('TEST-CHANGE-001 add',()=>assert.equal(add(1,2),3));
