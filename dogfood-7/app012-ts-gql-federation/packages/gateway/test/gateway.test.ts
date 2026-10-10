import test from 'node:test';
import assert from 'node:assert/strict';
import { graphs,adapters } from '../../shared/test-fixtures.ts';
import { Gateway } from '../src/index.ts';
const inputs=()=>{const {services}=adapters();return graphs.map(g=>({...g,service:services[g.name as keyof typeof services]}));};

/** @id TEST-GATE-001 @verifies REQ-GATE-001 */
test('TEST-GATE-001 full federation',async()=>{
  const gateway=new Gateway(inputs());
  assert.deepEqual((await gateway.execute('{ product(id:"2") { name shipping reviews { body } } }')).data!.product,{name:'Table',shipping:16,reviews:[{body:'Review 2'}]});
});
/** @id TEST-GATE-002 @verifies REQ-GATE-002 */
test('TEST-GATE-002 bounded LRU plans',async()=>{
  const gateway=new Gateway(inputs(),{maxPlans:2});
  await gateway.execute('{ me { name } }');await gateway.execute('{ me { name } }');
  assert.equal(gateway.health().planBuilds,1);
  await gateway.execute('{ products { name } }');await gateway.execute('{ products { price } }');
  assert.equal(gateway.health().cachedPlans,2);await gateway.execute('{ me { name } }');
  assert.equal(gateway.health().planBuilds,4);
});
/** @id TEST-GATE-003 @verifies REQ-GATE-003 */
test('TEST-GATE-003 variable isolation',async()=>{
  const gateway=new Gateway(inputs()), query='query P($id: ID!) { product(id:$id) { name } }';
  assert.deepEqual((await gateway.execute(query,{id:'1'})).data!.product,{name:'Chair'});
  assert.deepEqual((await gateway.execute(query,{id:'2'})).data!.product,{name:'Table'});
});
/** @id TEST-GATE-004 @verifies REQ-GATE-004 */
test('TEST-GATE-004 update invalidates plans',async()=>{
  const gateway=new Gateway(inputs());await gateway.execute('{ me { name } }');
  const next=inputs();next[2].service={...next[2].service,root:async()=>({name:'Grace'})};
  gateway.update(next);assert.equal(gateway.health().cachedPlans,0);
  assert.deepEqual((await gateway.execute('{ me { name } }')).data!.me,{name:'Grace'});assert.equal(gateway.health().version,2);
});
/** @id TEST-GATE-005 @verifies REQ-GATE-005 */
test('TEST-GATE-005 rejected update is atomic',async()=>{
  const gateway=new Gateway(inputs());
  assert.throws(()=>gateway.update([...inputs(),{name:'bad',sdl:'type Query { me: Int }',service:inputs()[0].service}]),/conflict/);
  assert.deepEqual((await gateway.execute('{ me { name } }')).data!.me,{name:'Ada'});assert.equal(gateway.health().version,1);
});
/** @id TEST-GATE-006 @verifies REQ-GATE-006 */
test('TEST-GATE-006 validation returns public error',async()=>{
  const gateway=new Gateway(inputs());const out=await gateway.execute('{ unknown }');
  assert.equal(out.data,null);assert.match(out.errors[0].message,/unknown field/);
});
/** @id TEST-GATE-007 @verifies REQ-GATE-007 */
test('TEST-GATE-007 concurrent entity caches are local',async()=>{
  const {services,calls}=adapters();const gateway=new Gateway(graphs.map(g=>({...g,service:services[g.name as keyof typeof services]})));
  const [a,b]=await Promise.all([gateway.execute('{ products { shipping } }'),gateway.execute('{ products { shipping } }')]);
  assert.deepEqual(a,b);assert.equal(calls.filter(c=>c.kind==='entities').length,2);
});
/** @id TEST-GATE-008 @verifies REQ-GATE-008 */
test('TEST-GATE-008 health snapshot',()=>{
  const gateway=new Gateway(inputs());assert.deepEqual(gateway.health(),{version:1,subgraphs:['products','reviews','users'],cachedPlans:0,planBuilds:0});
});
/** @id TEST-GATE-009 @verifies REQ-GATE-009 */
test('TEST-GATE-009 argument snapshots resist caller and adapter mutation',async()=>{
  const service={
    root:async(_field:string,args:Record<string,unknown>)=>{
      const ids=args.ids as string[],value=ids[0];ids[0]='adapter-mutated';return value;
    },entities:async()=>[]
  };
  const gateway=new Gateway([{name:'a',sdl:'type Query { echo(ids: [ID]): String }',service}]);
  const query='query P($ids: [ID]) { echo(ids:$ids) }',vars={ids:['original']};
  assert.equal((await gateway.execute(query,vars)).data!.echo,'original');
  vars.ids[0]='caller-mutated';
  assert.equal((await gateway.execute(query,{ids:['original']})).data!.echo,'original');
});
