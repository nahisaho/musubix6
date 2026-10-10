import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '@crdt/history';
/** @id TEST-HISTORY-010 @verifies REQ-HISTORY-007 REQ-HISTORY-001 */
test('TEST-HISTORY-010 pending remote Lamport jumps cannot split local groups',()=>{
  const e=new Editor('a');
  e.receive({kind:'insert',id:{actor:'remote',seq:1},time:Number.MAX_SAFE_INTEGER,
    deps:{a:1},after:'HEAD',value:'r'});
  let ops: ReturnType<Editor['insert']>=[];
  assert.doesNotThrow(()=>{ops=e.insert(0,'xy');});
  assert.equal(ops.length,2);assert.equal(e.text(),'rxy');assert.equal(e.undoDepth,1);
  assert.equal(e.replica.pendingCount,0);assert.deepEqual(e.replica.clock,{a:2,remote:1});
  assert.throws(()=>e.undo());assert.equal(e.undoDepth,1);assert.equal(e.redoDepth,0);
  assert.equal(e.text(),'rxy');
});
