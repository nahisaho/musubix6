import test from 'node:test';
import assert from 'node:assert/strict';
/** @id TEST-NOMATCH-001 @verifies REQ-NOMATCH-001 */
test('TEST-NOMATCH-0011 intentional nonmatching sibling', () => {
  assert.fail('this body must never provide a Green');
});
