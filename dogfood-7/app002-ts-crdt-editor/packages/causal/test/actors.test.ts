import test from 'node:test';
import assert from 'node:assert/strict';
import { Replica } from '@crdt/causal';
/** @id TEST-CAUSAL-009 @verifies REQ-CAUSAL-008 REQ-CAUSAL-005 */
test('TEST-CAUSAL-009 inherited Object names are valid actors but not causal proof',()=>{
  for(const actor of ['toString','valueOf','hasOwnProperty','isPrototypeOf','toLocaleString']){
    let result: string|undefined;
    assert.doesNotThrow(()=>{
      const a=new Replica(actor),b=new Replica('sink');const op=a.insert(0,'x');b.receive(op);
      assert.equal(op.id.seq,1);assert.equal(b.pendingCount,0);result=b.text();
    });
    assert.equal(result,'x');
    const replica=new Replica('sink');
    assert.throws(()=>replica.receive({kind:'insert',id:{actor:'z',seq:1},time:2,
      deps:{missing:1},after:`${actor}:1`,value:'x'}));
    assert.equal(replica.pendingCount,0);
  }
});
