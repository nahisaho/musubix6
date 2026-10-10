import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, compare, format, inc, sortVersions, SemverError } from '../src/semver.js';

/** @id TEST-SEMV-001 @verifies REQ-SEMV-001 */
test('TEST-SEMV-001 parse valid version', () => {
  const v = parse('1.2.3-alpha.1+build.5');
  assert.equal(v.major, 1);
  assert.equal(v.minor, 2);
  assert.equal(v.patch, 3);
  assert.deepEqual(v.prerelease, ['alpha', 1]);
  assert.deepEqual(v.build, ['build', '5']);
});

/** @id TEST-SEMV-002 @verifies REQ-SEMV-002 */
test('TEST-SEMV-002 parse rejects invalid', () => {
  for (const bad of ['01.2.3', '1.2', '-1.2.3', '1.2.3-', '1.2.3-a..b', '1.2.3-01', '', 'v1.2.3', '1.2.3+', ' 1.2.3'])
    assert.throws(() => parse(bad), SemverError, bad);
  assert.throws(() => parse(5), SemverError);
  assert.throws(() => parse(null), SemverError);
});

/** @id TEST-SEMV-003 @verifies REQ-SEMV-003 */
test('TEST-SEMV-003 build metadata ignored', () => {
  assert.equal(compare('1.0.0+a', '1.0.0+b'), 0);
  assert.equal(compare('1.0.0+zzz', '1.0.1'), -1);
});

/** @id TEST-SEMV-004 @verifies REQ-SEMV-004 */
test('TEST-SEMV-004 prerelease identifier precedence', () => {
  assert.equal(compare('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(compare('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compare('1.0.0-1', '1.0.0-alpha'), -1);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compare('1.0.0-9007199254740993', '1.0.0-9007199254740992'), 1);
});

/** @id TEST-SEMV-005 @verifies REQ-SEMV-005 */
test('TEST-SEMV-005 shorter prerelease set lower', () => {
  assert.equal(compare('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha'), 1);
});

/** @id TEST-SEMV-006 @verifies REQ-SEMV-006 */
test('TEST-SEMV-006 release above prerelease', () => {
  assert.equal(compare('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compare('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compare('2.0.0-rc.1', '1.9.9'), 1);
});

/** @id TEST-SEMV-007 @verifies REQ-SEMV-007 */
test('TEST-SEMV-007 compare is a total order', () => {
  const xs = ['0.0.1', '1.0.0-0', '1.0.0-a', '1.0.0-a.1', '1.0.0-1', '1.0.0', '1.0.0+x', '1.2.0', '10.0.0', '2.0.0-rc.1'];
  for (const a of xs) for (const b of xs) {
    assert.equal(compare(a, b), 0 - compare(b, a), `${a} ${b}`);
    for (const c of xs) if (compare(a, b) <= 0 && compare(b, c) <= 0) assert.ok(compare(a, c) <= 0, `${a} ${b} ${c}`);
  }
});

/** @id TEST-SEMV-008 @verifies REQ-SEMV-008 */
test('TEST-SEMV-008 format roundtrip', () => {
  for (const s of ['0.0.0', '1.2.3', '1.2.3-alpha.1', '1.2.3+b.1', '1.2.3-0.x-y+0.01', '10.20.30-rc.1.2'])
    assert.equal(format(parse(s)), s);
});

/** @id TEST-SEMV-009 @verifies REQ-SEMV-009 */
test('TEST-SEMV-009 inc', () => {
  assert.equal(inc('1.2.3-rc.1+b', 'patch'), '1.2.3');
  assert.equal(inc('1.2.3', 'patch'), '1.2.4');
  assert.equal(inc('1.2.3', 'minor'), '1.3.0');
  assert.equal(inc('1.2.3', 'major'), '2.0.0');
  assert.throws(() => inc('1.2.3', 'bogus'), SemverError);
});

/** @id TEST-SEMV-010 @verifies REQ-SEMV-010 */
test('TEST-SEMV-010 sortVersions', () => {
  const input = ['1.10.0', '1.2.0', '1.2.0-rc.1', '0.9.0'];
  const out = sortVersions(input);
  assert.deepEqual(out, ['0.9.0', '1.2.0-rc.1', '1.2.0', '1.10.0']);
  assert.deepEqual(input, ['1.10.0', '1.2.0', '1.2.0-rc.1', '0.9.0']);
  assert.notEqual(out, input);
});
