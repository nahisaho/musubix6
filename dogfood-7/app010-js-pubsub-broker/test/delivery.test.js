import test from 'node:test';
import assert from 'node:assert/strict';
import { Delivery } from '../src/delivery.js';

function make() {
  const b = new Delivery({ clock: () => 100 });
  b.createTopic('in', 1); b.createTopic('out', 2); b.createTopic('dlq', 1);
  const token = b.join('g', 'one', ['in']);
  return { b, token };
}

/** @id TEST-DELIVERY-001 @verifies REQ-DELIVERY-001 REQ-DELIVERY-002 */
test('TEST-DELIVERY-001 producer IDs dedupe exact semantic requests', () => {
  const { b } = make();
  const options = { idempotencyKey: 'send-1', key: 'customer' };
  const first = b.publish('out', { a: 1, b: 2 }, options);
  assert.deepEqual(b.publish('out', { b: 2, a: 1 }, options), first);
  first.value.a = 10;
  assert.equal(b.publish('out', { a: 1, b: 2 }, options).value.a, 1);
  assert.throws(() => b.publish('out', { a: 2 }, options), /conflict/);
  assert.throws(() => b.publish('out', { a: 1, b: 2 }, { ...options, partition: 1 }), /conflict/);
  assert.throws(() => b.publish('out', 1, { idempotencyKey: '' }));
  assert.equal(b.read('out', first.partition).length, 1);
  assert.equal(b.publish('dlq', { a: 1, b: 2 }, options).offset, 0);
  const cyclic = {}; cyclic.self = cyclic;
  assert.deepEqual(b.publish('out', cyclic, { idempotencyKey: 'cycle' }),
    b.publish('out', cyclic, { idempotencyKey: 'cycle' }));
});

/** @id TEST-DELIVERY-002 @verifies REQ-DELIVERY-003 REQ-DELIVERY-004 */
test('TEST-DELIVERY-002 transaction validates entire effect set before commit', () => {
  const { b, token } = make();
  b.publish('in', 'input'); b.poll(token);
  const commits = [{ topic: 'in', partition: 0, offset: 1 }];
  assert.throws(() => b.transaction(token, 'bad', {
    outputs: [{ topic: 'out', value: 'first' }, { topic: 'missing', value: 'bad' }], commits
  }));
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.equal(b.read('out', 0).length, 0);
  assert.throws(() => b.transaction(token, 'bad', {
    outputs: [{ topic: 'out', value: 'first' }], commits: [{ ...commits[0], offset: 2 }]
  }), /delivered/);
  const result = b.transaction(token, 'bad', {
    outputs: [{ topic: 'out', value: 'first' }, { topic: 'out', value: 'second' }], commits
  });
  assert.deepEqual(result.map(r => [r.partition, r.offset]), [[0, 0], [1, 0]]);
  assert.equal(b.committed('g', 'in', 0), 1);
  assert.deepEqual(b.read('out', 1).map(r => r.value), ['second']);
});

/** @id TEST-DELIVERY-003 @verifies REQ-DELIVERY-005 REQ-DELIVERY-006 */
test('TEST-DELIVERY-003 transaction retry results are isolated and scoped', () => {
  const { b, token } = make();
  b.publish('in', 'input'); b.poll(token);
  const request = { outputs: [{ topic: 'out', value: { ok: true } }],
    commits: [{ topic: 'in', partition: 0, offset: 1 }] };
  const result = b.transaction(token, 'tx', request);
  result[0].value.ok = false;
  assert.equal(b.transaction(token, 'tx', request)[0].value.ok, true);
  assert.equal(b.read('out', 0).length, 1);
  assert.throws(() => b.transaction(token, 'tx', { ...request, outputs: [] }), /conflict/);
  const other = b.join('other', 'one', ['in']); b.poll(other);
  assert.equal(b.transaction(other, 'tx', request)[0].partition, 1);
  b.join('g', 'two', ['in']);
  assert.throws(() => b.transaction(token, 'tx', request), /stale/);
  assert.deepEqual(b.transaction(b.token('g', 'one'), 'tx', request),
    [{ ...result[0], value: { ok: true } }]);
});

/** @id TEST-DELIVERY-004 @verifies REQ-DELIVERY-007 REQ-DELIVERY-008 */
test('TEST-DELIVERY-004 poison retries route once and carry provenance', () => {
  const { b, token } = make();
  const input = b.publish('in', { bad: true }); b.poll(token);
  assert.deepEqual(b.fail(token, input, 'parser error', { maxAttempts: 2, deadLetterTopic: 'dlq' }),
    { attempts: 1, deadLettered: false });
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.equal(b.poll(token)[0].offset, 0);
  assert.deepEqual(b.fail(token, input, 'parser error', { maxAttempts: 2, deadLetterTopic: 'dlq' }),
    { attempts: 2, deadLettered: true });
  assert.equal(b.committed('g', 'in', 0), 1);
  const dead = b.read('dlq', 0);
  assert.equal(dead.length, 1);
  assert.deepEqual(dead[0].value, { source: input, group: 'g', attempts: 2, error: 'parser error' });
  assert.deepEqual(b.fail(token, input, 'parser error', { maxAttempts: 2, deadLetterTopic: 'dlq' }),
    { attempts: 2, deadLettered: true });
  assert.equal(b.read('dlq', 0).length, 1);
});

/** @id TEST-DELIVERY-005 @verifies REQ-DELIVERY-009 */
test('TEST-DELIVERY-005 user transactions cannot preclaim DLQ identity', () => {
  const { b, token } = make();
  const input = b.publish('in', 'poison'); b.poll(token);
  const internalLookingId = `dlq:${JSON.stringify(['g', 'in', 0, 0])}`;
  const userRequest = { outputs: [], commits: [{ topic: 'in', partition: 0, offset: 0 }] };
  assert.deepEqual(b.transaction(token, internalLookingId, userRequest), []);
  assert.deepEqual(b.fail(token, input, 'error', { maxAttempts: 1, deadLetterTopic: 'dlq' }),
    { attempts: 1, deadLettered: true });
  assert.equal(b.read('dlq', 0).length, 1);
  assert.equal(b.committed('g', 'in', 0), 1);
  assert.deepEqual(b.transaction(token, internalLookingId, userRequest), []);
});

/** @id TEST-DELIVERY-006 @verifies REQ-DELIVERY-010 */
test('TEST-DELIVERY-006 retained input failure works when commit lags base', async () => {
  const { Broker } = await import('../src/broker.js');
  let now = 0;
  const b = new Broker({ clock: () => now, retentionMs: 10, sessionTimeout: 100 });
  b.createTopic('in', 1); b.createTopic('dlq', 1);
  const token = b.join('g', 'one', ['in']);
  b.publish('in', 'old');
  now = 5; b.publish('in', 'poison');
  now = 15; b.maintenance();
  const [input] = b.poll(token);
  assert.equal(input.offset, 1);
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.deepEqual(b.fail(token, input, 'error', { maxAttempts: 2, deadLetterTopic: 'dlq' }),
    { attempts: 1, deadLettered: false });
  assert.equal(b.poll(token)[0].offset, 1);
  b.fail(token, input, 'error', { maxAttempts: 2, deadLetterTopic: 'dlq' });
  assert.equal(b.committed('g', 'in', 0), 2);
  assert.equal(b.read('dlq', 0).length, 1);
});

/** @id TEST-DELIVERY-007 @verifies REQ-DELIVERY-011 */
test('TEST-DELIVERY-007 sparse batches reject atomically and keep ID reusable', () => {
  const { b, token } = make();
  b.publish('in', 'input'); b.poll(token);
  const commit = { topic: 'in', partition: 0, offset: 1 };
  const commits = [commit, , ];
  assert.throws(() => b.transaction(token, 'sparse', {
    outputs: [{ topic: 'out', value: 'leak' }], commits
  }));
  assert.equal(b.read('out', 0).length, 0);
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.throws(() => b.commit(token, commits));
  assert.equal(b.committed('g', 'in', 0), 0);
  assert.throws(() => b.transaction(token, 'sparse', {
    outputs: [{ topic: 'out', value: 'leak' }, , ], commits: [commit]
  }));
  assert.equal(b.read('out', 0).length, 0);
  assert.deepEqual(b.transaction(token, 'sparse', {
    outputs: [{ topic: 'out', value: 'ok' }], commits: [commit]
  }).map(r => r.value), ['ok']);
  assert.equal(b.committed('g', 'in', 0), 1);
});
