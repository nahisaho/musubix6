import test from 'node:test';
import assert from 'node:assert/strict';
import {Registry} from '../packages/registry/index.ts';
const field=(name,type='int')=>({name,type});
const record=(fields)=>({type:'record',name:'Event',fields});
const base=record([field('id')]);

/** @id TEST-REGISTRY-001 @verifies REQ-REGISTRY-001 */
test('TEST-REGISTRY-001 register versions with monotonically allocated global IDs',()=>{
  const r=new Registry(); const a=r.register('events',base); const b=r.register('other',base); assert.equal(a.id,1); assert.equal(b.id,1); assert.equal(a.version,1);
});

/** @id TEST-REGISTRY-002 @verifies REQ-REGISTRY-002 */
test('TEST-REGISTRY-002 deduplicate schemas per subject without creating versions',()=>{
  const r=new Registry(); assert.deepEqual(r.register('s',base),r.register('s',{...base,doc:'ignored'})); assert.equal(r.history('s').length,1);
});

/** @id TEST-REGISTRY-003 @verifies REQ-REGISTRY-003 */
test('TEST-REGISTRY-003 reject incompatible writes atomically',()=>{
  const r=new Registry(); r.register('s',base); assert.throws(()=>r.register('s',record([field('id','string')])), /incompatible/); assert.equal(r.history('s').length,1); assert.equal(r.register('t','string').id,2);
});

/** @id TEST-REGISTRY-004 @verifies REQ-REGISTRY-004 */
test('TEST-REGISTRY-004 configure and enforce subject compatibility modes',()=>{
  const r=new Registry(); r.setMode('s','none'); r.register('s',base); assert.equal(r.register('s','string').version,2); assert.throws(()=>r.setMode('s','bogus'), /mode/);
});

/** @id TEST-REGISTRY-005 @verifies REQ-REGISTRY-005 */
test('TEST-REGISTRY-005 return isolated schema snapshots from all read APIs',()=>{
  const r=new Registry(); const input=structuredClone(base); const v=r.register('s',input); input.fields[0].type='string'; v.schema.fields[0].type='boolean'; const got=r.get('s',1); assert.equal(got.schema.fields[0].type,'int'); got.schema.fields[0].type='long'; assert.equal(r.byId(v.id).fields[0].type,'int');
});

/** @id TEST-REGISTRY-006 @verifies REQ-REGISTRY-006 */
test('TEST-REGISTRY-006 support latest explicit versions and informative unknown errors',()=>{
  const r=new Registry(); r.register('s',base); assert.equal(r.get('s').version,1); assert.throws(()=>r.get('s',99), /unknown/); assert.throws(()=>r.byId(99), /unknown/);
});

/** @id TEST-REGISTRY-007 @verifies REQ-REGISTRY-007 */
test('TEST-REGISTRY-007 enforce optimistic expected-version conflicts before deduplication',()=>{
  const r=new Registry(); r.register('s',base,{expectedVersion:0}); assert.throws(()=>r.register('s',base,{expectedVersion:0}), /conflict/); assert.equal(r.register('s',base,{expectedVersion:1}).version,1);
});

/** @id TEST-REGISTRY-008 @verifies REQ-REGISTRY-008 */
test('TEST-REGISTRY-008 validate subject names and preserve case-sensitive isolation',()=>{
  const r=new Registry(); assert.throws(()=>r.register('',base), /subject/); r.register('S',base); r.register('s','string'); assert.equal(r.history('S').length,1); assert.equal(r.history('s').length,1);
});
