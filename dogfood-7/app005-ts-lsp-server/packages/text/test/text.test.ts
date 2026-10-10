import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore, open, change, close, snapshot, positionAt, offsetAt} from '../src/index.ts';

/** @id TEST-TEXT-001 @verifies REQ-TEXT-001 */
test('TEST-TEXT-001 open', () => {
  const s = createStore();
  assert.equal(open(s, 'u', 'abc', 1).text, 'abc');
  assert.equal(snapshot(s, 'u').version, 1);
});
/** @id TEST-TEXT-002 @verifies REQ-TEXT-002 */
test('TEST-TEXT-002 duplicate open', () => {
  const s = createStore(); open(s, 'u', 'a', 1);
  assert.throws(() => open(s, 'u', 'b', 2), /already/);
  assert.equal(snapshot(s, 'u').text, 'a');
});
/** @id TEST-TEXT-003 @verifies REQ-TEXT-003 */
test('TEST-TEXT-003 ordered UTF16 edits', () => {
  const s = createStore(); open(s, 'u', '😀ab', 1);
  assert.equal(change(s, 'u', 2, [{start:2,end:3,text:'XYZ'}, {start:5,end:6,text:'!'}]).text, '😀XYZ!');
});
/** @id TEST-TEXT-004 @verifies REQ-TEXT-004 */
test('TEST-TEXT-004 stale', () => {
  const s = createStore(); open(s, 'u', 'abc', 4);
  assert.throws(() => change(s, 'u', 4, [{start:0,end:1,text:'z'}]), /version/);
  assert.equal(snapshot(s, 'u').text, 'abc');
});
/** @id TEST-TEXT-005 @verifies REQ-TEXT-005 */
test('TEST-TEXT-005 atomic rollback', () => {
  const s = createStore(); open(s, 'u', 'abc', 1);
  assert.throws(() => change(s, 'u', 2, [{start:0,end:1,text:'xx'}, {start:0,end:99,text:''}]), /range/);
  assert.equal(snapshot(s, 'u').text, 'abc');
  assert.equal(snapshot(s, 'u').version, 1);
});
/** @id TEST-TEXT-006 @verifies REQ-TEXT-006 */
test('TEST-TEXT-006 positions', () => {
  const text = '😀x\r\nz';
  for (const n of [0,1,2,3,5,6]) assert.equal(offsetAt(text, positionAt(text,n)), n);
  assert.throws(() => positionAt(text,4), /CRLF/);
  assert.throws(() => offsetAt(text,{line:0,character:4}), /position/);
});
/** @id TEST-TEXT-007 @verifies REQ-TEXT-007 */
test('TEST-TEXT-007 close', () => {
  const s = createStore(); open(s, 'u', '', 1);
  assert.equal(close(s, 'u'), true);
  assert.throws(() => change(s, 'u', 2, []), /not open/);
});
/** @id TEST-TEXT-008 @verifies REQ-TEXT-008 */
test('TEST-TEXT-008 isolated snapshot', () => {
  const s = createStore(); open(s, 'u', 'a', 1);
  const d = snapshot(s, 'u'); d.text = 'bad';
  assert.equal(snapshot(s, 'u').text, 'a');
});
/** @id TEST-TEXT-009 @verifies REQ-TEXT-009 */
test('TEST-TEXT-009 lone CR regression', () => {
  assert.doesNotThrow(() => offsetAt('a\r',positionAt('a\r',2)));
  assert.equal(offsetAt('a\r',positionAt('a\r',2)),2);
  assert.equal(offsetAt('\r',positionAt('\r',1)),1);
});
