import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../src/index.ts';
import {parse} from '../../parser/src/index.ts';
const table = (text:string) => analyze(parse(text));

/** @id TEST-SYMBOLS-001 @verifies REQ-SYMBOLS-001 */
test('TEST-SYMBOLS-001 name range', () => {
  assert.deepEqual(table('let xyz = 1;').declarations.map(d => [d.name,d.start,d.end]), [['xyz',4,7]]);
});
/** @id TEST-SYMBOLS-002 @verifies REQ-SYMBOLS-002 */
test('TEST-SYMBOLS-002 bind', () => {
  const t = table('let x = 1;\nprint x;');
  assert.equal(t.references[0].target, t.declarations[0].id);
});
/** @id TEST-SYMBOLS-003 @verifies REQ-SYMBOLS-003 */
test('TEST-SYMBOLS-003 shadow', () => {
  const t = table('let x = 1;\n{\nlet x = 2;\nprint x;\n}');
  assert.equal(t.references[0].target, t.declarations[1].id);
});
/** @id TEST-SYMBOLS-004 @verifies REQ-SYMBOLS-004 */
test('TEST-SYMBOLS-004 scope restore', () => {
  const t = table('let x = 1;\n{\nlet x = 2;\n}\nprint x;');
  assert.equal(t.references[0].target, t.declarations[0].id);
});
/** @id TEST-SYMBOLS-005 @verifies REQ-SYMBOLS-005 */
test('TEST-SYMBOLS-005 duplicate', () => {
  const t = table('let x = 1;\nlet x = 2;');
  assert.equal(t.issues[0].code, 'duplicate-name');
  assert.equal(t.issues[0].start, 15);
});
/** @id TEST-SYMBOLS-006 @verifies REQ-SYMBOLS-006 */
test('TEST-SYMBOLS-006 forward unresolved', () => {
  assert.equal(table('print x;\nlet x = 1;').references[0].target, null);
});
/** @id TEST-SYMBOLS-007 @verifies REQ-SYMBOLS-007 */
test('TEST-SYMBOLS-007 initializer binding', () => {
  const t = table('let x = 1;\n{\nlet x = x + 1;\n}');
  assert.equal(t.references[0].target, t.declarations[0].id);
  assert.equal(table('let x = x;').references[0].target, null);
});
/** @id TEST-SYMBOLS-008 @verifies REQ-SYMBOLS-008 */
test('TEST-SYMBOLS-008 scope issues', () => {
  assert.equal(table('}\n{').issues.filter(i => i.code === 'scope').length, 2);
});
