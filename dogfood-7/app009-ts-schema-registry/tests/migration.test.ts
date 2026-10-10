import test from 'node:test';
import assert from 'node:assert/strict';
import {planMigration,migrate} from '../packages/migration/index.ts';
import {fingerprint} from '../packages/model/index.ts';
const field=(name,type='int')=>({name,type});
const record=(fields)=>({type:'record',name:'Event',fields});
const base=record([field('id')]);

/** @id TEST-MIGRATION-001 @verifies REQ-MIGRATION-001 */
test('TEST-MIGRATION-001 plan add default drop rename and promote operations',()=>{
  const target=record([{name:'key',aliases:['id'],type:'long'},{name:'label',type:'string',default:'x'}]); const p=planMigration(base,target); assert.equal(p.safe,true); assert.deepEqual(p.steps.map(s=>s.kind),['rename','promote','add']);
});

/** @id TEST-MIGRATION-002 @verifies REQ-MIGRATION-002 */
test('TEST-MIGRATION-002 reject unsafe migrations lacking reader resolution',()=>{
  const p=planMigration(base,record([field('id','string')])); assert.equal(p.safe,false); assert.throws(()=>migrate(p,{id:1}), /unsafe/);
});

/** @id TEST-MIGRATION-003 @verifies REQ-MIGRATION-003 */
test('TEST-MIGRATION-003 execute plans while preserving input immutability',()=>{
  const p=planMigration(base,record([field('id','long'),{name:'x',type:'int',default:0}])); const input={id:5}; assert.deepEqual(migrate(p,input),{id:5,x:0}); assert.deepEqual(input,{id:5});
});

/** @id TEST-MIGRATION-004 @verifies REQ-MIGRATION-004 */
test('TEST-MIGRATION-004 include drop operations for obsolete writer fields',()=>{
  const p=planMigration(record([field('id'),field('x')]),base); assert.equal(p.steps[0].kind,'drop'); assert.deepEqual(migrate(p,{id:1,x:2}),{id:1});
});

/** @id TEST-MIGRATION-005 @verifies REQ-MIGRATION-005 */
test('TEST-MIGRATION-005 support nested record migration',()=>{
  const a=record([{name:'child',type:base}]); const b=record([{name:'child',type:record([field('id','long'),{name:'x',type:'int',default:2}])}]); assert.deepEqual(migrate(planMigration(a,b),{child:{id:1}}),{child:{id:1,x:2}});
});

/** @id TEST-MIGRATION-006 @verifies REQ-MIGRATION-006 */
test('TEST-MIGRATION-006 produce deterministic auditable fingerprints',()=>{
  const p=planMigration(base,base); assert.equal(p.from,fingerprint(base)); assert.equal(p.to,fingerprint(base)); assert.deepEqual(p,planMigration(base,base));
});

/** @id TEST-MIGRATION-007 @verifies REQ-MIGRATION-007 */
test('TEST-MIGRATION-007 validate source data before applying migration',()=>{
  assert.throws(()=>migrate(planMigration(base,base),{id:'wrong'}), /datum/);
});

/** @id TEST-MIGRATION-008 @verifies REQ-MIGRATION-008 */
test('TEST-MIGRATION-008 snapshot schemas so plans cannot follow caller mutation',()=>{
  const a=structuredClone(base); const p=planMigration(a,base); a.fields[0].type='string'; assert.deepEqual(migrate(p,{id:2}),{id:2});
});
