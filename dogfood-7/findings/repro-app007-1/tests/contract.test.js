import test from 'node:test';
import assert from 'node:assert/strict';
/** @id TEST-FIXTURE-001 @verifies REQ-FIXTURE-001 */
test('TEST-FIXTURE-001 fixture name characterization', () => {
  assert.equal('changed-gate-fixture'.includes('fixture'), true);
});
