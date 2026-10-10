import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, rangeToString, satisfies, intersect, isEmpty, RangeSyntaxError } from '../src/range.js';

const str = (s) => rangeToString(parseRange(s));
const table = (rows) => { for (const [input, want] of rows) assert.equal(str(input), want, `input ${JSON.stringify(input)}`); };

/** @id TEST-RNG-001 @verifies REQ-RNG-001 */
test('TEST-RNG-001 comparators', () => {
  table([
    ['>=1.2.3', '>=1.2.3'], ['>1.0.0 <=2.0.0', '>1.0.0 <=2.0.0'], ['1.2.3', '1.2.3'], ['=1.2.3', '1.2.3'],
    ['<1.0.0', '<1.0.0'], ['>= 1.2.3', '>=1.2.3'], ['>=1.0.0 >=1.5.0 <3.0.0 <2.0.0', '>=1.5.0 <2.0.0'],
    ['  >=1.0.0   <2.0.0 ', '>=1.0.0 <2.0.0'],
  ]);
});

/** @id TEST-RNG-002 @verifies REQ-RNG-002 */
test('TEST-RNG-002 x-ranges', () => {
  table([
    ['1.x', '>=1.0.0 <2.0.0-0'], ['1.2.*', '>=1.2.0 <1.3.0-0'], ['*', '*'], ['', '*'], ['x', '*'],
    ['1', '>=1.0.0 <2.0.0-0'], ['1.2', '>=1.2.0 <1.3.0-0'], ['>=1.x', '>=1.0.0'], ['>1.x', '>=2.0.0'],
    ['<=1.x', '<2.0.0-0'], ['<1.x', '<1.0.0'], ['>*', '<0.0.0-0'],
  ]);
});

/** @id TEST-RNG-003 @verifies REQ-RNG-003 */
test('TEST-RNG-003 tilde', () => {
  table([
    ['~1.2.3', '>=1.2.3 <1.3.0-0'], ['~1', '>=1.0.0 <2.0.0-0'], ['~0.2.3', '>=0.2.3 <0.3.0-0'],
    ['~1.2', '>=1.2.0 <1.3.0-0'], ['~1.2.3-beta.2', '>=1.2.3-beta.2 <1.3.0-0'],
  ]);
});

/** @id TEST-RNG-004 @verifies REQ-RNG-004 */
test('TEST-RNG-004 caret', () => {
  table([
    ['^1.2.3', '>=1.2.3 <2.0.0-0'], ['^0.2.3', '>=0.2.3 <0.3.0-0'], ['^0.0.3', '>=0.0.3 <0.0.4-0'],
    ['^0.0', '>=0.0.0 <0.1.0-0'], ['^0', '>=0.0.0 <1.0.0-0'], ['^1.x', '>=1.0.0 <2.0.0-0'], ['^0.x', '>=0.0.0 <1.0.0-0'],
    ['^1.2.3-beta.2', '>=1.2.3-beta.2 <2.0.0-0'],
  ]);
});

/** @id TEST-RNG-005 @verifies REQ-RNG-005 */
test('TEST-RNG-005 hyphen', () => {
  table([
    ['1.2.3 - 2.3.4', '>=1.2.3 <=2.3.4'], ['1.2 - 2.3', '>=1.2.0 <2.4.0-0'], ['1 - 2', '>=1.0.0 <3.0.0-0'],
    ['1.2.3 - 2', '>=1.2.3 <3.0.0-0'], ['1.2.3 - 2.3.4 || 5.0.0', '>=1.2.3 <=2.3.4 || 5.0.0'],
  ]);
});

/** @id TEST-RNG-006 @verifies REQ-RNG-006 */
test('TEST-RNG-006 union normalization', () => {
  table([
    ['>=1.0.0 <2.0.0 || >=1.5.0 <3.0.0', '>=1.0.0 <3.0.0'], ['1.0.0 || 3.0.0 || 2.0.0', '1.0.0 || 2.0.0 || 3.0.0'],
    ['<2.0.0 || >=2.0.0', '*'], ['<=2.0.0 || >2.0.0', '*'], ['<2.0.0 || >2.0.0', '<2.0.0 || >2.0.0'],
    ['1.0.0 || 1.0.0', '1.0.0'], ['^1 || *', '*'], ['>5.0.0 <1.0.0 || 2.0.0', '2.0.0'],
  ]);
});

/** @id TEST-RNG-007 @verifies REQ-RNG-007 */
test('TEST-RNG-007 prerelease rule', () => {
  assert.equal(satisfies('1.2.3-beta.2', '^1.2.3-beta.1'), true);
  assert.equal(satisfies('1.2.4-beta.1', '^1.2.3-beta.1'), false);
  assert.equal(satisfies('1.2.3-beta.2', '>=1.0.0'), false);
  assert.equal(satisfies('2.0.0-alpha', '<2.0.0'), false);
  assert.equal(satisfies('1.5.0', '^1.2.3'), true);
  assert.equal(satisfies('1.2.3-alpha', '*'), false);
  assert.equal(satisfies('1.2.3-beta.2', '1.2.3-beta.1 || ^2.0.0'), false);
  assert.equal(satisfies('2.0.0', '<2.0.0'), false);
});

/** @id TEST-RNG-008 @verifies REQ-RNG-008 */
test('TEST-RNG-008 intersect', () => {
  const x = (a, b) => rangeToString(intersect(parseRange(a), parseRange(b)));
  assert.equal(x('^1.2.0', '>=1.5.0 <3.0.0'), '>=1.5.0 <2.0.0-0');
  assert.equal(x('^1 || ^3', '>=1.5.0 <3.5.0'), '>=1.5.0 <2.0.0-0 || >=3.0.0 <3.5.0');
  assert.equal(x('<1.0.0', '>=1.0.0'), '<0.0.0-0');
  assert.equal(x('<=1.0.0', '>=1.0.0'), '1.0.0');
  assert.equal(x('*', '^2.1.0'), '>=2.1.0 <3.0.0-0');
  assert.equal(x('^1 || ^3 || ^5', '^3 || ^5.1.0'), '>=3.0.0 <4.0.0-0 || >=5.1.0 <6.0.0-0');
});

/** @id TEST-RNG-009 @verifies REQ-RNG-009 */
test('TEST-RNG-009 empty', () => {
  assert.equal(isEmpty(parseRange('>2.0.0 <1.0.0')), true);
  assert.equal(isEmpty(parseRange('>1.0.0 <=1.0.0')), true);
  assert.equal(isEmpty(parseRange('>=1.0.0 <1.0.0')), true);
  assert.equal(isEmpty(parseRange('1.0.0')), false);
  assert.equal(isEmpty(parseRange('*')), false);
  assert.equal(satisfies('1.5.0', '>2.0.0 <1.0.0'), false);
  assert.equal(str('>2.0.0 <1.0.0'), '<0.0.0-0');
});

/** @id TEST-RNG-010 @verifies REQ-RNG-010 */
test('TEST-RNG-010 syntax errors', () => {
  for (const bad of ['>=', '1.2.3.4', 'foo', '^', '1.2.3 -', '1.x.3', '~~1', '>=1.0.0 ||| 2', '01.2.3', '>=1.0.0 <'])
    assert.throws(() => parseRange(bad), RangeSyntaxError, bad);
  assert.throws(() => parseRange('^1.0.0 foo'), (e) => e instanceof RangeSyntaxError && e.message.includes('foo'));
  assert.throws(() => parseRange(42), RangeSyntaxError);
});

/** @id TEST-RNG-011 @verifies REQ-RNG-011 */
test('TEST-RNG-011 string roundtrip', () => {
  const samples = ['1.0.0', '1.5.0', '1.9.9', '2.0.0', '2.0.0-0', '0.0.3', '0.3.0', '3.2.1', '10.0.0'];
  for (const s of ['^1.2.3 || ~3.2', '>=1.0.0 <2.0.0', '*', '>2.0.0 <1.0.0', '1 - 2', '^0.0.3', '<1.0.0 || >=3.0.0']) {
    const once = str(s);
    assert.equal(str(once), once, s);
    for (const v of samples) assert.equal(satisfies(v, parseRange(once)), satisfies(v, s), `${s} ${v}`);
  }
});

/** @id TEST-RNG-012 @verifies REQ-RNG-012 */
test('TEST-RNG-012 intersect prerelease exactness', () => {
  const ranges = ['^1.0.0-beta.1', '^1', '>=1.0.0-alpha <1.5.0', '*', '1.0.0-beta.2', '^1.2.0-rc.0 || ^2'];
  const vs = ['1.0.0-beta.1', '1.0.0-beta.2', '1.0.0-rc.1', '1.0.0', '1.2.0-rc.1', '1.2.0', '2.0.0'];
  for (const a of ranges) for (const b of ranges) for (const v of vs) {
    assert.equal(satisfies(v, intersect(parseRange(a), parseRange(b))), satisfies(v, a) && satisfies(v, b), `${v} in ${a} ∩ ${b}`);
  }
});
