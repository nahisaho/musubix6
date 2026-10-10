import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '@crdt/history';
import { key } from '@crdt/sequence';
/** @id TEST-HISTORY-001 @verifies REQ-HISTORY-001 */
test('TEST-HISTORY-001 grouped Unicode insertion', () => {
  const e=new Editor('a'), ops=e.insert(0,'A😀B');
  assert.equal(ops.length,3); assert.equal(e.undoDepth,1); assert.equal(e.text(),'A😀B');
  assert.equal(e.undo().length,3); assert.equal(e.text(),''); assert.equal(e.undoDepth,0);
});
/** @id TEST-HISTORY-002 @verifies REQ-HISTORY-002 */
test('TEST-HISTORY-002 insertion undo retains remote descendants', () => {
  const a=new Editor('a'),b=new Editor('b');
  a.insert(0,'x').forEach(o=>b.receive(o));
  b.insert(1,'y').forEach(o=>a.receive(o));
  a.undo(); assert.equal(a.text(),'y'); assert.equal(a.redoDepth,1);
});
/** @id TEST-HISTORY-003 @verifies REQ-HISTORY-003 */
test('TEST-HISTORY-003 redo uses original identities', () => {
  const a=new Editor('a'); const originals=a.insert(0,'ab').map(o=>key(o.id));
  a.undo(); const redo=a.redo();
  assert.equal(a.text(),'ab'); assert.deepEqual(a.replica.sequence.visibleIds(),originals);
  assert.ok(redo.every(o=>o.kind==='show'));
});
/** @id TEST-HISTORY-004 @verifies REQ-HISTORY-004 */
test('TEST-HISTORY-004 undo delete does not undo remote deletion', () => {
  const a=new Editor('a'),b=new Editor('b'); a.insert(0,'x').forEach(o=>b.receive(o));
  const local=a.delete(0,1), remote=b.delete(0,1);
  remote.forEach(o=>a.receive(o)); local.forEach(o=>b.receive(o));
  a.undo().forEach(o=>b.receive(o));
  assert.equal(a.text(),''); assert.equal(b.text(),'');
  b.undo().forEach(o=>a.receive(o)); assert.equal(a.text(),'x'); assert.equal(b.text(),'x');
});
/** @id TEST-HISTORY-005 @verifies REQ-HISTORY-005 */
test('TEST-HISTORY-005 repeated undo redo emits fresh tags', () => {
  const a=new Editor('a'); a.insert(0,'x'); a.delete(0,1);
  const seen=new Set(a.replica.log.map(o=>key(o.id)));
  for(let i=0;i<6;i++){
    const undo=a.undo(); assert.equal(a.text(),'x');
    const redo=a.redo(); assert.equal(a.text(),'');
    for(const op of [...undo,...redo]){assert.equal(seen.has(key(op.id)),false);seen.add(key(op.id));}
  }
  assert.equal(a.replica.clock.a,14);
});
/** @id TEST-HISTORY-006 @verifies REQ-HISTORY-006 */
test('TEST-HISTORY-006 redo branching excludes no-ops and remote edits', () => {
  const a=new Editor('a'),b=new Editor('b'); a.insert(0,'x');a.undo();
  a.insert(0,'');a.delete(0,0);assert.equal(a.redoDepth,1);
  b.insert(0,'y').forEach(o=>a.receive(o));assert.equal(a.redoDepth,1);
  a.insert(1,'z');assert.equal(a.redoDepth,0);assert.deepEqual(a.redo(),[]);
  assert.equal(a.text(),'yz');
});
/** @id TEST-HISTORY-007 @verifies REQ-HISTORY-007 */
test('TEST-HISTORY-007 empty stacks and invalid ranges atomic', () => {
  const a=new Editor('a');
  assert.deepEqual(a.undo(),[]);assert.deepEqual(a.redo(),[]);
  assert.throws(()=>a.insert(2,'a'));assert.throws(()=>a.delete(0,1));
  a.insert(0,'abc');const before=a.replica.log;
  for(const [start,count] of [[-1,1],[0,-1],[0,4],[0.5,1],[0,0.5],[4,0]])
    assert.throws(()=>a.delete(start,count));
  assert.throws(()=>a.insert(1,null as unknown as string));
  assert.deepEqual(a.replica.log,before);assert.equal(a.undoDepth,1);assert.equal(a.text(),'abc');
});
/** @id TEST-HISTORY-008 @verifies REQ-HISTORY-008 */
test('TEST-HISTORY-008 history operation replay without shared stacks', () => {
  const a=new Editor('a'),b=new Editor('b');
  a.insert(0,'abc');a.delete(1,1);a.undo();a.undo();a.redo();a.delete(0,1);
  a.replica.log.toReversed().forEach(o=>b.receive(o));
  assert.equal(a.text(),'bc');assert.equal(b.text(),'bc');
  assert.equal(b.undoDepth,0);assert.equal(b.replica.pendingCount,0);
  assert.deepEqual(a.replica.log,b.replica.log);
});
