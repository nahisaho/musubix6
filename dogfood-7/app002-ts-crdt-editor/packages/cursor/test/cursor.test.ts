import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, resolve, captureSelection, resolveSelection, type Anchor } from '@crdt/cursor';
import { Editor } from '@crdt/history';
const doc=()=>{const e=new Editor('a');e.insert(0,'A😀B');return e;};
/** @id TEST-CURSOR-001 @verifies REQ-CURSOR-001 */
test('TEST-CURSOR-001 stable immutable code-point anchors',()=>{
  const e=doc(), c=capture(e.replica.sequence,2,'left');
  assert.deepEqual(c,{left:'a:2',right:'a:3',affinity:'left'});
  assert.equal(resolve(e.replica.sequence,c),2);assert.equal(Object.isFrozen(c),true);
});
/** @id TEST-CURSOR-002 @verifies REQ-CURSOR-002 */
test('TEST-CURSOR-002 left gap affinity',()=>{
  const e=doc(), c=capture(e.replica.sequence,1,'left');
  e.insert(1,'xy');assert.equal(e.text(),'Axy😀B');assert.equal(resolve(e.replica.sequence,c),1);
});
/** @id TEST-CURSOR-003 @verifies REQ-CURSOR-003 */
test('TEST-CURSOR-003 right gap affinity',()=>{
  const e=doc(), c=capture(e.replica.sequence,1,'right');
  e.insert(1,'xy');assert.equal(resolve(e.replica.sequence,c),3);
});
/** @id TEST-CURSOR-004 @verifies REQ-CURSOR-004 */
test('TEST-CURSOR-004 deleted anchors retain tombstone coordinates',()=>{
  const e=doc(), l=capture(e.replica.sequence,1,'left'),r=capture(e.replica.sequence,1,'right');
  e.delete(0,2);assert.equal(e.text(),'B');
  assert.equal(resolve(e.replica.sequence,l),0);assert.equal(resolve(e.replica.sequence,r),0);
  e.undo();assert.equal(resolve(e.replica.sequence,l),1);assert.equal(resolve(e.replica.sequence,r),1);
});
/** @id TEST-CURSOR-005 @verifies REQ-CURSOR-005 */
test('TEST-CURSOR-005 empty and boundary affinities',()=>{
  const e=new Editor('a'),left=capture(e.replica.sequence,0,'left'),right=capture(e.replica.sequence,0,'right');
  e.insert(0,'ab');assert.equal(resolve(e.replica.sequence,left),0);assert.equal(resolve(e.replica.sequence,right),2);
  const endLeft=capture(e.replica.sequence,2,'left'),endRight=capture(e.replica.sequence,2,'right');
  e.insert(2,'x');assert.equal(resolve(e.replica.sequence,endLeft),2);assert.equal(resolve(e.replica.sequence,endRight),3);
});
/** @id TEST-CURSOR-006 @verifies REQ-CURSOR-006 */
test('TEST-CURSOR-006 backward selection direction',()=>{
  const e=doc(),s=captureSelection(e.replica.sequence,3,1);
  e.insert(1,'xy');
  assert.deepEqual(resolveSelection(e.replica.sequence,s),{anchor:5,focus:3});
  assert.equal(Object.isFrozen(s),true);
});
/** @id TEST-CURSOR-007 @verifies REQ-CURSOR-007 */
test('TEST-CURSOR-007 invalid anchor contract',()=>{
  const e=doc(),before=e.replica.log;
  for(const index of [-1,4,0.5,Infinity])assert.throws(()=>capture(e.replica.sequence,index));
  assert.throws(()=>capture(e.replica.sequence,0,'middle' as 'left'));
  assert.throws(()=>resolve(e.replica.sequence,{left:'z:1',right:null,affinity:'left'}));
  assert.throws(()=>resolve(e.replica.sequence,{left:null,right:'HEAD',affinity:'right'}));
  assert.throws(()=>resolve(e.replica.sequence,{} as Anchor));
  assert.deepEqual(e.replica.log,before);
});
/** @id TEST-CURSOR-008 @verifies REQ-CURSOR-008 */
test('TEST-CURSOR-008 anchors agree after concurrent edits and undo',()=>{
  const a=doc(),b=new Editor('b');a.replica.log.forEach(o=>b.receive(o));
  const anchor=capture(a.replica.sequence,1,'right');
  a.insert(1,'x');b.insert(1,'y');b.undo();
  const ops=[...a.replica.log,...b.replica.log];
  ops.toReversed().forEach(o=>a.receive(o));ops.forEach(o=>b.receive(o));
  assert.equal(a.text(),'Ax😀B');assert.equal(b.text(),a.text());
  assert.equal(resolve(a.replica.sequence,anchor),2);
  assert.equal(resolve(a.replica.sequence,anchor),resolve(b.replica.sequence,anchor));
});
