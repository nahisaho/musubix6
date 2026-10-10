import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const script = '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs';
const file = '.sdd/config.json', config = JSON.parse(fs.readFileSync(file, 'utf8'));
function run(args) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  console.log(`exit ${result.status}\n${result.stdout}${result.stderr}`);
  return result.status;
}
config.testCmd[3] = '{id}(?![0-9A-Za-z])';
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
assert.equal(run([script, '--root', '.', 'tdd', 'red', 'TEST-NOMATCH-001']), 0);
try {
  config.testCmd[3] = 'THIS-PATTERN-SELECTS-NO-TESTS';
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  assert.equal(run([script, '--root', '.', 'tdd', 'green', 'TEST-NOMATCH-001']), 0);
  assert.equal(run(['--test', 'TEST-NOMATCH-001.test.mjs']), 1);
} finally {
  config.testCmd[3] = '{id}(?![0-9A-Za-z])';
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}
