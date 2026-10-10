import test from 'node:test';
import assert from 'node:assert/strict';
import {canRead,checkCompatibility} from '../packages/compatibility/index.ts';
const field=(name,type='int')=>({name,type});
const record=(fields)=>({type:'record',name:'Event',fields});
const base=record([field('id')]);

/** @id TEST-COMPATIBILITY-001 @verifies REQ-COMPATIBILITY-001 */
test('TEST-COMPATIBILITY-001 promote writer numerics only in the legal direction',()=>{
  assert.equal(canRead('long','int'),true); assert.equal(canRead('int','long'),false); assert.equal(canRead('double','float'),true);
});

/** @id TEST-COMPATIBILITY-002 @verifies REQ-COMPATIBILITY-002 */
test('TEST-COMPATIBILITY-002 allow reader added fields only with valid defaults',()=>{
  assert.equal(canRead(record([field('id'),{name:'x',type:'string',default:''}]),base),true); assert.equal(canRead(record([field('id'),field('x','string')]),base),false);
});

/** @id TEST-COMPATIBILITY-003 @verifies REQ-COMPATIBILITY-003 */
test('TEST-COMPATIBILITY-003 ignore writer fields absent from the reader',()=>{
  assert.equal(canRead(base,record([field('id'),field('x')])),true);
});

/** @id TEST-COMPATIBILITY-004 @verifies REQ-COMPATIBILITY-004 */
test('TEST-COMPATIBILITY-004 resolve reader field aliases and named record aliases',()=>{
  assert.equal(canRead({type:'record',name:'New',aliases:['Event'],fields:[{name:'key',aliases:['id'],type:'int'}]},base),true);
  assert.equal(canRead(record([{name:'key',aliases:['id'],type:'string'}]),record([field('id'),field('key','string')])),true);
  assert.equal(canRead(record([{name:'other',aliases:['id','key'],type:'int'}]),record([field('id'),field('key')])),false);
});

/** @id TEST-COMPATIBILITY-005 @verifies REQ-COMPATIBILITY-005 */
test('TEST-COMPATIBILITY-005 require every writer union branch to resolve',()=>{
  assert.equal(canRead(['long','string'],['int','string']),true); assert.equal(canRead('long',['int','string']),false);
});

/** @id TEST-COMPATIBILITY-006 @verifies REQ-COMPATIBILITY-006 */
test('TEST-COMPATIBILITY-006 resolve enum symbols using reader enum default',()=>{
  assert.equal(canRead({type:'enum',name:'E',symbols:['A'],default:'A'},{type:'enum',name:'E',symbols:['A','B']}),true); assert.equal(canRead({type:'enum',name:'E',symbols:['A']},{type:'enum',name:'E',symbols:['A','B']}),false);
});

/** @id TEST-COMPATIBILITY-007 @verifies REQ-COMPATIBILITY-007 */
test('TEST-COMPATIBILITY-007 apply backward forward full and none directions',()=>{
  const next=record([field('id','long')]); assert.equal(checkCompatibility(next,[base],'backward').compatible,true); assert.equal(checkCompatibility(next,[base],'forward').compatible,false); assert.equal(checkCompatibility(next,[base],'full').compatible,false); assert.equal(checkCompatibility(next,[base],'none').compatible,true);
});

/** @id TEST-COMPATIBILITY-008 @verifies REQ-COMPATIBILITY-008 */
test('TEST-COMPATIBILITY-008 check all history for transitive modes and reject invalid modes',()=>{
  const a=record([field('id'),field('x')]); const b=base; const c=record([field('id'),{name:'x',type:'string',default:''}]); assert.equal(checkCompatibility(c,[a,b],'backward').compatible,true); assert.equal(checkCompatibility(c,[a,b],'backward-transitive').compatible,false); assert.throws(()=>checkCompatibility(base,[],'bogus'), /mode/);
});
