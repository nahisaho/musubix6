import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../composition/src/index.ts';
import { graphs } from '../../shared/test-fixtures.ts';
import { plan } from '../src/index.ts';
import { execute } from '../../execution/src/index.ts';
import { adapters,select } from '../../shared/test-fixtures.ts';
const schema=compose(graphs);

/** @id TEST-PLAN-001 @verifies REQ-PLAN-001 */
test('TEST-PLAN-001 separates roots',()=>{
  const p=plan(schema,'{ products { name } me { name } }');
  assert.deepEqual(p.steps.map(s=>s.service),['products','users']);
});
/** @id TEST-PLAN-002 @verifies REQ-PLAN-002 */
test('TEST-PLAN-002 dependent entity fetch',()=>{
  const p=plan(schema,'{ products { name reviews { body } } }');
  assert.equal(p.steps[1].kind,'entity');assert.deepEqual(p.steps[1].dependsOn,[0]);assert.deepEqual(p.steps[1].path,['products']);
});
/** @id TEST-PLAN-003 @verifies REQ-PLAN-003 */
test('TEST-PLAN-003 injects hidden key',()=>{
  const p=plan(schema,'{ products { reviews { body } } }');
  assert.ok(p.steps[0].selections.some(s=>s.name==='id'));
  assert.deepEqual(p.steps[1].key,{id:{}});
  assert.ok(!p.selections[0].selections.some(s=>s.name==='id'));
});
/** @id TEST-PLAN-004 @verifies REQ-PLAN-004 */
test('TEST-PLAN-004 injects requires upstream',()=>{
  const p=plan(schema,'{ products { shipping } }');
  assert.ok(p.steps[0].selections.some(s=>s.name==='weight'));
  assert.deepEqual(p.steps[1].requires,{weight:{}});
});
/** @id TEST-PLAN-005 @verifies REQ-PLAN-005 */
test('TEST-PLAN-005 aliases preserve paths',()=>{
  const p=plan(schema,'{ catalog: products { feedback: reviews { body } } }');
  assert.deepEqual(p.steps[1].path,['catalog']);
  assert.equal(p.steps[1].selections[0].alias,'feedback');
});
/** @id TEST-PLAN-006 @verifies REQ-PLAN-006 */
test('TEST-PLAN-006 fragments expanded',()=>{
  const p=plan(schema,'{ products { ...Details ... on Product { name } } } fragment Details on Product { reviews { body } }');
  assert.equal(p.steps.length,2);assert.equal(p.selections[0].selections.length,2);
  assert.throws(()=>plan(schema,'{ products { ...X } } fragment X on Product { ...X }'),/fragment cycle/);
});
/** @id TEST-PLAN-007 @verifies REQ-PLAN-007 */
test('TEST-PLAN-007 resolves variables and defaults',()=>{
  assert.deepEqual(plan(schema,'query P($id: ID!) { product(id:$id) { name } }',{id:'2'}).steps[0].args,{id:'2'});
  assert.deepEqual(plan(schema,'query P($id: ID = "1") { product(id:$id) { name } }').steps[0].args,{id:'1'});
  assert.deepEqual(plan(schema,'{ product(id:"2") { name } }').steps[0].args,{id:'2'});
});
/** @id TEST-PLAN-008 @verifies REQ-PLAN-008 */
test('TEST-PLAN-008 rejects invalid queries',()=>{
  for(const query of ['{ products { unknown } }','{ products { name }','{ products }','{ products { name { x } } }','{ same:products { name } same:me { name } }']){
    assert.throws(()=>plan(schema,query),/unknown field|syntax|selection|alias conflict/);
  }
});
/** @id TEST-PLAN-009 @verifies REQ-PLAN-009 */
test('TEST-PLAN-009 key alias collisions do not overwrite client data',async()=>{
  const {services}=adapters();
  const out=await execute(plan(schema,'{ products { id:name shipping } }'),services);
  assert.deepEqual(out.data.products,[{id:'Chair',shipping:8},{id:'Table',shipping:16},{id:'Chair',shipping:8}]);
});
/** @id TEST-PLAN-010 @verifies REQ-PLAN-010 */
test('TEST-PLAN-010 multi-hop requires revisit a service',async()=>{
  const s=compose([
    {name:'a',sdl:'type Query { p: P } type P @key(fields:"id") { id: ID! }'},
    {name:'b',sdl:'type P @key(fields:"id") { id: ID! @external x: Int z: Int @requires(fields:"y") y: Int @external }'},
    {name:'c',sdl:'type P @key(fields:"id") { id: ID! @external x: Int @external y: Int @requires(fields:"x") }'}
  ]);
  const out=await execute(plan(s,'{ p { z } }'),{
    a:{root:async(_f,_a,selections)=>select({id:'1'},selections),entities:async()=>[]},
    b:{root:async()=>null,entities:async(_t,reps,selections)=>reps.map(r=>select({x:2,z:Number(r.y)+1},selections))},
    c:{root:async()=>null,entities:async(_t,reps,selections)=>reps.map(r=>select({y:Number(r.x)*3},selections))}
  });
  assert.deepEqual(out.data,{p:{z:7}});
});
/** @id TEST-PLAN-011 @verifies REQ-PLAN-011 */
test('TEST-PLAN-011 waits for nested remote prerequisites',async()=>{
  const s=compose([
    {name:'a',sdl:'type Query { p: P } type P @key(fields:"id") { id: ID! detail: Detail } type Detail @key(fields:"id") { id: ID! }'},
    {name:'b',sdl:'type P @key(fields:"id") { id: ID! @external detail: Detail @external shipping: Int @requires(fields:"detail { weight }") }'},
    {name:'c',sdl:'type Detail @key(fields:"id") { id: ID! @external weight: Int }'}
  ]);
  const out=await execute(plan(s,'{ p { shipping } }'),{
    a:{root:async(_f,_a,selections)=>select({id:'p',detail:{id:'d'}},selections),entities:async()=>[]},
    b:{root:async()=>null,entities:async(_t,reps,selections)=>reps.map(r=>select({shipping:Number((r.detail as Record<string,unknown>).weight)*2},selections))},
    c:{root:async()=>null,entities:async(_t,reps,selections)=>{await new Promise(r=>setTimeout(r,10));return reps.map(()=>select({weight:5},selections));}}
  });
  assert.deepEqual(out.data,{p:{shipping:10}});
});
