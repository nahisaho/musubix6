import assert from 'node:assert/strict';
import { ConfigStore, diffSnapshots, verifyAudit } from '@flags/control';
import { Evaluator } from '@flags/sdk';

const store = new ConfigStore();
const before = store.snapshot();
const first = store.transact(0, 'operator', [
  { op: 'putSegment', segment: { id: 'beta', include: ['alice'] } },
  { op: 'putFlag', flag: {
    key: 'checkout', enabled: true, defaultValue: false,
    rules: [{ segment: 'beta', value: true }],
    rollout: { percentage: 0, value: true }
  } }
]);
const sdk = new Evaluator(first);
assert.equal(sdk.evaluate('checkout', { key: 'alice' }, false).value, true);
assert.equal(sdk.evaluate('checkout', { key: 'bob' }, false).value, false);

const next = store.transact(1, 'operator', [
  { op: 'putFlag', flag: { key: 'checkout', enabled: true, defaultValue: 'new', rules: [] } }
]);
sdk.update(next);
assert.equal(sdk.evaluate('checkout', { key: 'bob' }, false).value, 'new');
assert.equal(verifyAudit(store.audit()), true);
assert.equal(diffSnapshots(before, next).length, 2);
console.log('control → segment targeting → SDK update → audit integrity → semantic diff: PASS');
