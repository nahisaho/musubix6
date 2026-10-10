import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

assert.equal((1 << 12) - 1, 4095);
assert.equal(Math.min(Number.MAX_SAFE_INTEGER, 1e200 * 1e200), Number.MAX_SAFE_INTEGER);
assert.equal(JSON.parse(JSON.stringify({ rows: 0, nullFraction: 1 })).rows, 0);
const child = spawnSync(process.execPath, ['--input-type=module', '-e', 'process.stdout.write(JSON.stringify(JSON.parse(await new Response(process.stdin).text())))'], {
  input: '{"kind":"scan"}', encoding: 'utf8'
});
assert.equal(child.status, 0, child.stderr);
assert.deepEqual(JSON.parse(child.stdout), { kind: 'scan' });
console.log('spike: bitmasks, saturation, JSON and Node stdin subprocess passed');
