import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicEngine } from '../src/index.ts';

/** @id TEST-DYNAMIC-001 @verifies REQ-DYNAMIC-001 */
test('TEST-DYNAMIC-001 discover and retry missing reads', async () => {
  let rootCalls=0;let leafCalls=0;
  const engine = new DynamicEngine([
    {id:'leaf',deps:[],version:'1',run:()=>{leafCalls++;return 5;}},
    {id:'root',deps:[],version:'1',run:({read})=>{rootCalls++;return Number(read('leaf'))*2;}}
  ]);
  const result = await engine.build(['root']);
  assert.equal(result.artifacts.root!.value,10);assert.equal(rootCalls,2);assert.equal(leafCalls,1);
  assert.deepEqual(engine.dependencies('root'),['leaf']);
});
/** @id TEST-DYNAMIC-002 @verifies REQ-DYNAMIC-002 */
test('TEST-DYNAMIC-002 unknown discovery cannot publish', async () => {
  const engine = new DynamicEngine([{id:'root',deps:[],version:'1',run:({read})=>read('absent')}]);
  await assert.rejects(engine.build(['root']),/unknown.*absent/);
  assert.deepEqual(engine.dependencies('root'),[]);
});
/** @id TEST-DYNAMIC-003 @verifies REQ-DYNAMIC-003 */
test('TEST-DYNAMIC-003 multiround cycles roll back entire transaction', async () => {
  const engine = new DynamicEngine([
    {id:'a',deps:[],version:'1',run:({read})=>read('b')},
    {id:'b',deps:[],version:'1',run:({read})=>read('a')}
  ]);
  await assert.rejects(engine.build(['a']),/cycle/);
  assert.deepEqual(engine.dependencies('a'),[]);assert.deepEqual(engine.dependencies('b'),[]);
});
/** @id TEST-DYNAMIC-004 @verifies REQ-DYNAMIC-004 */
test('TEST-DYNAMIC-004 obsolete dynamic edges are removed', async () => {
  let selected='a';
  const engine = new DynamicEngine([
    {id:'a',deps:[],version:'1',run:()=>1},{id:'b',deps:[],version:'1',run:()=>2},
    {id:'root',deps:[],version:'1',run:({read})=>read(selected)}
  ]);
  await engine.build(['root']);selected='b';engine.update('root','2');
  const result=await engine.build(['root']);
  assert.equal(result.artifacts.root!.value,2);assert.deepEqual(engine.dependencies('root'),['b']);
});
/** @id TEST-DYNAMIC-005 @verifies REQ-DYNAMIC-005 */
test('TEST-DYNAMIC-005 discovered source content invalidates consumer', async () => {
  let value=3;
  const engine=new DynamicEngine([
    {id:'a',deps:[],version:'1',run:()=>value},
    {id:'root',deps:[],version:'1',run:({read})=>Number(read('a'))+1}
  ]);
  await engine.build(['root']);value=7;engine.update('a','2');
  assert.equal((await engine.build(['root'])).artifacts.root!.value,8);
});
/** @id TEST-DYNAMIC-006 @verifies REQ-DYNAMIC-006 */
test('TEST-DYNAMIC-006 discovery retry budget and rollback', async () => {
  const engine=new DynamicEngine([
    {id:'a',deps:[],version:'1',run:({read})=>read('b')},
    {id:'b',deps:[],version:'1',run:({read})=>read('c')},
    {id:'c',deps:[],version:'1',run:()=>1}
  ],{maxRounds:2});
  await assert.rejects(engine.build(['a']),/stabilization/);
  assert.deepEqual(engine.dependencies('a'),[]);
  assert.throws(()=>new DynamicEngine([],{maxRounds:0}),/retry bound/);
});
/** @id TEST-DYNAMIC-007 @verifies REQ-DYNAMIC-007 */
test('TEST-DYNAMIC-007 static edges survive overlapping discovery', async () => {
  let calls=0;
  const engine=new DynamicEngine([
    {id:'a',deps:[],version:'1',run:()=>2},
    {id:'root',deps:['a','a'],version:'1',run:({read})=>{calls++;return read('a');}}
  ]);
  assert.equal((await engine.build(['root'])).artifacts.root!.value,2);
  assert.deepEqual(engine.dependencies('root'),['a']);assert.equal(calls,1);
});
/** @id TEST-DYNAMIC-008 @verifies REQ-DYNAMIC-008 */
test('TEST-DYNAMIC-008 cache retains discovery metadata', async () => {
  let calls=0;
  const engine=new DynamicEngine([
    {id:'a',deps:[],version:'1',run:()=>2},
    {id:'root',deps:[],version:'1',run:({read})=>{calls++;return read('a');}}
  ]);
  await engine.build(['root']);const previous=calls;const result=await engine.build(['root']);
  assert.equal(calls,previous);assert.ok(result.reused.includes('root'));
  assert.deepEqual(engine.dependencies('root'),['a']);
});
import { ArtifactCache } from '@build/cache';
/** @id TEST-DYNAMIC-009 @verifies REQ-DYNAMIC-009 */
test('TEST-DYNAMIC-009 revisited versions restore exact cached reads', async () => {
  let selected='a';let failA=false;
  const engine=new DynamicEngine([
    {id:'a',deps:[],version:'1',run:()=>{if(failA)throw new Error('obsolete failed');return 1;}},
    {id:'b',deps:[],version:'1',run:()=>2},
    {id:'root',deps:[],version:'1',run:({read})=>read(selected)}
  ]);
  for(const [version,selection] of [['1','a'],['2','b'],['1','a'],['2','b']]){
    selected=selection!;engine.update('root',version!);await engine.build(['root']);
    assert.deepEqual(engine.dependencies('root'),[selection]);
  }
  failA=true;engine.update('a','2');
  assert.equal((await engine.build(['root'])).artifacts.root!.value,2);
});
/** @id TEST-DYNAMIC-010 @verifies REQ-DYNAMIC-010 */
test('TEST-DYNAMIC-010 supplied cache publishes atomically and remains shared', async () => {
  const cache=new ArtifactCache(20);let calls=0;
  const tasks=[{id:'a',deps:[],version:'1',run:()=>{calls++;return 1;}}];
  await new DynamicEngine(tasks,{cache}).build(['a']);
  assert.equal(cache.stats().size,1);
  await new DynamicEngine(tasks,{cache}).build(['a']);assert.equal(calls,1);
  const before=cache.stats().size;
  const failed=new DynamicEngine([
    {id:'b',deps:[],version:'1',run:()=>2},
    {id:'root',deps:['b'],version:'1',run:()=>{throw new Error('no publish');}}
  ],{cache});
  await assert.rejects(failed.build(['root']),/no publish/);
  assert.equal(cache.stats().size,before);
});
