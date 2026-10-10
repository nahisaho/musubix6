import test from 'node:test';
import assert from 'node:assert/strict';
import { Evaluator } from '../src/index.ts';
import { bucket, inRollout } from '@flags/rollout';
import type { Flag, Snapshot } from '@flags/control';
const flag = ():Flag => ({key:'checkout',enabled:true,defaultValue:'off',rules:[]});
const snapshot = (config:Flag=flag(),revision=1):Snapshot => ({revision,flags:[config],segments:[]});

/** @id TEST-SDK-001 @verifies REQ-SDK-001 */
test('TEST-SDK-001 default with revision', () => {
  assert.deepEqual(new Evaluator(snapshot()).evaluate('checkout',{key:'alice'},'fallback'),
    {value:'off',reason:'default',revision:1});
});
/** @id TEST-SDK-002 @verifies REQ-SDK-002 */
test('TEST-SDK-002 missing and disabled', () => {
  assert.equal(new Evaluator(snapshot()).evaluate('absent',{key:'u'},'fallback').reason,'missing');
  assert.deepEqual(new Evaluator(snapshot({...flag(),enabled:false})).evaluate('checkout',{key:'u'},'fallback'),
    {value:'fallback',reason:'disabled',revision:1});
});
/** @id TEST-SDK-003 @verifies REQ-SDK-003 */
test('TEST-SDK-003 first matching rule', () => {
  const config={...flag(),rules:[{when:'plan EQ "pro"',value:'first'},{when:'active EQ true',value:'second'}]};
  assert.equal(new Evaluator(snapshot(config)).evaluate('checkout',{key:'u',attributes:{plan:'pro',active:true}},'fallback').value,'first');
});
/** @id TEST-SDK-004 @verifies REQ-SDK-004 */
test('TEST-SDK-004 segment targeting', () => {
  const config=snapshot({...flag(),rules:[{segment:'staff',value:'yes'}]});
  config.segments=[{id:'staff',include:['alice']}];
  assert.equal(new Evaluator(config).evaluate('checkout',{key:'alice'},'fallback').value,'yes');
});
/** @id TEST-SDK-005 @verifies REQ-SDK-005 */
test('TEST-SDK-005 stable percentage assignments', () => {
  const evaluator=new Evaluator(snapshot({...flag(),rollout:{percentage:50,value:'on',salt:'s'}}));
  for(let i=0;i<100;i++) {
    const key=String(i);
    assert.equal(evaluator.evaluate('checkout',{key},'fallback').value,
      inRollout('checkout',key,50,'s')?'on':'off');
  }
});
/** @id TEST-SDK-006 @verifies REQ-SDK-006 */
test('TEST-SDK-006 weighted variant value', () => {
  const evaluator=new Evaluator(snapshot({...flag(),variants:[{name:'a',weight:25,value:'A'},{name:'b',weight:75,value:'B'}]}));
  assert.equal(evaluator.evaluate('checkout',{key:'alice'},'fallback').value,bucket('checkout','alice')<2500?'A':'B');
});
/** @id TEST-SDK-007 @verifies REQ-SDK-007 */
test('TEST-SDK-007 monotonic atomic updates', () => {
  const evaluator=new Evaluator(snapshot());
  assert.throws(()=>evaluator.update(snapshot(flag(),1)),/revision/i);
  assert.throws(()=>evaluator.update(snapshot({...flag(),rules:[{when:'bad',value:true}]},2)),/syntax/i);
  assert.equal(evaluator.evaluate('checkout',{key:'u'},'fallback').revision,1);
  evaluator.update(snapshot({...flag(),defaultValue:'new'},2));
  assert.equal(evaluator.evaluate('checkout',{key:'u'},'fallback').value,'new');
});
/** @id TEST-SDK-008 @verifies REQ-SDK-008 */
test('TEST-SDK-008 stale and invalid user fails closed', () => {
  let now=0;
  const evaluator=new Evaluator(snapshot(),{clock:()=>now,maxAge:10});
  assert.equal(evaluator.evaluate('checkout',{key:''},'fallback').reason,'invalid-context');
  now=11;
  assert.equal(evaluator.evaluate('checkout',{key:'u'},'fallback').reason,'stale');
  assert.equal(evaluator.evaluate('checkout',{key:'u'},'fallback').value,'fallback');
});
/** @id TEST-SDK-009 @verifies REQ-SDK-009 */
test('TEST-SDK-009 snapshot and result isolation', () => {
  const config=snapshot({...flag(),defaultValue:{color:'blue'}});
  const evaluator=new Evaluator(config);
  (config.flags[0].defaultValue as {color:string}).color='red';
  const result=evaluator.evaluate('checkout',{key:'u'},null);
  (result.value as {color:string}).color='green';
  assert.deepEqual(evaluator.evaluate('checkout',{key:'u'},null).value,{color:'blue'});
});
/** @id TEST-SDK-010 @verifies REQ-SDK-010 */
test('TEST-SDK-010 update clock failure is atomic', () => {
  let now=0, broken=false;
  const evaluator=new Evaluator(snapshot(),{clock:()=>{if(broken)throw new Error('clock failed');return now;},maxAge:10});
  now=5;
  broken=true;
  assert.throws(()=>evaluator.update(snapshot({...flag(),defaultValue:'new'},2)),/clock/i);
  broken=false;
  assert.deepEqual(evaluator.evaluate('checkout',{key:'u'},'fallback'),{value:'off',reason:'default',revision:1});
  now=NaN;
  assert.throws(()=>evaluator.update(snapshot({...flag(),defaultValue:'new'},2)),/clock/i);
  now=6;
  assert.deepEqual(evaluator.evaluate('checkout',{key:'u'},'fallback'),{value:'off',reason:'default',revision:1});
  now=11;
  assert.equal(evaluator.evaluate('checkout',{key:'u'},'fallback').reason,'stale');
});
