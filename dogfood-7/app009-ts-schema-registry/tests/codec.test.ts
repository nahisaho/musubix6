import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodec} from '../packages/codec/index.ts';
const field=(name,type='int')=>({name,type});
const record=(fields)=>({type:'record',name:'Event',fields});
const base=record([field('id')]);

/** @id TEST-CODEC-001 @verifies REQ-CODEC-001 */
test('TEST-CODEC-001 round-trip schema-valid records through generated codecs',()=>{
  const c=createCodec(base); assert.deepEqual(c.decode(c.encode({id:7})),{id:7});
});

/** @id TEST-CODEC-002 @verifies REQ-CODEC-002 */
test('TEST-CODEC-002 reject invalid datum before encoding',()=>{
  const c=createCodec(base); assert.throws(()=>c.encode({id:'x'}), /datum/); assert.throws(()=>c.encode({id:2147483648}), /datum/);
});

/** @id TEST-CODEC-003 @verifies REQ-CODEC-003 */
test('TEST-CODEC-003 reject malformed envelopes and mismatched schema fingerprints',()=>{
  const c=createCodec(base); assert.throws(()=>c.decode(Buffer.from('oops')), /envelope/); assert.throws(()=>c.decode(createCodec('string').encode('x')), /fingerprint/);
});

/** @id TEST-CODEC-004 @verifies REQ-CODEC-004 */
test('TEST-CODEC-004 round-trip bytes and container values losslessly',()=>{
  const s=record([{name:'data',type:'bytes'},{name:'tags',type:{type:'array',items:'string'}},{name:'counts',type:{type:'map',values:'int'}}]); const d={data:Buffer.from([0,255]),tags:['x'],counts:{a:2}}; const c=createCodec(s); assert.deepEqual(c.decode(c.encode(d)),d);
});

/** @id TEST-CODEC-005 @verifies REQ-CODEC-005 */
test('TEST-CODEC-005 apply isolated record defaults without mutating input',()=>{
  const s=record([{name:'xs',type:{type:'array',items:'int'},default:[]}]); const c=createCodec(s); const input={}; const a=c.decode(c.encode(input)); a.xs.push(1); assert.deepEqual(c.decode(c.encode({})),{xs:[]}); assert.deepEqual(input,{});
});

/** @id TEST-CODEC-006 @verifies REQ-CODEC-006 */
test('TEST-CODEC-006 resolve reader schemas using aliases defaults and numeric promotions',()=>{
  const reader=record([{name:'key',aliases:['id'],type:'long'},{name:'label',type:'string',default:'n'}]); assert.deepEqual(createCodec(reader).decode(createCodec(base).encode({id:3}),base),{key:3,label:'n'});
});

/** @id TEST-CODEC-007 @verifies REQ-CODEC-007 */
test('TEST-CODEC-007 preserve null and union branch values',()=>{
  const c=createCodec(['null','string','int']); for(const v of [null,'x',8]) assert.deepEqual(c.decode(c.encode(v)),v);
  const overlap=createCodec(['int','long']); const wire=overlap.encode(3);
  assert.equal(JSON.parse(wire.toString()).datum.branch,0);
  assert.equal(createCodec('long').decode(wire,['int','long']),3);
  const first={...record([field('id'),{name:'tag',type:'string',default:'first'}]),name:'First',aliases:['Event']};
  const second={...record([field('id'),{name:'tag',type:'string',default:'second'}]),name:'Second',aliases:['Event']};
  assert.deepEqual(createCodec([first,second]).decode(createCodec(base).encode({id:1}),base),{id:1,tag:'first'});
});

/** @id TEST-CODEC-008 @verifies REQ-CODEC-008 */
test('TEST-CODEC-008 reject tampered decoded datum and unknown envelope fields',()=>{
  const c=createCodec(base); const e=JSON.parse(c.encode({id:1}).toString()); e.datum.id='bad'; assert.throws(()=>c.decode(Buffer.from(JSON.stringify(e))), /datum/); e.datum.id=1; e.extra=true; assert.throws(()=>c.decode(Buffer.from(JSON.stringify(e))), /envelope/);
});

/** @id TEST-CODEC-009 @verifies REQ-CODEC-009 */
test('TEST-CODEC-009 reject sparse array datum before encoding',()=>{
  const c=createCodec({type:'array',items:'int'});
  assert.throws(()=>c.encode(new Array(2)), /datum/);
  const partial=[1]; partial.length=3;
  assert.throws(()=>c.encode(partial), /datum/);
  assert.deepEqual(c.decode(c.encode([1,2])),[1,2]);
});
