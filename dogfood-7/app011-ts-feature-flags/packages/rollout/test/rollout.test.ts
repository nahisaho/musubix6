import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bucket, inRollout, chooseVariant, validateVariants } from '../src/index.ts';

/** @id TEST-ROLL-001 @verifies REQ-ROLL-001 */
test('TEST-ROLL-001 stable golden bucket', () => {
  const expected = createHash('sha256').update('["checkout","alice","v1"]').digest().readUInt32BE(0)%10000;
  assert.equal(bucket('checkout','alice','v1'), expected);
  assert.equal(bucket('checkout','alice','v1'), bucket('checkout','alice','v1'));
});
/** @id TEST-ROLL-002 @verifies REQ-ROLL-002 */
test('TEST-ROLL-002 tuple boundaries', () => {
  assert.notEqual(bucket('a:b','c'), bucket('a','b:c'));
  assert.notEqual(bucket('a','b','c:d'), bucket('a','b:c','d'));
});
/** @id TEST-ROLL-003 @verifies REQ-ROLL-003 */
test('TEST-ROLL-003 endpoint rollout', () => {
  for (let i=0;i<100;i++) {
    assert.equal(inRollout('f',String(i),0), false);
    assert.equal(inRollout('f',String(i),100), true);
  }
});
/** @id TEST-ROLL-004 @verifies REQ-ROLL-004 */
test('TEST-ROLL-004 monotonic growth', () => {
  for (let i=0;i<1000;i++) {
    const a=inRollout('f',String(i),20), b=inRollout('f',String(i),60);
    assert.equal(a && !b, false);
  }
});
/** @id TEST-ROLL-005 @verifies REQ-ROLL-005 */
test('TEST-ROLL-005 percentage validation', () => {
  for (const p of [-1,101,NaN,Infinity]) assert.throws(() => inRollout('f','u',p), /percentage/i);
});
/** @id TEST-ROLL-006 @verifies REQ-ROLL-006 */
test('TEST-ROLL-006 isolated salts and flags', () => {
  assert.notEqual(bucket('f','u','a'),bucket('f','u','b'));
  assert.notEqual(bucket('f','u','a'),bucket('g','u','a'));
});
/** @id TEST-ROLL-007 @verifies REQ-ROLL-007 */
test('TEST-ROLL-007 weighted half-open boundaries', () => {
  const variants=[{name:'off',weight:0,value:0},{name:'a',weight:25,value:1},{name:'b',weight:75,value:2}];
  assert.equal(chooseVariant(0,variants).name,'a');
  assert.equal(chooseVariant(2499,variants).name,'a');
  assert.equal(chooseVariant(2500,variants).name,'b');
  assert.equal(chooseVariant(9999,variants).name,'b');
});
/** @id TEST-ROLL-008 @verifies REQ-ROLL-008 */
test('TEST-ROLL-008 invalid variant partitions', () => {
  for (const variants of [
    [],[{name:'a',weight:99,value:0}],
    [{name:'a',weight:50,value:0},{name:'a',weight:50,value:1}],
    [{name:'a',weight:-10,value:0},{name:'b',weight:110,value:1}],
    [{name:'a',weight:NaN,value:0}],
    [{name:'a',weight:0.001,value:0},{name:'b',weight:99.999,value:1}]
  ]) assert.throws(() => validateVariants(variants), /invalid variants/i);
});
/** @id TEST-ROLL-009 @verifies REQ-ROLL-009 */
test('TEST-ROLL-009 distribution sanity', () => {
  let count=0;
  for(let i=0;i<10000;i++) if(inRollout('distribution',String(i),50)) count++;
  assert.ok(count>4700 && count<5300, String(count));
});
