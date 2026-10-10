import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema,canonical,fingerprint,validValue} from '../packages/model/index.ts';
const field=(name,type='int')=>({name,type});
const record=(fields)=>({type:'record',name:'Event',fields});
const base=record([field('id')]);

/** @id TEST-MODEL-001 @verifies REQ-MODEL-001 */
test('TEST-MODEL-001 validate primitives and named records',()=>{
  assert.equal(validateSchema(base), true); assert.equal(validateSchema('string'), true);
});

/** @id TEST-MODEL-002 @verifies REQ-MODEL-002 */
test('TEST-MODEL-002 reject unknown types and duplicate fields',()=>{
  assert.throws(() => validateSchema('wat'), /schema/); assert.throws(() => validateSchema(record([field('x'), field('x')])), /duplicate/);
});

/** @id TEST-MODEL-003 @verifies REQ-MODEL-003 */
test('TEST-MODEL-003 validate defaults against the first union branch',()=>{
  assert.throws(() => validateSchema(record([{name:'x',type:['null','string'],default:'x'}])), /default/); assert.equal(validateSchema(record([{name:'x',type:['null','string'],default:null}])), true);
});

/** @id TEST-MODEL-004 @verifies REQ-MODEL-004 */
test('TEST-MODEL-004 canonicalize object key order without changing field order',()=>{
  assert.equal(canonical({...base,doc:'a'}), canonical({...base,doc:'b'})); assert.notEqual(canonical(record([field('a'),field('b')])), canonical(record([field('b'),field('a')])));
});

/** @id TEST-MODEL-005 @verifies REQ-MODEL-005 */
test('TEST-MODEL-005 fingerprint schemas by canonical SHA256',()=>{
  assert.match(fingerprint(base), /^[a-f0-9]{64}$/); assert.equal(fingerprint({...base,doc:'x'}),fingerprint(base));
  assert.notEqual(fingerprint(record([{name:'x',type:'int',default:0}])), fingerprint(record([{name:'x',type:'int',default:1}])));
  assert.notEqual(fingerprint(base),fingerprint({...base,aliases:['Old']}));
});

/** @id TEST-MODEL-006 @verifies REQ-MODEL-006 */
test('TEST-MODEL-006 validate arrays maps and enum symbols',()=>{
  assert.equal(validateSchema({type:'array',items:'int'}),true); assert.equal(validateSchema({type:'map',values:'string'}),true); assert.throws(()=>validateSchema({type:'enum',name:'E',symbols:['x','x']}), /enum/);
});

/** @id TEST-MODEL-007 @verifies REQ-MODEL-007 */
test('TEST-MODEL-007 validate datum including integer boundaries and finite floats',()=>{
  assert.equal(validValue('int',2147483647),true); assert.equal(validValue('int',2147483648),false); assert.equal(validValue('double',Infinity),false); assert.equal(validValue(base,{id:1}),true);
});

/** @id TEST-MODEL-008 @verifies REQ-MODEL-008 */
test('TEST-MODEL-008 bound schema depth and reject cyclic schemas',()=>{
  const cyclic={type:'array'}; cyclic.items=cyclic; assert.throws(()=>validateSchema(cyclic), /depth|cycle/); assert.throws(()=>validateSchema({type:'record',name:'bad-name',fields:[]}), /name/);
});

/** @id TEST-MODEL-009 @verifies REQ-MODEL-009 */
test('TEST-MODEL-009 preserve doc keys within map defaults',()=>{
  const a=record([{name:'meta',type:{type:'map',values:'string'},default:{doc:'first'}}]);
  const b=record([{name:'meta',type:{type:'map',values:'string'},default:{doc:'second'}}]);
  assert.notEqual(fingerprint(a),fingerprint(b));
  assert.equal(JSON.parse(canonical(a)).fields[0].default.doc,'first');
});
