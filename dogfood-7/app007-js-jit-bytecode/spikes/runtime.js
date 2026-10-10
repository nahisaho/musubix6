import assert from 'node:assert/strict';
assert.equal(typeof structuredClone, 'function');
const key = Object.freeze({ id: 0 });
const map = new Map([[key, 12]]);
assert.equal(map.get(Object.freeze({ id: 0 })), undefined);
assert.equal('4' + 2, '42');
assert.equal(Number.isInteger(Infinity), false);
console.log('spike: identity guards, coercion, finite configuration and ESM verified');
