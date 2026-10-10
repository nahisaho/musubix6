import test from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '@build/graph';
import { FakeClock, Executor, TRANSITIONS } from '../src/index.ts';

/** @id TEST-EXECUTOR-001 @verifies REQ-EXECUTOR-001 */
test('TEST-EXECUTOR-001 deadline and FIFO sleepers', async () => {
  const clock = new FakeClock(); const order: string[] = [];
  const a = clock.sleep(3).then(()=>order.push('a'));
  const b = clock.sleep(1).then(()=>order.push('b'));
  const c = clock.sleep(3).then(()=>order.push('c'));
  await clock.advance(2); assert.deepEqual(order,['b']); assert.equal(clock.now,2);
  await clock.advance(1); await Promise.all([a,b,c]); assert.deepEqual(order,['b','a','c']);
});
/** @id TEST-EXECUTOR-002 @verifies REQ-EXECUTOR-002 */
test('TEST-EXECUTOR-002 invalid bounds', async () => {
  const clock = new FakeClock();
  for (const value of [-1,NaN,Infinity]) {
    assert.throws(()=>clock.sleep(value), /duration/);
    await assert.rejects(clock.advance(value), /duration/);
  }
  for (const value of [0,-1,1.2,NaN]) assert.throws(()=>new Executor(value,clock), /concurrency/);
});
/** @id TEST-EXECUTOR-003 @verifies REQ-EXECUTOR-003 */
test('TEST-EXECUTOR-003 bounded parallel waves', async () => {
  const clock = new FakeClock(); let active = 0; let peak = 0; const starts: number[] = [];
  const graph = new Graph(['a','b','c','d'].map(id=>({id,deps:[]})));
  const actions = Object.fromEntries(graph.topology().map(id=>[id,async()=> {
    starts.push(clock.now); active++; peak = Math.max(peak,active); await clock.sleep(5); active--; return id;
  }]));
  const pending = new Executor(2,clock).run(graph,actions);
  await clock.advance(10); const result = await pending;
  assert.equal(peak,2); assert.deepEqual(starts,[0,0,5,5]); assert.equal(result.values.size,4);
});
/** @id TEST-EXECUTOR-004 @verifies REQ-EXECUTOR-004 */
test('TEST-EXECUTOR-004 dependency barriers', async () => {
  const clock = new FakeClock(); const starts: string[] = [];
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps:['a']}]);
  const pending = new Executor(2,clock).run(graph,{
    a:async()=>{starts.push(`a:${clock.now}`);await clock.sleep(4);return 7;},
    b:async({inputs})=>{starts.push(`b:${clock.now}`);return Number(inputs.get('a'))+1;}
  });
  await clock.advance(4); const result = await pending;
  assert.deepEqual(starts,['a:0','b:4']); assert.equal(result.values.get('b'),8);
});
/** @id TEST-EXECUTOR-005 @verifies REQ-EXECUTOR-005 */
test('TEST-EXECUTOR-005 isolate failure and skip descendants', async () => {
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:[]}]);
  let called = false;
  const result = await new Executor(2,new FakeClock()).run(graph,{
    a:async()=>{throw new Error('boom');}, b:async()=>{called=true;return 1;}, c:async()=>3
  });
  assert.equal(called,false); assert.equal(result.states.get('a'),'failed');
  assert.equal(result.states.get('b'),'skipped'); assert.equal(result.values.get('c'),3);
});
/** @id TEST-EXECUTOR-006 @verifies REQ-EXECUTOR-006 */
test('TEST-EXECUTOR-006 timestamped state events', async () => {
  const clock = new FakeClock();
  const pending = new Executor(1,clock).run(new Graph([{id:'a',deps:[]}]),{a:async()=>{await clock.sleep(2);return 1;}});
  await clock.advance(2); const result = await pending;
  assert.deepEqual(result.events,[{id:'a',state:'pending',at:0},{id:'a',state:'running',at:0},{id:'a',state:'succeeded',at:2}]);
});
/** @id TEST-EXECUTOR-007 @verifies REQ-EXECUTOR-007 */
test('TEST-EXECUTOR-007 cooperative cancellation', async () => {
  const clock = new FakeClock(); const controller = new AbortController(); let queued = false;
  const pending = new Executor(1,clock).run(new Graph([{id:'a',deps:[]},{id:'b',deps:[]}]),{
    a:async({signal})=>{await clock.sleep(50,signal);return 1;}, b:async()=>{queued=true;return 2;}
  },controller.signal);
  await clock.advance(0); controller.abort(); const result = await pending;
  assert.equal(queued,false); assert.deepEqual([...result.states.values()],['cancelled','cancelled']);
  assert.equal(clock.pending,0);
});
/** @id TEST-EXECUTOR-008 @verifies REQ-EXECUTOR-008 */
test('TEST-EXECUTOR-008 transition contract characterization', () => {
  assert.deepEqual(TRANSITIONS,{
    pending:['running','skipped','cancelled'], running:['succeeded','failed','cancelled'],
    succeeded:[], failed:[], skipped:[], cancelled:[]
  });
});
/** @id TEST-EXECUTOR-009 @verifies REQ-EXECUTOR-009 */
test('TEST-EXECUTOR-009 overlapping advances cannot race time', async () => {
  const clock=new FakeClock();
  const first=clock.advance(5);
  try { await assert.rejects(clock.advance(10), /already advancing/); }
  finally { await first; }
  assert.equal(clock.now,5);
  await clock.advance(2);assert.equal(clock.now,7);
});
/** @id TEST-EXECUTOR-010 @verifies REQ-EXECUTOR-010 */
test('TEST-EXECUTOR-010 long microtask chains preserve deadlines', async () => {
  const clock=new FakeClock();let completedAt=-1;
  const action=(async()=>{
    await clock.sleep(1);
    for(let i=0;i<100;i++)await Promise.resolve();
    await clock.sleep(1);completedAt=clock.now;
  })();
  await clock.advance(10);
  assert.equal(completedAt,2);assert.equal(clock.pending,0);await action;
});
