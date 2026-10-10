import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodec} from '../packages/codec/index.ts';

/** @id TEST-CODEC-010 @verifies REQ-CODEC-010 */
test('TEST-CODEC-010 validate explicit union tag at every nesting level',()=>{
  const union=['int','string'];
  const c=createCodec(union);
  const e=JSON.parse(c.encode(1).toString());
  e.datum.value='wrong branch';
  assert.throws(()=>c.decode(Buffer.from(JSON.stringify(e))), /datum/);
  const nested=createCodec({type:'record',name:'R',fields:[{name:'u',type:union}]});
  const n=JSON.parse(nested.encode({u:1}).toString());
  n.datum.u.value='wrong branch';
  assert.throws(()=>nested.decode(Buffer.from(JSON.stringify(n))), /datum/);
  assert.deepEqual(nested.decode(nested.encode({u:'valid'})),{u:'valid'});
});
