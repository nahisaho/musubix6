import test from 'node:test';
import assert from 'node:assert/strict';
import { Box } from '../src/box.ts';
/** @id TEST-STUB-001 @verifies REQ-STUB-001 */
test('TEST-STUB-001',()=>{
  const box=new Box();
  assert.equal(box.first(),1);
});
/** @id TEST-STUB-002 @verifies REQ-STUB-002 */
test('TEST-STUB-002',()=>{
  const box=new Box();
  assert.equal(box.second(),2);
});
