import test from 'node:test';
import assert from 'node:assert/strict';
import { Groups } from '../src/groups.js';

function make() {
  const b = new Groups({ clock: () => 100 });
  b.createTopic('a', 4);
  b.createTopic('b', 2);
  return b;
}

/** @id TEST-GROUPS-001 @verifies REQ-GROUPS-001 REQ-GROUPS-002 */
test('TEST-GROUPS-001 group join and invalid membership are atomic', () => {
  const b = make();
  assert.deepEqual(b.join('g', 'one', ['a']), { group: 'g', member: 'one', generation: 1 });
  const before = b.group('g');
  for (const args of [['g', 'one', ['a']], ['', 'two', ['a']], ['g', '', ['a']],
    ['g', 'two', []], ['g', 'two', ['missing']], ['g', 'two', ['a', 'a']]]) {
    assert.throws(() => b.join(...args));
  }
  assert.deepEqual(b.group('g'), before);
});

/** @id TEST-GROUPS-002 @verifies REQ-GROUPS-003 REQ-GROUPS-004 */
test('TEST-GROUPS-002 assignments are deterministic per eligible topic', () => {
  const b = make();
  const old = b.join('g', 'z', ['a', 'b']);
  const token = b.join('g', 'a', ['a']);
  assert.equal(token.generation, 2);
  assert.throws(() => b.validate(old, 'b', 0), /stale/);
  assert.deepEqual(b.assignments(token), [{ topic: 'a', partition: 0 }, { topic: 'a', partition: 2 }]);
  const z = b.token('g', 'z');
  assert.deepEqual(b.assignments(z), [
    { topic: 'a', partition: 1 }, { topic: 'a', partition: 3 },
    { topic: 'b', partition: 0 }, { topic: 'b', partition: 1 }
  ]);
  assert.equal(new Set([...b.assignments(token), ...b.assignments(z)].map(x => `${x.topic}:${x.partition}`)).size, 6);
});

/** @id TEST-GROUPS-003 @verifies REQ-GROUPS-005 REQ-GROUPS-006 */
test('TEST-GROUPS-003 leaving preserves empty group generation', () => {
  const b = make();
  b.join('g', 'one', ['a']);
  b.join('g', 'two', ['a']);
  assert.equal(b.leave('g', 'one'), 3);
  assert.equal(b.assignments(b.token('g', 'two')).length, 4);
  assert.equal(b.leave('g', 'two'), 4);
  assert.equal(b.group('g').members.length, 0);
  assert.equal(b.join('g', 'one', ['a']).generation, 5);
  assert.throws(() => b.leave('g', 'missing'));
});

/** @id TEST-GROUPS-004 @verifies REQ-GROUPS-007 REQ-GROUPS-008 */
test('TEST-GROUPS-004 returned tokens and assignments cannot mutate membership', () => {
  const b = make();
  b.join('g', 'one', ['a']);
  const token = b.join('g', 'two', ['a']);
  const meta = b.group('g');
  meta.members[0].subscriptions.push('b');
  b.assignments(token)[0].partition = 100;
  assert.deepEqual(b.group('g').members[0].subscriptions, ['a']);
  assert.equal(b.assignments(token)[0].partition, 1);
  for (const bad of [{ ...token, group: 'none' }, { ...token, member: 'none' },
    { ...token, generation: 0 }]) assert.throws(() => b.assignments(bad));
  assert.throws(() => b.validate(token, 'a', 0), /unowned/);
  assert.throws(() => b.validate(token, 'b', 0), /unowned/);
});
