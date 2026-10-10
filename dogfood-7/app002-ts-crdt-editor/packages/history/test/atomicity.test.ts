import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '@crdt/history';
/** @id TEST-HISTORY-009 @verifies REQ-HISTORY-007 */
test('TEST-HISTORY-009 grouped edit rejects Lamport exhaustion atomically',()=>{
  const e=new Editor('a');
  e.receive({kind:'insert',id:{actor:'remote',seq:1},time:Number.MAX_SAFE_INTEGER-1,deps:{},after:'HEAD',value:'x'});
  const before=e.replica.log, clock=e.replica.clock;
  assert.throws(()=>e.insert(1,'yz'));
  assert.equal(e.text(),'x');assert.deepEqual(e.replica.log,before);assert.deepEqual(e.replica.clock,clock);
  assert.equal(e.undoDepth,0);assert.equal(e.redoDepth,0);
});
