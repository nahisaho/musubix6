import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, scenario, type Report } from '@crdt/simulation';
import { Editor } from '@crdt/history';
/** @id TEST-CONVERGENCE-009 @verifies REQ-CONVERGENCE-003 */
test('TEST-CONVERGENCE-009 oracle rejects uniformly truncated histories',()=>{
  const source=new Editor('source');source.insert(0,'x');
  const report:Report={seed:1,editors:['a','b','c'].map(a=>new Editor(a)),operations:source.replica.log,schedule:[],anchors:[]};
  assert.throws(()=>validateReport(report),/preservation/);
  assert.doesNotThrow(()=>validateReport(scenario(123,40,'history')));
});
