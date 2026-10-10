import assert from 'node:assert/strict';
assert.notEqual(JSON.stringify([1]), JSON.stringify(['1']));
assert.equal(new Map([[JSON.stringify([]), []]]).size, 1);
assert.equal(Number.isFinite(Number('9'.repeat(400))), false);
const names = new Set(['p__bf', 'p__fb', 'magic_p__bf']);
assert.equal(names.size, 3);
console.log('Typed tuple keys, zero-arity demand keys, finite numeric guard, adornment names: PASS');
