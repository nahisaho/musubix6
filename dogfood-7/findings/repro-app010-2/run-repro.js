import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = 'src/box.js';
if (existsSync(source)) unlinkSync(source);
try {
  const result = spawnSync('node', [
    '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs', '--root', '.',
    'tdd', 'stub', 'TEST-STUB-001'
  ], { encoding: 'utf8' });
  console.log(result.stdout + result.stderr);
  assert.equal(result.status, 0);
  const text = readFileSync(source, 'utf8');
  console.log(text);
  assert.match(text, /second\(/, 'currently emits a method used only by the sibling test');
  console.log('CONFIRMED: JS stub generation escapes the requested test scope');
} finally {
  if (existsSync(source)) unlinkSync(source);
}
