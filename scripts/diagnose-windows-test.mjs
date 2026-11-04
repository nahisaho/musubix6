import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

assert.equal(process.platform, 'linux');
fs.accessSync('/usr/bin/timeout', fs.constants.X_OK);
const target = '.github/skills/lean-sdd-tdd/scripts/windows-runner.test.mjs';
const original = fs.readFileSync(target, 'utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),
  '39ddf70f9324fa35fb3df8b91bbabc54a1f2f3cf03a57ad1a58ef85af331d4b9');
fs.mkdirSync('test-logs', { recursive: true });
const log = path.resolve('test-logs/windows-spawns.jsonl');
fs.writeFileSync(log, JSON.stringify({
  diagnosticOnly: true, qualificationCredit: 0, parentSource: 'e6ea683c05e30ecb18612d7ae16d006e32da6131',
  perturbations: 'Per-child GNU timeout process groups (original explicit deadline or30s), direct progress records; not unmodified acceptance or qualification.',
}) + '\n');
const replacement = `import { spawnSync as nativeSpawnSync } from 'node:child_process';
const diagnosticLog = ${JSON.stringify(log)};
const diagnosticRecord = row => fs.appendFileSync(diagnosticLog,
  JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...row }) + '\\n');
let diagnosticSequence = 0;
process.on('beforeExit', code => diagnosticRecord({ phase: 'beforeExit', code,
  resources: process.getActiveResourcesInfo() }));
process.on('exit', code => diagnosticRecord({ phase: 'exit', code }));
function spawnSync(command, args, options = {}) {
  const sequence = ++diagnosticSequence, started = Date.now();
  const deadlineMs = Math.min(options.timeout ?? 30000, 30000);
  diagnosticRecord({ phase: 'start', sequence, command, args, deadlineMs });
  const result = nativeSpawnSync('/usr/bin/timeout',
    ['--signal=TERM', '--kill-after=5s', (deadlineMs / 1000) + 's', command, ...args],
    { ...options, timeout: deadlineMs + 10000, killSignal: 'SIGKILL' });
  diagnosticRecord({ phase: 'end', sequence, elapsedMs: Date.now() - started,
    status: result.status, signal: result.signal, error: result.error?.code ?? null });
  return result;
}`;
const hook = "after(() => fs.rmSync(work, { recursive: true, force: true }));";
assert.equal(original.split("import { spawnSync } from 'node:child_process';").length, 2);
assert.equal(original.split(hook).length, 2);
fs.writeFileSync(target, original
  .replace("import { spawnSync } from 'node:child_process';", replacement)
  .replace(hook, `after(() => {
    diagnosticRecord({ phase: 'cleanup-start' });
    fs.rmSync(work, { recursive: true, force: true });
    diagnosticRecord({ phase: 'cleanup-end', resources: process.getActiveResourcesInfo() });
  });`));
console.log('Diagnostic instrumentation only; no release qualification or original-source PASS follows.');
