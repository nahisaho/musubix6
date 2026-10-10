import assert from 'node:assert/strict';
import {Registry} from '@schema/registry';
import {createCodec} from '@schema/codec';
import {planMigration,migrate} from '@schema/migration';
import type {Schema} from '@schema/model';

const v1: Schema={type:'record',name:'Event',fields:[{name:'id',type:'int'}]};
const v2: Schema={type:'record',name:'Event',fields:[
  {name:'id',type:'long'},{name:'tag',type:'string',default:'untagged'}
]};
const v3: Schema={type:'record',name:'Event',fields:[
  {name:'key',aliases:['id'],type:'long'},
  {name:'tag',type:'string',default:'untagged'},
  {name:'labels',type:{type:'array',items:'string'},default:[]}
]};
const registry=new Registry();
registry.setMode('events','backward-transitive');
const first=registry.register('events',v1,{expectedVersion:0});
registry.register('events',v2,{expectedVersion:1});
const latest=registry.register('events',v3,{expectedVersion:2});
assert.throws(()=>registry.register('events','string'), /incompatible/);
assert.throws(()=>registry.register('events',v3,{expectedVersion:1}), /conflict/);
const encoded=createCodec(first.schema).encode({id:42});
const decoded=createCodec(latest.schema).decode(encoded,registry.byId(first.id));
const plan=planMigration(first.schema,latest.schema);
assert.deepEqual(migrate(plan,{id:42}),decoded);
assert.deepEqual(decoded,{key:42,tag:'untagged',labels:[]});
assert.equal(registry.history('events').length,3);
console.log(JSON.stringify({versions:3,steps:plan.steps,data:decoded},null,2));
