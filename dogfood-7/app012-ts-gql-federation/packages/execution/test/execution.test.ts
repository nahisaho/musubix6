import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../composition/src/index.ts';
import { plan } from '../../planning/src/index.ts';
import { graphs,adapters } from '../../shared/test-fixtures.ts';
import { execute } from '../src/index.ts';
const schema=compose(graphs);

/** @id TEST-EXEC-001 @verifies REQ-EXEC-001 */
test('TEST-EXEC-001 independent roots',async()=>{
  const {services}=adapters();
  const out=await execute(plan(schema,'{ products { name } me { name } }'),services);
  assert.deepEqual(out.data.me,{name:'Ada'});assert.equal((out.data.products as unknown[]).length,3);assert.deepEqual(out.errors,[]);
});
/** @id TEST-EXEC-002 @verifies REQ-EXEC-002 */
test('TEST-EXEC-002 merges entities',async()=>{
  const {services}=adapters();
  const out=await execute(plan(schema,'{ product(id:"1") { name reviews { body } } }'),services);
  assert.deepEqual(out.data.product,{name:'Chair',reviews:[{body:'Review 1'}]});
});
/** @id TEST-EXEC-003 @verifies REQ-EXEC-003 */
test('TEST-EXEC-003 deduplicates representations',async()=>{
  const {services,calls}=adapters();
  const out=await execute(plan(schema,'{ products { reviews { body } } }'),services);
  assert.equal(calls.find(c=>c.kind==='entities')?.reps?.length,2);
  assert.deepEqual(out.data.products,[{reviews:[{body:'Review 1'}]},{reviews:[{body:'Review 2'}]},{reviews:[{body:'Review 1'}]}]);
});
/** @id TEST-EXEC-004 @verifies REQ-EXEC-004 */
test('TEST-EXEC-004 requires in representation',async()=>{
  const {services,calls}=adapters();
  const out=await execute(plan(schema,'{ products { shipping } }'),services);
  assert.deepEqual(out.data.products,[{shipping:8},{shipping:16},{shipping:8}]);
  assert.equal(calls.find(c=>c.kind==='entities')?.reps?.[0].weight,4);
});
/** @id TEST-EXEC-005 @verifies REQ-EXEC-005 */
test('TEST-EXEC-005 hides internal fields and preserves aliases',async()=>{
  const {services}=adapters();
  const out=await execute(plan(schema,'{ catalog:products { title:name cost:shipping } }'),services);
  assert.deepEqual(out.data.catalog,[{title:'Chair',cost:8},{title:'Table',cost:16},{title:'Chair',cost:8}]);
});
/** @id TEST-EXEC-006 @verifies REQ-EXEC-006 */
test('TEST-EXEC-006 root error is partial',async()=>{
  const {services}=adapters();services.products.root=async()=>{throw Error('offline');};
  const out=await execute(plan(schema,'{ products { name } me { name } }'),services);
  assert.equal(out.data.products,null);assert.deepEqual(out.data.me,{name:'Ada'});assert.deepEqual(out.errors[0].path,['products']);
});
/** @id TEST-EXEC-007 @verifies REQ-EXEC-007 */
test('TEST-EXEC-007 null parents skip entity calls',async()=>{
  const {services,calls}=adapters();services.products.root=async()=>null as never;
  const out=await execute(plan(schema,'{ product(id:"x") { reviews { body } } }'),services);
  assert.equal(out.data.product,null);assert.equal(calls.length,0);
});
/** @id TEST-EXEC-008 @verifies REQ-EXEC-008 */
test('TEST-EXEC-008 null entities and failed batches',async()=>{
  const {services}=adapters();services.reviews.entities=async()=>[null] as never;
  const p=plan(schema,'{ product(id:"1") { name shipping } }');
  assert.deepEqual((await execute(p,services)).data.product,{name:'Chair',shipping:null});
  services.reviews.entities=async()=>{throw Error('entity offline');};
  const failed=await execute(p,services);
  assert.deepEqual(failed.data.product,{name:'Chair',shipping:null});assert.deepEqual(failed.errors[0].path,['product']);
});
/** @id TEST-EXEC-009 @verifies REQ-EXEC-009 */
test('TEST-EXEC-009 rejects missing entity key without transport',async()=>{
  const {services,calls}=adapters();
  services.products.root=async()=>({name:'Broken',weight:4});
  const out=await execute(plan(schema,'{ product(id:"x") { name shipping } }'),services);
  assert.deepEqual(out.data.product,{name:'Broken',shipping:null});
  assert.match(out.errors[0].message,/incomplete entity key/);
  assert.deepEqual(out.errors[0].path,['product']);assert.equal(calls.length,0);
});
/** @id TEST-EXEC-010 @verifies REQ-EXEC-009 */
test('TEST-EXEC-010 null or absent hidden keys never fall back to client aliases',async()=>{
  for(const missing of [false,true]){
    const {services,calls}=adapters();
    services.products.root=async(_field,_args,selections)=>{
      return Object.fromEntries(selections.filter(s=>!(missing&&s.name==='id')).map(s=>[s.alias,s.name==='name'?'Broken':s.name==='weight'?4:null]));
    };
    const out=await execute(plan(schema,'{ product(id:"x") { id:name shipping } }'),services);
    assert.deepEqual(out.data.product,{id:'Broken',shipping:null});
    assert.match(out.errors[0].message,/incomplete entity key/);assert.equal(calls.length,0);
  }
});
