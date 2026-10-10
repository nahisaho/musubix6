import test from 'node:test';
import assert from 'node:assert/strict';
import { Replica } from '@crdt/causal';
import { key, type Operation } from '@crdt/sequence';
/** @id TEST-CAUSAL-001 @verifies REQ-CAUSAL-001 */
test('TEST-CAUSAL-001 local contiguous counters and dependency snapshots', () => {
  const a = new Replica('a'), x = a.insert(0,'x'), y = a.insert(1,'y');
  assert.deepEqual(x.id,{actor:'a',seq:1}); assert.deepEqual(x.deps,{});
  assert.deepEqual(y.id,{actor:'a',seq:2}); assert.deepEqual(y.deps,{a:1});
  assert.equal(y.time,2); assert.equal(a.text(),'xy');
});
/** @id TEST-CAUSAL-002 @verifies REQ-CAUSAL-002 */
test('TEST-CAUSAL-002 cross-actor fixed-point causal buffer', () => {
  const a = new Replica('a'), b = new Replica('b'), c = new Replica('c');
  const x=a.insert(0,'x'); b.receive(x); const y=b.insert(1,'y');
  c.receive(y); assert.equal(c.pendingCount,1); assert.equal(c.text(),'');
  c.receive(x); assert.equal(c.pendingCount,0); assert.equal(c.text(),'xy');
  assert.deepEqual(c.clock,{a:1,b:1});
});
/** @id TEST-CAUSAL-003 @verifies REQ-CAUSAL-003 */
test('TEST-CAUSAL-003 reversed actor stream drains contiguously', () => {
  const a = new Replica('a'), b = new Replica('b');
  const ops = ['a','b','c'].map((s,i)=>a.insert(i,s));
  b.receive(ops[2]); b.receive(ops[1]); assert.deepEqual(b.clock,{});
  b.receive(ops[0]); assert.deepEqual(b.clock,{a:3}); assert.equal(b.text(),'abc');
});
/** @id TEST-CAUSAL-004 @verifies REQ-CAUSAL-004 */
test('TEST-CAUSAL-004 buffered and delivered duplicate integrity', () => {
  const a = new Replica('a'), b = new Replica('b');
  const x=a.insert(0,'x'), y=a.insert(1,'y');
  assert.equal(b.receive(y),true); assert.equal(b.receive(structuredClone(y)),false);
  assert.throws(()=>b.receive({...y,time:99}));
  b.receive(x); assert.equal(b.receive(x),false); assert.throws(()=>b.receive({...x,time:99}));
  assert.equal(b.text(),'xy'); assert.equal(b.log.length,2);
});
/** @id TEST-CAUSAL-005 @verifies REQ-CAUSAL-005 */
test('TEST-CAUSAL-005 illegal causal proof and deferred tag binding', () => {
  const a = new Replica('a'), b = new Replica('b'), x=a.insert(0,'x'); b.receive(x);
  const invalid: Operation[] = [
    {kind:'insert',id:{actor:'c',seq:2},time:4,deps:{},after:'HEAD',value:'x'},
    {kind:'hide',id:{actor:'c',seq:1},time:2,deps:{},target:'a:1',tag:'c:1'},
    {kind:'show',id:{actor:'c',seq:1},time:2,deps:{a:1},target:'a:1',tag:'a:1'},
    {kind:'insert',id:{actor:'c',seq:1},time:1,deps:{a:1},after:'HEAD',value:'x'},
  ];
  for (const op of invalid) assert.throws(()=>b.receive(op));
  assert.deepEqual(b.clock,{a:1}); assert.equal(b.pendingCount,0); assert.equal(b.log.length,1);
  const c = new Replica('c');
  const bad: Operation={kind:'show',id:{actor:'z',seq:1},time:2,deps:{a:1},target:'a:1',tag:'a:1'};
  c.receive(bad); assert.equal(c.pendingCount,1); c.receive(x);
  assert.equal(c.pendingCount,0); assert.equal(c.rejected.length,1); assert.deepEqual(c.clock,{a:1});
});
/** @id TEST-CAUSAL-006 @verifies REQ-CAUSAL-006 */
test('TEST-CAUSAL-006 inspection and pending input isolation', () => {
  const a=new Replica('a'), b=new Replica('b'), x=a.insert(0,'x'), y=a.insert(1,'y');
  b.receive(y); if(y.kind==='insert') y.value='?'; b.receive(x);
  assert.equal(b.text(),'xy');
  const clock=b.clock; clock.a=999;
  const log=b.log; log[0].id.actor='forged';
  assert.equal(b.text(),'xy'); assert.deepEqual(b.clock,{a:2}); assert.equal(b.log[0].id.actor,'a');
});
/** @id TEST-CAUSAL-007 @verifies REQ-CAUSAL-007 */
test('TEST-CAUSAL-007 local positions after higher remote counters', () => {
  const a=new Replica('a'), b=new Replica('b');
  for(let i=0;i<10;i++) a.insert(0,String(i));
  a.log.forEach(op=>b.receive(op));
  const op=b.insert(0,'😀'); assert.equal(op.time,11); assert.equal(b.text(),'😀9876543210');
  const deletion=b.delete(1); assert.equal(deletion.kind,'hide'); assert.equal(b.text(),'😀876543210');
  b.show(deletion.kind==='hide'?deletion.target:'',key(deletion.id)); assert.equal(b.text(),'😀9876543210');
});
/** @id TEST-CAUSAL-008 @verifies REQ-CAUSAL-008 */
test('TEST-CAUSAL-008 invalid local edits do not consume counters', () => {
  assert.throws(()=>new Replica('a:b')); assert.throws(()=>new Replica('__proto__'));
  const a=new Replica('a');
  for(const index of [-1,1,0.5,Infinity]) assert.throws(()=>a.insert(index,'x'));
  assert.throws(()=>a.insert(0,'ab')); assert.throws(()=>a.delete(0));
  assert.throws(()=>a.hide('z:1')); assert.deepEqual(a.clock,{});
  assert.equal(a.insert(0,'x').id.seq,1);
});
