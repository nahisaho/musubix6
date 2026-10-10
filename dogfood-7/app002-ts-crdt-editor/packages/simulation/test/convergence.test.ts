import test from 'node:test';
import assert from 'node:assert/strict';
import { Random, scenario, permutations, deepSequence, type Report } from '@crdt/simulation';
import { capture, resolve } from '@crdt/cursor';
import { Editor } from '@crdt/history';
const converged=(report:Report)=>{
  assert.equal(report.editors.length,3);
  const first=report.editors[0].replica;
  for(const e of report.editors){
    assert.equal(e.text(),first.text(),`seed ${report.seed}`);
    assert.deepEqual(e.replica.sequence.allIds(),first.sequence.allIds(),`seed ${report.seed}`);
    assert.deepEqual(e.replica.log,first.log,`seed ${report.seed}`);
    assert.deepEqual(e.replica.clock,first.clock,`seed ${report.seed}`);
    assert.equal(e.replica.pendingCount,0);assert.equal(e.replica.rejected.length,0);
  }
};
/** @id TEST-CONVERGENCE-001 @verifies REQ-CONVERGENCE-001 */
test('TEST-CONVERGENCE-001 deterministic nondegenerate seeded schedules',()=>{
  const a=new Random(42),b=new Random(42),values=Array.from({length:100},()=>a.int(7));
  assert.equal(new Set(values).size,7);assert.deepEqual(values,Array.from({length:100},()=>b.int(7)));
  assert.throws(()=>a.int(0));assert.throws(()=>a.int(1.5));assert.throws(()=>new Random(-1));
  const one=scenario(42,20,'history'),two=scenario(42,20,'history');
  assert.equal(one.editors.length,3);assert.deepEqual(one.schedule,two.schedule);assert.deepEqual(one.operations,two.operations);
});
/** @id TEST-CONVERGENCE-002 @verifies REQ-CONVERGENCE-002 */
test('TEST-CONVERGENCE-002 insert-only shuffled duplicate delivery',()=>{
  for(let seed=1;seed<=16;seed++){
    const report=scenario(seed,32,'insert');converged(report);
    assert.equal([...report.editors[0].text()].length,35);
    assert.ok(report.schedule.length>report.operations.length*3);
  }
});
/** @id TEST-CONVERGENCE-003 @verifies REQ-CONVERGENCE-003 */
test('TEST-CONVERGENCE-003 mixed insert delete properties',()=>{
  for(let seed=1;seed<=24;seed++){
    const report=scenario(seed*101,36,'edit');converged(report);
    assert.ok(report.operations.some(o=>o.kind==='hide'));assert.ok(report.operations.some(o=>o.kind==='insert'));
  }
});
/** @id TEST-CONVERGENCE-004 @verifies REQ-CONVERGENCE-004 */
test('TEST-CONVERGENCE-004 partitioned undo redo eventual convergence',()=>{
  let shows=0;
  for(let seed=1;seed<=24;seed++){
    const report=scenario(seed*997,44,'history');converged(report);
    shows+=report.operations.filter(o=>o.kind==='show').length;
  }
  assert.ok(shows>30);
});
/** @id TEST-CONVERGENCE-005 @verifies REQ-CONVERGENCE-005 */
test('TEST-CONVERGENCE-005 exhaustive small history permutations',()=>{
  const a=new Editor('a');a.insert(0,'x');a.delete(0,1);a.undo();
  const variants=[...permutations(a.replica.log)];assert.equal(variants.length,6);
  for(const order of variants){
    const b=new Editor('b');order.forEach(o=>b.receive(o));
    assert.equal(b.text(),'x');assert.equal(b.replica.pendingCount,0);assert.deepEqual(b.replica.clock,{a:3});
  }
});
/** @id TEST-CONVERGENCE-006 @verifies REQ-CONVERGENCE-006 */
test('TEST-CONVERGENCE-006 randomized anchors bounded and convergent',()=>{
  for(let seed=1;seed<=16;seed++){
    const report=scenario(seed*17,40,'history');converged(report);
    assert.equal(report.anchors.length,2);
    for(const anchor of report.anchors){
      const indexes=report.editors.map(e=>resolve(e.replica.sequence,anchor));
      assert.ok(indexes.every(i=>i>=0&&i<=[...report.editors[0].text()].length));assert.equal(new Set(indexes).size,1);
    }
    for(const e of report.editors)assert.equal(resolve(e.replica.sequence,capture(e.replica.sequence,0,'left')),0);
  }
});
/** @id TEST-CONVERGENCE-007 @verifies REQ-CONVERGENCE-007 */
test('TEST-CONVERGENCE-007 deep RGA chain avoids recursion overflow',()=>{
  const s=deepSequence(12000);
  assert.equal(s.text().length,12000);assert.equal(s.visibleIds().length,12000);
  assert.equal(s.allIds().at(-1),'deep:12000');
});
/** @id TEST-CONVERGENCE-008 @verifies REQ-CONVERGENCE-008 */
test('TEST-CONVERGENCE-008 runtime Unicode characterization',()=>{
  assert.equal('A😀B'.length,4);assert.equal([...'A😀B'].length,3);
  assert.deepEqual([...'e\u0301'],['e','\u0301']);
});
