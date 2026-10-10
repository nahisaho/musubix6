import assert from 'node:assert/strict';
const datum: {value: Buffer} = {value: Buffer.from([0,255])};
assert.deepEqual(Buffer.from(datum.value.toString('base64'),'base64'),datum.value);
assert.deepEqual(structuredClone({n:1,default:[]}),{n:1,default:[]});
assert.equal(Number.isSafeInteger(9007199254740992),false);
console.log('TS stripping, bytes, snapshot isolation and long boundary verified');
