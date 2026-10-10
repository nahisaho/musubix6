import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from '../src/worker.mjs';
/** @id TEST-SCOPE-001 @verifies REQ-SCOPE-001 */
test('TEST-SCOPE-001', () => assert.equal(new Worker().run(), 1));
/** @id TEST-SCOPE-002 @verifies REQ-SCOPE-002 */
test('TEST-SCOPE-002', () => assert.equal(new Worker().stop(), 2));
