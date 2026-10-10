import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const script = '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs';
for (const [name, flags, expected] of [['full', [], 1], ['changed', ['--changed'], 0]]) {
  const result = spawnSync(process.execPath, [script, '--root', '.', 'gate', ...flags], { encoding: 'utf8' });
  console.log(`${name}: exit ${result.status}\n${result.stdout}`);
  assert.equal(result.status, expected);
}
