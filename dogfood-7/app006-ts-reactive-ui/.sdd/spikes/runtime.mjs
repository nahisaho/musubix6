import assert from 'node:assert/strict';
const events = [];
queueMicrotask(() => events.push('first'));
queueMicrotask(() => events.push('second'));
assert.deepEqual([...new Map([['b', 2], ['a', 1]]).keys()], ['b', 'a']);
await new Promise(resolve => queueMicrotask(resolve));
assert.deepEqual(events, ['first', 'second']);
console.log('spike: Map and microtask ordering verified on', process.version);
