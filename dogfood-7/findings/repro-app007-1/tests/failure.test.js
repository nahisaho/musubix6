import test from 'node:test';
import assert from 'node:assert/strict';
test('untracked failing regression must run', () => {
  assert.equal(1, 2);
});
