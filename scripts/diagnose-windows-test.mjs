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
const firstMutation = '\n  for (const file of [';
const finalTest = '\n/** @id TEST-WINRUN-004';
const mutationStart = original.indexOf(firstMutation), finalStart = original.indexOf(finalTest);
assert.ok(mutationStart > 0 && finalStart > mutationStart);
assert.equal(original.slice(0, mutationStart).split('  checkGate();').length, 2);
const focused = original.slice(0, mutationStart).replace('  checkGate();',
  '  for (let diagnosticIteration = 0; diagnosticIteration < 21; diagnosticIteration++) checkGate();')
  + '\n});\n' + original.slice(finalStart);
fs.writeFileSync(target, focused
  .replace("import { spawnSync } from 'node:child_process';", replacement)
  .replace(hook, `after(() => {
    diagnosticRecord({ phase: 'cleanup-start' });
    fs.rmSync(work, { recursive: true, force: true });
    diagnosticRecord({ phase: 'cleanup-end', resources: process.getActiveResourcesInfo() });
  });`));
const core = fs.readFileSync('.github/skills/lean-sdd-tdd/scripts/sdd.mjs', 'utf8');
const imports = `planningModules = await Promise.all([import('./implementation-plan.mjs'),
      import('./implementation-plan-evidence.mjs'), import('./implementation-plan-cli.mjs')]);`;
assert.equal(core.split(imports).length, 2);
const variants = {
  baseline: core,
  drain: core.replace(imports, `const _pendingImports = [import('./implementation-plan.mjs'),
      import('./implementation-plan-evidence.mjs'), import('./implementation-plan-cli.mjs')];
    planningModules = await Promise.all(_pendingImports).catch(async error => {
      await Promise.allSettled(_pendingImports);
      throw error;
    });`),
  missing: core.replace('if (planningCommand) {', `if (planningCommand &&
  ['./implementation-plan.mjs', './implementation-plan-evidence.mjs', './implementation-plan-cli.mjs']
    .every(file => fs.existsSync(new URL(file, import.meta.url)))) {`),
};
for (const [name, value] of Object.entries(variants)) {
  fs.writeFileSync(path.join('test-logs', `sdd-${name}.mjs`), value);
}
assert.equal(fs.readFileSync('test-logs/sdd-baseline.mjs', 'utf8'), core);
fs.writeFileSync('test-logs/comparison.json', JSON.stringify({
  diagnosticOnly: true, qualificationCredit: 0, cliExitHooks: false,
  gatePairsPerVariant: 21, baselineSha256: createHash('sha256').update(core).digest('hex'),
  limit: 'Timing-sensitive diagnostic; passing baseline cannot establish a fix or clear failed candidate CI.',
}, null, 2) + '\n');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.test = 'node --test --test-reporter=tap --test-name-pattern=TEST-WINRUN-003 .github/skills/lean-sdd-tdd/scripts/windows-runner.test.mjs';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Diagnostic instrumentation only; no release qualification or original-source PASS follows.');
