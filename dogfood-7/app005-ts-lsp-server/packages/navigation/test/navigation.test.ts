import test from 'node:test';
import assert from 'node:assert/strict';
import {definition, rename, applyWorkspaceEdit} from '../src/index.ts';
import {createStore,open,snapshot} from '../../text/src/index.ts';
const document = (text:string) => { const s = createStore(); open(s,'u',text,1); return s; };

/** @id TEST-NAV-001 @verifies REQ-NAV-001 */
test('TEST-NAV-001 definition', () => {
  const s = document('let abc = 1;\nprint abc;');
  assert.deepEqual(definition(s,'u',19), {uri:'u',start:4,end:7});
});
/** @id TEST-NAV-002 @verifies REQ-NAV-002 */
test('TEST-NAV-002 half-open positions', () => {
  const s = document('let abc = 1;\nprint abc;');
  assert.equal(definition(s,'u',22), null);
  assert.equal(definition(s,'u',1), null);
});
/** @id TEST-NAV-003 @verifies REQ-NAV-003 */
test('TEST-NAV-003 shadow-aware rename', () => {
  const s = document('let x = 1;\n{\nlet x = 2;\nprint x;\n}\nprint x;');
  const e = rename(s,'u',4,'longName',1)!;
  assert.equal(e.edits.length, 2);
  assert.deepEqual(e.edits.map(x => x.start), [41,4]);
});
/** @id TEST-NAV-004 @verifies REQ-NAV-004 */
test('TEST-NAV-004 invalid rename', () => {
  const s = document('let x = 1;');
  for (const n of ['let','print','2a','a-b','']) assert.throws(() => rename(s,'u',4,n,1), /invalid name/);
  assert.equal(snapshot(s,'u').text, 'let x = 1;');
});
/** @id TEST-NAV-005 @verifies REQ-NAV-005 */
test('TEST-NAV-005 collisions and capture', () => {
  assert.throws(() => rename(document('let x = 1;\nlet y = 2;\nprint x;'),'u',4,'y',1), /collision|capture/);
  assert.throws(() => rename(document('let x = 1;\n{\nlet y = 2;\nprint x;\n}'),'u',4,'y',1), /collision|capture/);
  assert.throws(() => rename(document('let x = 1;\nprint y;'),'u',4,'y',1), /capture/);
});
/** @id TEST-NAV-006 @verifies REQ-NAV-006 */
test('TEST-NAV-006 stale rename', () => {
  assert.throws(() => rename(document('let x = 1;'),'u',4,'z',0), /version/);
});
/** @id TEST-NAV-007 @verifies REQ-NAV-007 */
test('TEST-NAV-007 apply rename', () => {
  const s = document('let x = 1;\nprint x + x;');
  const e = rename(s,'u',4,'value',1)!;
  assert.equal(applyWorkspaceEdit(s,e,2).text, 'let value = 1;\nprint value + value;');
  assert.equal(snapshot(s,'u').version,2);
});
/** @id TEST-NAV-008 @verifies REQ-NAV-008 */
test('TEST-NAV-008 unresolved rename', () => {
  assert.equal(rename(document('print x;'),'u',6,'z',1), null);
});
