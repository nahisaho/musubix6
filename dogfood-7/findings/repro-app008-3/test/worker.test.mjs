import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from '../src/worker.mjs';
/** @id TEST-WORKER-001 @verifies REQ-WORKER-001 */
test('TEST-WORKER-001', async () => { await assert.rejects(new Worker().run(), /failure/); });
