import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const script = '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs';
function run(...args) {
  const result = spawnSync('node', [script, '--root', '.', ...args], { encoding: 'utf8' });
  console.log(result.stdout + result.stderr);
  return result;
}
const original = readFileSync('src/value.js', 'utf8');
try {
  writeFileSync('src/value.js', original.replace('return 1', 'return 0'));
  assert.equal(run('tdd', 'red', 'TEST-CHANGED-001').status, 0);
  writeFileSync('src/value.js', original);
  assert.equal(run('tdd', 'green', 'TEST-CHANGED-001').status, 0);
  assert.equal(run('gate').status, 0);
  writeFileSync('src/value.js', original.replace('return 1', 'return 2'));
  const changed = run('gate', '--changed');
  const full = run('gate');
  assert.equal(changed.status, 0, 'currently produces false PASS');
  assert.match(changed.stdout, /no changed files.*skipped/);
  assert.equal(full.status, 1, 'full gate correctly fails');
  console.log('CONFIRMED: nested changed gate falsely PASSes a failing implementation');
} finally {
  writeFileSync('src/value.js', original);
}
