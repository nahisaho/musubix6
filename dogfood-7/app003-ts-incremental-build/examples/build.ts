import assert from 'node:assert/strict';
import { Engine } from '@build/engine';
import { DynamicEngine } from '@build/dynamic';
import { FakeClock } from '@build/executor';

const clock=new FakeClock();
let source='export const answer = 42';
const engine=new Engine([
  {id:'source',deps:[],version:'1',run:()=>source},
  {id:'compile',deps:['source'],version:'compiler-v1',run:async({inputs,signal})=>{
    await clock.sleep(5,signal);return String(inputs.source).replace(/\s+/g,' ');
  }},
  {id:'bundle',deps:['compile'],version:'bundler-v1',run:({inputs})=>`${inputs.compile};`}
],{clock,concurrency:2});
const initial=engine.build(['bundle']);await clock.advance(5);
console.log('initial:',(await initial).executed);
console.log('unchanged:',(await engine.build(['bundle'])).reused);
source='export  const answer = 42';engine.update('source','2');
const changed=engine.build(['bundle']);await clock.advance(5);
const cutoff=await changed;
assert.deepEqual(cutoff.executed,['source','compile']);
assert.deepEqual(cutoff.reused,['bundle']);
console.log('whitespace-only source edit:',{executed:cutoff.executed,earlyCutoff:cutoff.reused});

const dynamic=new DynamicEngine([
  {id:'config',deps:[],version:'1',run:()=>({entry:'module'})},
  {id:'module',deps:[],version:'1',run:()=>({code:'hello'})},
  {id:'package',deps:['config'],version:'1',run:({inputs,read})=>{
    const config=inputs.config as {entry:string};
    return read(config.entry);
  }}
]);
const discovered=await dynamic.build(['package']);
assert.equal(discovered.rounds,2);
console.log('dynamic:',{artifact:discovered.artifacts.package!.value,edges:dynamic.dependencies('package')});
