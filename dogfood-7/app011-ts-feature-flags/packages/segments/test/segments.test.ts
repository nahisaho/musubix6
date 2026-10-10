import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentGraph } from '../src/index.ts';

/** @id TEST-SEG-001 @verifies REQ-SEG-001 */
test('TEST-SEG-001 explicit inclusion', () => {
  assert.equal(new SegmentGraph([{id:'staff',include:['alice']}]).has('staff','alice',{}), true);
});
/** @id TEST-SEG-002 @verifies REQ-SEG-002 */
test('TEST-SEG-002 exclusion overrides all', () => {
  assert.equal(new SegmentGraph([{id:'staff',include:['alice'],exclude:['alice'],rules:['active EQ true']}]).has('staff','alice',{active:true}), false);
});
/** @id TEST-SEG-003 @verifies REQ-SEG-003 */
test('TEST-SEG-003 rules OR together', () => {
  assert.equal(new SegmentGraph([{id:'beta',rules:['country EQ "JP"','plan EQ "pro"']}]).has('beta','bob',{plan:'pro'}), true);
});
/** @id TEST-SEG-004 @verifies REQ-SEG-004 */
test('TEST-SEG-004 transitive graph membership', () => {
  assert.equal(new SegmentGraph([{id:'a',include:['u']},{id:'b',refs:['a']},{id:'c',refs:['b']}]).has('c','u',{}), true);
});
/** @id TEST-SEG-005 @verifies REQ-SEG-005 */
test('TEST-SEG-005 cyclic graph rejected', () => {
  assert.throws(() => new SegmentGraph([{id:'a',refs:['b']},{id:'b',refs:['a']}]), /cycle/i);
});
/** @id TEST-SEG-006 @verifies REQ-SEG-006 */
test('TEST-SEG-006 unknown and duplicate rejected', () => {
  assert.throws(() => new SegmentGraph([{id:'a',refs:['missing']}]), /unknown/i);
  assert.throws(() => new SegmentGraph([{id:'a'},{id:'a'}]), /duplicate/i);
});
/** @id TEST-SEG-007 @verifies REQ-SEG-007 */
test('TEST-SEG-007 input isolation', () => {
  const defs=[{id:'a',include:['alice']}], graph=new SegmentGraph(defs);
  defs[0].include.push('bob');
  assert.equal(graph.has('a','bob',{}), false);
});
/** @id TEST-SEG-008 @verifies REQ-SEG-008 */
test('TEST-SEG-008 unknown query fails closed', () => {
  assert.equal(new SegmentGraph([]).has('absent','u',{}), false);
});
/** @id TEST-SEG-009 @verifies REQ-SEG-009 */
test('TEST-SEG-009 prototype-like IDs', () => {
  assert.equal(new SegmentGraph([{id:'__proto__',include:['u']},{id:'constructor',refs:['__proto__']}]).has('constructor','u',{}), true);
});
