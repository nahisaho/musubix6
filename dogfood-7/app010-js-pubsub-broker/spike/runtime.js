import assert from 'node:assert/strict';
const cycle = { bytes: new Uint8Array([1, 2]) };
cycle.self = cycle;
const clone = structuredClone(cycle);
assert.equal(clone.self, clone);
assert.notEqual(clone.bytes, cycle.bytes);
assert.deepEqual(['z', 'a', 'm'].sort(), ['a', 'm', 'z']);
assert.throws(() => structuredClone(() => {}), { name: 'DataCloneError' });
console.log('spike: cyclic snapshots, byte isolation, stable sort and invalid payload confirmed');
