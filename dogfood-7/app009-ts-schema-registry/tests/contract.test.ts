import test from 'node:test';
import assert from 'node:assert/strict';
import {MODE_POLICY} from '../packages/compatibility/index.ts';

/** @id TEST-COMPATIBILITY-009 @verifies REQ-COMPATIBILITY-009 */
test('TEST-COMPATIBILITY-009 golden compatibility policy table',()=>{
  assert.deepEqual(MODE_POLICY,{
    none:{backward:false,forward:false,transitive:false},
    backward:{backward:true,forward:false,transitive:false},
    forward:{backward:false,forward:true,transitive:false},
    full:{backward:true,forward:true,transitive:false},
    'backward-transitive':{backward:true,forward:false,transitive:true},
    'forward-transitive':{backward:false,forward:true,transitive:true},
    'full-transitive':{backward:true,forward:true,transitive:true}
  });
});
