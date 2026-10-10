import assert from 'node:assert/strict';
import { Broker } from '../src/broker.js';

let now = 0;
const broker = new Broker({ clock: () => now, sessionTimeout: 100, dedupeTtl: 1000 });
for (const [topic, partitions] of [['orders', 2], ['processed', 1], ['dead', 1]]) {
  broker.createTopic(topic, partitions);
}
broker.publish('orders', { id: 1, amount: 20 }, { partition: 0, idempotencyKey: 'order-1' });
broker.publish('orders', { id: 2, poison: true }, { partition: 1, idempotencyKey: 'order-2' });
const first = broker.join('workers', 'alice', ['orders']);
const bob = broker.join('workers', 'bob', ['orders']);
assert.throws(() => broker.poll(first), /stale/);
const alice = broker.token('workers', 'alice');
const [order] = broker.poll(alice);
const request = { outputs: [{ topic: 'processed', value: { id: order.value.id, accepted: true } }],
  commits: [{ topic: order.topic, partition: order.partition, offset: order.offset + 1 }] };
broker.transaction(alice, 'process-1', request);
broker.transaction(alice, 'process-1', request);
const [poison] = broker.poll(bob);
broker.fail(bob, poison, 'invalid order', { maxAttempts: 2, deadLetterTopic: 'dead' });
broker.poll(bob);
broker.fail(bob, poison, 'invalid order', { maxAttempts: 2, deadLetterTopic: 'dead' });
assert.equal(broker.read('processed', 0).length, 1);
assert.equal(broker.read('dead', 0).length, 1);
now = 100;
assert.equal(broker.maintenance().expiredMembers, 2);
console.log(JSON.stringify({ processed: broker.read('processed', 0), deadLetters: broker.read('dead', 0) }, null, 2));
