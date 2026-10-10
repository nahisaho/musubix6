import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchLoader } from '../src/index.ts';

/** @id TEST-BATCH-001 @verifies REQ-BATCH-001 */
test('TEST-BATCH-001 coalesces ordered loads', async () => {
  const calls: number[][] = [];
  const loader = new BatchLoader<number,number>(async keys => { calls.push([...keys]); return keys.map(x=>x*2); });
  assert.deepEqual(await Promise.all([loader.load(3),loader.load(1)]), [6,2]);
  assert.deepEqual(calls, [[3,1]]);
});
/** @id TEST-BATCH-002 @verifies REQ-BATCH-002 */
test('TEST-BATCH-002 canonical object keys', async () => {
  let count=0;
  const loader = new BatchLoader<object,number>(async keys=>{count+=keys.length;return keys.map(()=>7);});
  const a=loader.load({id:1,org:'x'}), b=loader.load({org:'x',id:1});
  assert.equal(a,b); assert.equal(await b,7); assert.equal(count,1);
});
/** @id TEST-BATCH-003 @verifies REQ-BATCH-003 */
test('TEST-BATCH-003 splits batches', async () => {
  const calls: number[][]=[];
  const loader = new BatchLoader<number,number>(async keys=>{calls.push([...keys]);return [...keys];}, {maxBatchSize:2});
  assert.deepEqual(await Promise.all([1,2,3,4,5].map(x=>loader.load(x))),[1,2,3,4,5]);
  assert.deepEqual(calls,[[1,2],[3,4],[5]]);
  assert.throws(()=>new BatchLoader(async keys=>[...keys],{maxBatchSize:0}),/positive integer/);
});
/** @id TEST-BATCH-004 @verifies REQ-BATCH-004 */
test('TEST-BATCH-004 batch failure evicts for retry', async () => {
  let calls=0;
  const loader = new BatchLoader<number,number>(async keys=>{if(++calls===1)throw Error('offline');return [...keys];});
  await assert.rejects(loader.load(1),/offline/);
  assert.equal(await loader.load(1),1); assert.equal(calls,2);
});
/** @id TEST-BATCH-005 @verifies REQ-BATCH-005 */
test('TEST-BATCH-005 clear refetches', async () => {
  let count=0;
  const loader = new BatchLoader<number,number>(async keys=>keys.map(()=>++count));
  assert.equal(await loader.load(1),1);loader.clear(1);
  assert.equal(await loader.load(1),2);loader.clearAll();
  assert.equal(await loader.load(1),3);
});
/** @id TEST-BATCH-006 @verifies REQ-BATCH-006 */
test('TEST-BATCH-006 prime never overwrites', async () => {
  const loader = new BatchLoader<number,number>(async keys=>[...keys]);
  loader.prime(1,9).prime(1,8); assert.equal(await loader.load(1),9);
});
/** @id TEST-BATCH-007 @verifies REQ-BATCH-007 */
test('TEST-BATCH-007 cardinality errors reject all', async () => {
  const loader = new BatchLoader<number,number>(async ()=>[]);
  const results=await Promise.allSettled([loader.load(1),loader.load(2)]);
  assert.ok(results.every(x=>x.status==='rejected' && /cardinality/.test(x.reason.message)));
});
/** @id TEST-BATCH-008 @verifies REQ-BATCH-008 */
test('TEST-BATCH-008 individual errors isolated', async () => {
  const loader = new BatchLoader<number,number>(async keys=>keys.map(x=>x===1?Error('missing'):x));
  const results=await Promise.allSettled([loader.load(1),loader.load(2)]);
  assert.equal(results[0].status,'rejected'); assert.deepEqual(results[1],{status:'fulfilled',value:2});
});
