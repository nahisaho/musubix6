import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRule, evaluateRule } from '../src/index.ts';
const matches = (source: string, context: Record<string, unknown>) => evaluateRule(parseRule(source), context);

/** @id TEST-RULE-001 @verifies REQ-RULE-001 */
test('TEST-RULE-001 typed equality', () => {
  assert.equal(matches('country EQ "JP"', { country: 'JP' }), true);
  assert.equal(matches('country EQ "JP"', { country: 1 }), false);
});
/** @id TEST-RULE-002 @verifies REQ-RULE-002 */
test('TEST-RULE-002 precedence', () => {
  assert.equal(matches('a EQ true OR b EQ true AND c EQ true', {a:true,b:false,c:false}), true);
  assert.equal(matches('a EQ true OR b EQ true AND c EQ true', {a:false,b:true,c:false}), false);
});
/** @id TEST-RULE-003 @verifies REQ-RULE-003 */
test('TEST-RULE-003 grouping and negation', () => {
  assert.equal(matches('NOT (a EQ true OR b EQ true) AND c EQ true', {a:false,b:false,c:true}), true);
});
/** @id TEST-RULE-004 @verifies REQ-RULE-004 */
test('TEST-RULE-004 numeric comparisons', () => {
  for (const op of ['GT','GE','LT','LE']) {
    assert.equal(matches(`age ${op} 18`, {age:'20'}), false);
    assert.equal(matches(`age ${op} 18`, {age:NaN}), false);
  }
  assert.equal(matches('age GT 18 AND age LE 21', {age:20}), true);
});
/** @id TEST-RULE-005 @verifies REQ-RULE-005 */
test('TEST-RULE-005 typed list membership', () => {
  assert.equal(matches('plan IN ["pro", "team", 3]', {plan:'team'}), true);
  assert.equal(matches('plan IN ["pro", "team", 3]', {plan:'3'}), false);
});
/** @id TEST-RULE-006 @verifies REQ-RULE-006 */
test('TEST-RULE-006 absent attribute fails closed', () => {
  for (const expression of ['a EQ 1','a NE 1','a IN [1]','a GT 0']) assert.equal(matches(expression, {}), false);
});
/** @id TEST-RULE-007 @verifies REQ-RULE-007 */
test('TEST-RULE-007 malformed and trailing input', () => {
  for (const source of ['a EQ 1 trailing', 'a = 1', 'a IN [1,]', 'a EQ NaN', 'a EQ 1; process.exit()'])
    assert.throws(() => parseRule(source), /syntax/i);
});
/** @id TEST-RULE-008 @verifies REQ-RULE-008 */
test('TEST-RULE-008 JSON escapes and booleans', () => {
  assert.equal(matches('name EQ "a\\\"b\\n" AND active EQ true', {name:'a"b\n',active:true}), true);
});
/** @id TEST-RULE-009 @verifies REQ-RULE-009 */
test('TEST-RULE-009 bounded parse', () => {
  assert.throws(() => parseRule('('.repeat(65)+'a EQ 1'+')'.repeat(65)), /limit/i);
  assert.throws(() => parseRule('a EQ "'+'x'.repeat(4096)+'"'), /limit/i);
});
/** @id TEST-RULE-010 @verifies REQ-RULE-010 */
test('TEST-RULE-010 own data properties only', () => {
  assert.equal(matches('constructor NE null', {}), false);
  assert.equal(matches('age GT 18', Object.create({age:21})), false);
  assert.equal(matches('age GT 18', {age:21}), true);
  let accesses=0;
  const context=Object.defineProperty({},'age',{get(){accesses++;return 21;}});
  assert.equal(matches('age GT 18',context), false);
  assert.equal(accesses,0);
});
