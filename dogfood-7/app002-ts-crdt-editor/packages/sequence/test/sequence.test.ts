import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequence, validateOperation, type Operation } from '@crdt/sequence';
const ins = (actor: string, seq: number, after: string, value: string, time = seq): Operation =>
  ({kind:'insert', id:{actor,seq}, time, deps:{}, after, value});
const hide = (actor: string, seq: number, target: string): Operation =>
  ({kind:'hide', id:{actor,seq}, time:seq, deps:{}, target, tag:`${actor}:${seq}`});
const show = (actor: string, seq: number, target: string, tag: string): Operation =>
  ({kind:'show', id:{actor,seq}, time:seq, deps:{}, target, tag});

/** @id TEST-SEQ-001 @verifies REQ-SEQ-001 */
test('TEST-SEQ-001 chain and Unicode', () => {
  const s = new Sequence();
  s.apply(ins('a',1,'HEAD','A')); s.apply(ins('a',2,'a:1','😀')); s.apply(ins('a',3,'a:2','B'));
  assert.equal(s.text(), 'A😀B'); assert.deepEqual(s.visibleIds(), ['a:1','a:2','a:3']);
});
/** @id TEST-SEQ-002 @verifies REQ-SEQ-002 */
test('TEST-SEQ-002 total sibling order independent of arrival', () => {
  const ops = [ins('a',10,'HEAD','a',10),ins('b',1,'HEAD','b',11),ins('c',1,'HEAD','c',11)];
  const a = new Sequence(), b = new Sequence();
  ops.forEach(o => a.apply(o)); ops.toReversed().forEach(o => b.apply(o));
  assert.equal(a.text(),'cba'); assert.equal(b.text(),a.text());
});
/** @id TEST-SEQ-003 @verifies REQ-SEQ-003 */
test('TEST-SEQ-003 duplicates return false', () => {
  const s = new Sequence(), op = ins('a',1,'HEAD','x');
  assert.equal(s.apply(op),true); assert.equal(s.apply(structuredClone(op)),false); assert.equal(s.text(),'x');
});
/** @id TEST-SEQ-004 @verifies REQ-SEQ-004 */
test('TEST-SEQ-004 tombstone preserves descendants', () => {
  const s = new Sequence();
  [ins('a',1,'HEAD','a'),ins('a',2,'a:1','b'),hide('b',1,'a:1')].forEach(o=>s.apply(o));
  assert.equal(s.text(),'b'); assert.deepEqual(s.allIds(),['a:1','a:2']);
});
/** @id TEST-SEQ-005 @verifies REQ-SEQ-005 */
test('TEST-SEQ-005 tag-scoped restore', () => {
  const s = new Sequence();
  [ins('a',1,'HEAD','x'),hide('b',1,'a:1'),hide('c',1,'a:1'),show('b',2,'a:1','b:1')].forEach(o=>s.apply(o));
  assert.equal(s.text(),'');
  s.apply(show('c',2,'a:1','c:1')); assert.equal(s.text(),'x');
});
/** @id TEST-SEQ-006 @verifies REQ-SEQ-006 */
test('TEST-SEQ-006 out-of-order nodes and removed tags', () => {
  const ops = [ins('a',1,'HEAD','a'),ins('a',2,'a:1','b'),hide('b',1,'a:1'),show('b',2,'a:1','b:1')];
  const a = new Sequence(), b = new Sequence();
  ops.forEach(o=>a.apply(o)); ops.toReversed().forEach(o=>b.apply(o));
  assert.equal(a.text(),'ab'); assert.equal(b.text(),'ab'); assert.deepEqual(a.export(),b.export());
});
/** @id TEST-SEQ-007 @verifies REQ-SEQ-007 */
test('TEST-SEQ-007 validates wire contract atomically', () => {
  const s = new Sequence(), op = ins('a',1,'HEAD','x'); s.apply(op);
  const invalid: unknown[] = [
    null, {...op,id:{actor:'a:b',seq:2}}, {...op,id:{actor:'__proto__',seq:2}},
    {...op,id:{actor:'a',seq:0}}, {...op,time:Infinity}, {...op,value:'ab'},
    {...op,value:''}, {...op,deps:{a:-1}}, {...op,deps:{a:0.5}},
    {...op,after:'invalid'}, {...op,after:'a:1'}, {...op,extra:true},
    {...hide('b',1,'a:1'),tag:'c:1'}, {...op,value:'y'},
    {...show('c',1,'a:1','b:1'),tag:'HEAD'}
  ];
  for (const bad of invalid) assert.throws(()=>s.apply(bad as Operation));
  assert.equal(s.text(),'x'); assert.equal(s.export().length,1);
  assert.throws(()=>validateOperation({...op,deps:[]}));
  const cycle = new Sequence(); cycle.apply(ins('a',1,'b:1','a'));
  assert.throws(()=>cycle.apply(ins('b',1,'a:1','b'))); assert.equal(cycle.export().length,1);
});
/** @id TEST-SEQ-008 @verifies REQ-SEQ-008 */
test('TEST-SEQ-008 immutable canonical roundtrip', () => {
  const s = new Sequence(), op = ins('a',1,'HEAD','😀'); s.apply(op);
  if (op.kind === 'insert') op.value = 'z';
  const out = s.export(), copy = Sequence.from(out);
  assert.equal(out.length, 1);
  if (out[0].kind === 'insert') out[0].value = '?';
  assert.equal(s.text(),'😀'); assert.equal(copy.text(),'😀'); assert.deepEqual(copy.export(),s.export());
});
