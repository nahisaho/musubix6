import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock } from '@build/executor';
import { Engine } from '../src/index.ts';

/** @id TEST-ENGINE-001 @verifies REQ-ENGINE-001 */
test('TEST-ENGINE-001 dependency closure and target artifacts', async () => {
  let unused = false;
  const engine = new Engine([
    {id:'a',deps:[],version:'1',run:()=>3},
    {id:'b',deps:['a'],version:'1',run:({inputs})=>Number(inputs.a)*2},
    {id:'unused',deps:[],version:'1',run:()=>{unused=true;return 0;}}
  ]);
  const result = await engine.build(['b']);
  assert.equal(result.artifacts.b!.value,6); assert.deepEqual(result.executed,['a','b']); assert.equal(unused,false);
});
/** @id TEST-ENGINE-002 @verifies REQ-ENGINE-002 */
test('TEST-ENGINE-002 complete cache reuse', async () => {
  let calls = 0;
  const engine = new Engine([{id:'a',deps:[],version:'1',run:()=>++calls}]);
  await engine.build(['a']); const result = await engine.build(['a']);
  assert.equal(calls,1); assert.deepEqual(result.reused,['a']); assert.deepEqual(result.executed,[]);
});
/** @id TEST-ENGINE-003 @verifies REQ-ENGINE-003 */
test('TEST-ENGINE-003 early output cutoff', async () => {
  let leaf = 0; let consumer = 0;
  const engine = new Engine([
    {id:'a',deps:[],version:'1',run:()=>{leaf++;return 4;}},
    {id:'b',deps:['a'],version:'1',run:({inputs})=>{consumer++;return inputs.a!;}}
  ]);
  await engine.build(['b']); engine.update('a','2'); const result = await engine.build(['b']);
  assert.equal(leaf,2); assert.equal(consumer,1); assert.deepEqual(result.reused,['b']);
});
/** @id TEST-ENGINE-004 @verifies REQ-ENGINE-004 */
test('TEST-ENGINE-004 transitive output invalidation', async () => {
  let source = 2;
  const engine = new Engine([
    {id:'a',deps:[],version:'1',run:()=>source},
    {id:'b',deps:['a'],version:'1',run:({inputs})=>Number(inputs.a)+1},
    {id:'c',deps:['b'],version:'1',run:({inputs})=>Number(inputs.b)+1}
  ]);
  await engine.build(['c']); source=9; engine.update('a','2'); const result = await engine.build(['c']);
  assert.deepEqual(result.executed,['a','b','c']); assert.equal(result.artifacts.c!.value,11);
});
/** @id TEST-ENGINE-005 @verifies REQ-ENGINE-005 */
test('TEST-ENGINE-005 action version invalidation', async () => {
  let calls = 0;
  const engine = new Engine([{id:'a',deps:[],version:'1',run:()=>++calls}]);
  await engine.build(['a']); engine.update('a','2'); const result = await engine.build(['a']);
  assert.equal(result.artifacts.a!.value,2); assert.deepEqual(result.executed,['a']);
});
/** @id TEST-ENGINE-006 @verifies REQ-ENGINE-006 */
test('TEST-ENGINE-006 failure is never cached', async () => {
  let fail = true; let calls = 0;
  const engine = new Engine([{id:'a',deps:[],version:'1',run:()=>{calls++;if(fail)throw new Error('temporary');return 8;}}]);
  await assert.rejects(engine.build(['a']), /temporary/);
  fail=false; assert.equal((await engine.build(['a'])).artifacts.a!.value,8); assert.equal(calls,2);
});
/** @id TEST-ENGINE-007 @verifies REQ-ENGINE-007 */
test('TEST-ENGINE-007 fake-clock parallel makespan', async () => {
  const clock = new FakeClock();
  const engine = new Engine(['a','b','c'].map(id=>({id,deps:[],version:'1',run:async({signal})=>{
    await clock.sleep(3,signal);return id;
  }})),{concurrency:2,clock});
  const pending = engine.build(['a','b','c']); await clock.advance(6); const result = await pending;
  assert.equal(clock.now,6); assert.equal(result.executed.length,3);
  assert.deepEqual(result.events.filter(e=>e.state==='running').map(e=>e.at),[0,0,3]);
});
/** @id TEST-ENGINE-008 @verifies REQ-ENGINE-008 */
test('TEST-ENGINE-008 exclusive session and updates', async () => {
  const clock = new FakeClock();
  const engine = new Engine([{id:'a',deps:[],version:'1',run:async()=>{await clock.sleep(1);return 1;}}],{clock});
  const pending = engine.build(['a']);
  await assert.rejects(engine.build(['a']), /active/);
  assert.throws(()=>engine.update('a','2'), /active/);
  await clock.advance(1); await pending;
  engine.update('a','2');
  assert.throws(()=>engine.update('missing','2'), /unknown/);
});
/** @id TEST-ENGINE-009 @verifies REQ-ENGINE-009 */
test('TEST-ENGINE-009 cache metadata publication and hit notification', async () => {
  let observed:unknown;
  const engine=new Engine([{id:'a',deps:[],version:'1',run:()=>1}],{
    artifactMetadata:()=>['read'],onCacheHit:(_id,metadata)=>{observed=metadata;}
  });
  await engine.build(['a']);assert.equal(observed,undefined);
  await engine.build(['a']);assert.deepEqual(observed,['read']);
});
