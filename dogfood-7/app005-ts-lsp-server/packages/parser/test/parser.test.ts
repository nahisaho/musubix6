import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../src/index.ts';

/** @id TEST-PARSER-001 @verifies REQ-PARSER-001 */
test('TEST-PARSER-001 declaration', () => {
  const p = parse('let answer = one + 2;');
  assert.equal(p.nodes[0].kind, 'let');
  assert.equal(p.nodes[0].name?.name, 'answer');
  assert.deepEqual(p.nodes[0].refs.map(r => r.name), ['one']);
  assert.equal(p.issues.length, 0);
});
/** @id TEST-PARSER-002 @verifies REQ-PARSER-002 */
test('TEST-PARSER-002 comments', () => {
  assert.deepEqual(parse('print a; // b c').nodes[0].refs.map(r => r.name), ['a']);
});
/** @id TEST-PARSER-003 @verifies REQ-PARSER-003 */
test('TEST-PARSER-003 offsets', () => {
  const p = parse('// 😀\r\nprint thing;');
  assert.deepEqual(p.nodes[1].refs[0], {name:'thing',start:13,end:18});
});
/** @id TEST-PARSER-004 @verifies REQ-PARSER-004 */
test('TEST-PARSER-004 missing terminator', () => {
  const p = parse('print a // comment');
  assert.equal(p.issues[0].code, 'missing-semicolon');
  assert.equal(p.issues[0].start, 7);
  assert.equal(p.issues[0].end, 7);
});
/** @id TEST-PARSER-005 @verifies REQ-PARSER-005 */
test('TEST-PARSER-005 recovery', () => {
  const p = parse('let = @;\nprint next;');
  assert.ok(p.issues.some(i => i.code === 'syntax'));
  assert.equal(p.nodes[1].refs[0].name, 'next');
});
/** @id TEST-PARSER-006 @verifies REQ-PARSER-006 */
test('TEST-PARSER-006 reuse', () => {
  const p = parse('let x = 1;\nprint x;');
  const q = parse('let x = 2;\nprint x;', p);
  assert.notEqual(q.nodes[0], p.nodes[0]);
  assert.equal(q.nodes[1], p.nodes[1]);
  assert.equal(q.reparsed, 1);
});
/** @id TEST-PARSER-007 @verifies REQ-PARSER-007 */
test('TEST-PARSER-007 shifted offsets', () => {
  const p = parse('let x = 1;\nprint x;');
  const q = parse('let x = 100;\nprint x;', p);
  assert.notEqual(q.nodes[1], p.nodes[1]);
  assert.equal(q.nodes[1].refs[0].start, 19);
});
/** @id TEST-PARSER-008 @verifies REQ-PARSER-008 */
test('TEST-PARSER-008 blocks', () => {
  assert.deepEqual(parse('{\nlet x = 1;\n}').nodes.map(n => n.kind), ['open','let','close']);
});
