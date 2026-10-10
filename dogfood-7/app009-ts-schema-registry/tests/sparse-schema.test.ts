import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema} from '../packages/model/index.ts';
import {Registry} from '../packages/registry/index.ts';

/** @id TEST-MODEL-010 @verifies REQ-MODEL-010 */
test('TEST-MODEL-010 reject sparse schema collections atomically',()=>{
  const sparse=new Array(1);
  const schemas=[
    sparse, ['int',...[]].concat(new Array(1)),
    {type:'enum',name:'E',symbols:sparse},
    {type:'record',name:'R',fields:[],aliases:sparse},
    {type:'record',name:'R',fields:[{name:'id',type:'int',aliases:sparse}]}
  ];
  const r=new Registry(); r.register('s','int');
  for(const schema of schemas) {
    assert.throws(()=>validateSchema(schema), /schema/);
    assert.throws(()=>r.register('s',schema), /schema/);
  }
  assert.equal(r.history('s').length,1);
  assert.equal(r.register('t','string').id,2);
});
