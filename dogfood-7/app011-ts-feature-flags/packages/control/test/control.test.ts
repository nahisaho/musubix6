import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigStore, diffSnapshots, verifyAudit } from '../src/index.ts';
const flag = (key='checkout') => ({key,enabled:true,defaultValue:false,rules:[]});

/** @id TEST-CTL-001 @verifies REQ-CTL-001 */
test('TEST-CTL-001 single revision per transaction', () => {
  const store=new ConfigStore();
  assert.equal(store.transact(0,'alice',[{op:'putFlag',flag:flag()},{op:'putFlag',flag:flag('search')}]).revision,1);
  assert.equal(store.snapshot().flags.length,2);
});
/** @id TEST-CTL-002 @verifies REQ-CTL-002 */
test('TEST-CTL-002 stale CAS is side-effect free', () => {
  const store=new ConfigStore();
  store.transact(0,'alice',[{op:'putFlag',flag:flag()}]);
  const before=store.snapshot(), audit=store.audit();
  assert.throws(()=>store.transact(0,'bob',[{op:'deleteFlag',key:'checkout'}]),/conflict/i);
  assert.deepEqual(store.snapshot(),before);
  assert.deepEqual(store.audit(),audit);
});
/** @id TEST-CTL-003 @verifies REQ-CTL-003 */
test('TEST-CTL-003 all mutations atomic', () => {
  const store=new ConfigStore();
  assert.throws(()=>store.transact(0,'a',[
    {op:'putFlag',flag:flag()},{op:'putFlag',flag:{...flag('bad'),rules:[{when:'invalid',value:true}]}}
  ]),/syntax/i);
  assert.equal(store.snapshot().revision,0);
  assert.equal(store.snapshot().flags.length,0);
  assert.equal(store.audit().length,0);
});
/** @id TEST-CTL-004 @verifies REQ-CTL-004 */
test('TEST-CTL-004 clone isolation', () => {
  const store=new ConfigStore(), config={...flag(),defaultValue:{color:'blue'}};
  store.transact(0,'a',[{op:'putFlag',flag:config}]);
  config.defaultValue.color='red';
  const snapshot=store.snapshot();
  (snapshot.flags[0].defaultValue as {color:string}).color='green';
  assert.deepEqual(store.snapshot().flags[0].defaultValue,{color:'blue'});
});
/** @id TEST-CTL-005 @verifies REQ-CTL-005 */
test('TEST-CTL-005 attributed chained audit', () => {
  const store=new ConfigStore(()=>100);
  store.transact(0,'alice',[{op:'putFlag',flag:flag()}]);
  store.transact(1,'bob',[{op:'deleteFlag',key:'checkout'}]);
  const audit=store.audit();
  assert.equal(audit[1].actor,'bob');
  assert.equal(audit[1].previousHash,audit[0].hash);
  assert.equal(audit[1].timestamp,100);
  assert.equal(verifyAudit(audit),true);
});
/** @id TEST-CTL-006 @verifies REQ-CTL-006 */
test('TEST-CTL-006 tamper detection', () => {
  const store=new ConfigStore();
  store.transact(0,'alice',[{op:'putFlag',flag:flag()}]);
  const audit=store.audit();
  audit[0].actor='mallory';
  assert.equal(verifyAudit(audit),false);
  assert.equal(verifyAudit(store.audit()),true);
});
/** @id TEST-CTL-007 @verifies REQ-CTL-007 */
test('TEST-CTL-007 deterministic snapshot diff', () => {
  const store=new ConfigStore();
  store.transact(0,'a',[{op:'putFlag',flag:flag('b')},{op:'putFlag',flag:flag('c')}]);
  const before=store.snapshot();
  store.transact(1,'a',[{op:'deleteFlag',key:'b'},{op:'putFlag',flag:{...flag('c'),enabled:false}},{op:'putFlag',flag:flag('a')}]);
  assert.deepEqual(diffSnapshots(before,store.snapshot()).map((d:{path:string;op:string})=>[d.path,d.op]),
    [['flags/a','add'],['flags/b','remove'],['flags/c','change']]);
});
/** @id TEST-CTL-008 @verifies REQ-CTL-008 */
test('TEST-CTL-008 semantic key reorder', () => {
  const before={revision:1,flags:[{...flag(),defaultValue:{a:1,b:2}}],segments:[]};
  const after={revision:2,flags:[{...flag(),defaultValue:{b:2,a:1}}],segments:[]};
  assert.deepEqual(diffSnapshots(before,after),[]);
});
/** @id TEST-CTL-009 @verifies REQ-CTL-009 */
test('TEST-CTL-009 validate full published graph', () => {
  const store=new ConfigStore();
  store.transact(0,'a',[{op:'putSegment',segment:{id:'beta'}},{op:'putFlag',flag:{...flag(),rules:[{segment:'beta',value:true}]}}]);
  assert.throws(()=>store.transact(1,'a',[{op:'deleteSegment',id:'beta'}]),/unknown/i);
  assert.throws(()=>store.transact(1,'a',[{op:'putFlag',flag:{...flag(),rollout:{percentage:101,value:true}}}]),/percentage/i);
  assert.equal(store.snapshot().revision,1);
});
/** @id TEST-CTL-010 @verifies REQ-CTL-010 */
test('TEST-CTL-010 overwritten invalid mutations still rejected', () => {
  const store=new ConfigStore();
  const before=store.snapshot(), audit=store.audit();
  assert.throws(()=>store.transact(0,'a',[
    {op:'putFlag',flag:{...flag(),enabled:'not-boolean'} as unknown as ReturnType<typeof flag>},
    {op:'putFlag',flag:flag()}
  ]), /invalid/i);
  assert.deepEqual(store.snapshot(),before);
  assert.deepEqual(store.audit(),audit);
  assert.throws(()=>store.transact(0,'a',[
    {op:'putFlag',flag:{...flag(),rules:[{when:'broken',value:1}]}},
    {op:'deleteFlag',key:'checkout'}
  ]), /syntax/i);
  assert.deepEqual(store.snapshot(),before);
  assert.deepEqual(store.audit(),audit);
  assert.throws(()=>store.transact(0,'a',[
    {op:'putSegment',segment:{id:'bad',rules:['broken']}},
    {op:'deleteSegment',id:'bad'}
  ]), /syntax/i);
  assert.deepEqual(store.snapshot(),before);
  assert.deepEqual(store.audit(),audit);
});
