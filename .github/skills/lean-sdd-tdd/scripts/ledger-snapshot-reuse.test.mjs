import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scripts, 'sdd.mjs');
const source = fs.readFileSync(cli, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsr-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.sdd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  return root;
}

function scanApi(root, gitFails = false) {
  const start = source.indexOf('// ---------- scanning ----------');
  const end = source.indexOf('const ID_RE =', start);
  const block = source.slice(start, end);
  const api = vm.runInNewContext(`(function(){${block}
    return { listFiles, workspaceFiles,
      invalidateSourceList: typeof invalidateSourceList === 'function' ? invalidateSourceList : null };
  })()`, {
    fs, path, ROOT: root, CONFIG: path.join(root, '.sdd/config.json'),
    perfReference: false,
    readJson: () => null,
    tracedSpawnSync: (command, args, options) => gitFails
      ? { status: 1, stdout: '', stderr: 'simulated Git failure' }
      : spawnSync(command, args, options),
  });
  return api;
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

function ledgerEvent(seq, feature, previous = '') {
  const event = { v: 1, seq, type: 'approval', feature, approvalSha: 'a'.repeat(64),
    at: `2026-01-01T00:00:0${seq}.000Z`, prev: previous };
  event.hash = sha(JSON.stringify(event));
  return event;
}

function ledgerBytes(events) {
  return Buffer.from(events.map(event => JSON.stringify(event)).join('\n') + '\n');
}

function ledgerApi(root, options = {}) {
  const instrumentationStart = source.indexOf('/** @id CODE-LPB-001');
  const instrumentationEnd = source.indexOf('const BOOL =', instrumentationStart);
  const instrumentation = source.slice(instrumentationStart, instrumentationEnd);
  const ledgerStart = source.indexOf('function readLedger()');
  const ledgerEnd = source.indexOf('// every baseline ledger entry must survive', ledgerStart);
  const ledger = source.slice(ledgerStart, ledgerEnd);
  const regressionStart = source.indexOf('function ledgerRegression(');
  const regressionEnd = source.indexOf('let REQ_SHA = null;', regressionStart);
  const regression = source.slice(regressionStart, regressionEnd);
  const file = path.join(root, '.sdd/tdd.jsonl');
  const messages = [];
  const process = {
    env: { MUSUBIX_PERF_TRACE: options.trace === false ? '0' : '1',
      ...(options.reference ? { MUSUBIX_PERF_REFERENCE: '1' } : {}) },
    on() {},
    exit(code) { throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code }); },
  };
  const fileSystem = options.fs ?? fs;
  return vm.runInNewContext(`(function(){${instrumentation}
    const ROOT = ${JSON.stringify(root)}, LEDGER = ${JSON.stringify(file)}, SDD = path.dirname(LEDGER);
    ${ledger}
    ${regression}
    return { readLedger, verifyChain, appendLedger, appendLedgerLocked, ledgerRegression, perf, messages };
  })()`, {
    fs: fileSystem, path, process, Buffer, createHash, sha, spawnSync, Atomics, Int32Array,
    SharedArrayBuffer, out: text => messages.push(String(text)),
    rel: value => path.relative(root, value), messages,
  });
}

function testHashApi(root, options = {}) {
  const start = source.indexOf('let eolNorm = false;');
  const end = source.indexOf('const testOwnSha =', start);
  assert.ok(start >= 0 && end > start, 'test hash implementation is present');
  const reads = [];
  const fileSystem = new Proxy(fs, {
    get(target, property) {
      if (property === 'readFileSync') return (file, ...args) => {
        reads.push(path.resolve(file));
        return fs.readFileSync(file, ...args);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return vm.runInNewContext(`(function(){${source.slice(start, end)}
    return { testShaVariant,
      clear: typeof clearTestShaVariantCache === 'function' ? clearTestShaVariantCache : null,
      reads,
      setReference(value) { perfReference = value; } };
  })()`, {
    fs: fileSystem, path, ROOT: root, sha: value => sha(value),
    perfReference: options.reference ?? false, reads,
    stripCodeAnn: false, cLegacy: false, symbolOff: false, symbolMode: () => false,
    normImports: value => value, BRACE_TEST: /\.(rs|java|php|cs|c|cc|cpp|cxx)$/,
    pythonTestSha() {}, braceTestSha() {}, juliaTestSha() {},
  });
}

/** @id TEST-LSR-001 @verifies REQ-LSR-001 */
test('TEST-LSR-001 source snapshots are process-local', t => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  const firstProcess = scanApi(root);
  assert.deepEqual([...firstProcess.listFiles()], ['src/a.js']);

  fs.writeFileSync(path.join(root, 'src/b.js'), 'export const b = 2;\n');
  assert.deepEqual([...firstProcess.listFiles()], ['src/a.js'], 'the process keeps its captured list');
  const secondProcess = scanApi(root);
  assert.deepEqual([...secondProcess.listFiles()], ['src/a.js', 'src/b.js'],
    'a new process sees the updated file set');
});

/** @id TEST-LSR-002 @verifies REQ-LSR-002 */
test('TEST-LSR-002 source cache invalidation and Git fallback preserve filters', t => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sdd/hidden.js'), '');
  fs.writeFileSync(path.join(root, 'vendor/hidden.js'), '');
  fs.writeFileSync(path.join(root, 'node_modules/pkg/hidden.js'), '');
  fs.writeFileSync(path.join(root, '.gitignore'), 'vendor/\nnode_modules/\n');
  git(root, 'init', '-q');

  const api = scanApi(root);
  assert.deepEqual([...api.listFiles()], ['src/a.js']);
  fs.writeFileSync(path.join(root, 'src/b.js'), 'export const b = 2;\n');
  assert.deepEqual([...api.listFiles()], ['src/a.js'], 'external changes remain point-in-time');
  assert.equal(typeof api.invalidateSourceList, 'function');
  api.invalidateSourceList();
  assert.deepEqual([...api.listFiles()], ['src/a.js', 'src/b.js']);

  const fallback = scanApi(root, true);
  assert.deepEqual([...fallback.listFiles()], ['src/a.js', 'src/b.js'],
    'Git failure uses the existing filtered filesystem fallback');
});

/** @id TEST-LSR-003 @verifies REQ-LSR-003 */
test('TEST-LSR-003 unchanged ledger reuses parse/verify; changed signature refreshes', t => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, 'src/a.js'), '');
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'LSR Test');
  git(root, 'config', 'user.email', 'lsr@example.invalid');
  const initial = ledgerEvent(1, 'before');
  const file = path.join(root, '.sdd/tdd.jsonl');
  fs.writeFileSync(file, ledgerBytes([initial]));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial ledger');

  const api = ledgerApi(root);
  assert.equal(api.verifyChain(api.readLedger()), null);
  assert.ok(Object.isFrozen(api.readLedger()), 'cached ledger event arrays cannot be mutated by consumers');
  assert.ok(Object.isFrozen(api.readLedger()[0]), 'cached ledger events cannot be mutated by consumers');
  const afterFirst = structuredClone(api.perf.ledger);
  assert.equal(api.verifyChain(api.readLedger()), null);
  assert.equal(JSON.stringify(api.perf.ledger), JSON.stringify(afterFirst),
    'unchanged read/parse/verify work is reused');

  const referenceApi = ledgerApi(root, { reference: true });
  const firstReferenceRead = referenceApi.readLedger();
  const secondReferenceRead = referenceApi.readLedger();
  assert.notStrictEqual(firstReferenceRead, secondReferenceRead,
    'reference mode does not reuse the ledger snapshot');
  assert.equal(referenceApi.perf.ledger.read.count, 2);
  assert.equal(referenceApi.perf.ledger.parse.count, 2);
  const untracedReferenceApi = ledgerApi(root, { reference: true, trace: false });
  const firstUntracedRead = untracedReferenceApi.readLedger();
  const secondUntracedRead = untracedReferenceApi.readLedger();
  assert.strictEqual(firstUntracedRead, secondUntracedRead,
    'reference flag has no effect without performance tracing');

  const updated = ledgerEvent(1, 'after!');
  const replacement = path.join(root, '.sdd/replacement.jsonl');
  fs.writeFileSync(replacement, ledgerBytes([updated]));
  const originalStat = fs.statSync(file);
  fs.renameSync(replacement, file);
  fs.utimesSync(file, originalStat.atime, originalStat.mtime);
  assert.equal(fs.statSync(file).size, originalStat.size, 'same-size rewrite control');
  assert.ok(Math.abs(fs.statSync(file).mtimeMs - originalStat.mtimeMs) <= 1,
    'restored mtime control within filesystem precision');
  assert.equal(api.verifyChain(api.readLedger()), null);
  assert.equal(api.readLedger()[0].feature, 'after!', 'inode/ctime change refreshes the snapshot');

  const headRoot = workspace(t);
  git(headRoot, 'init', '-q');
  git(headRoot, 'config', 'user.name', 'LSR Test');
  git(headRoot, 'config', 'user.email', 'lsr@example.invalid');
  const base = ledgerEvent(1, 'base');
  const headFile = path.join(headRoot, '.sdd/tdd.jsonl');
  fs.writeFileSync(headFile, ledgerBytes([base]));
  git(headRoot, 'add', '.');
  git(headRoot, 'commit', '-qm', 'pinned head');
  const pinned = ledgerApi(headRoot);
  assert.equal(pinned.ledgerRegression(), null);
  const next = ledgerEvent(2, 'next', base.hash);
  fs.writeFileSync(headFile, ledgerBytes([base, next]));
  git(headRoot, 'add', '.');
  git(headRoot, 'commit', '-qm', 'advance head');
  fs.writeFileSync(headFile, ledgerBytes([base]));
  assert.equal(pinned.ledgerRegression(), null, 'HEAD baseline stays pinned for this process');
  const candidateRegression = ledgerApi(headRoot).ledgerRegression();
  const referenceRegression = ledgerApi(headRoot, { reference: true }).ledgerRegression();
  assert.match(candidateRegression, /of HEAD removed or modified/);
  assert.equal(referenceRegression, candidateRegression,
    'reference mode preserves HEAD in ledger regression diagnostics');

  const hashRoot = workspace(t);
  const hashFile = path.join(hashRoot, 'shared.test.mjs');
  const firstText = `/** @id TEST-CACHE-001 */\ntest('TEST-LSR-003 unchanged ledger reuses parse/verify; changed signature refreshes', () => assert.equal(1, 1));\n`;
  fs.writeFileSync(hashFile, firstText);
  const hashApi = testHashApi(hashRoot);
  const firstHash = hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true);
  assert.equal(hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true), firstHash);
  assert.equal(hashApi.reads.length, 1,
    'unchanged test input must reuse one scoped hash computation');
  const hashStat = fs.statSync(hashFile);
  const secondText = firstText.replace('1, 1', '2, 2');
  assert.equal(Buffer.byteLength(secondText), Buffer.byteLength(firstText));
  fs.writeFileSync(hashFile, secondText);
  fs.utimesSync(hashFile, hashStat.atime, hashStat.mtime);
  const secondHash = hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true);
  assert.notEqual(secondHash, firstHash, 'same-size edits invalidate cached test hashes');
  assert.equal(hashApi.reads.length, 2);
  assert.equal(typeof hashApi.clear, 'function', 'verification boundaries can clear test hash results');
  hashApi.clear();
  hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true);
  assert.equal(hashApi.reads.length, 3, 'clearing forces fresh input processing');
  hashApi.setReference(true);
  hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true);
  hashApi.testShaVariant('shared.test.mjs', 'TEST-CACHE-001', true, true);
  assert.equal(hashApi.reads.length, 5, 'reference mode bypasses test hash reuse');

  const unbornRoot = workspace(t);
  git(unbornRoot, 'init', '-q');
  const unresolved = spawnSync(process.execPath, [cli, 'tdd', 'check', '--root', unbornRoot],
    { encoding: 'utf8', env: { ...process.env, MUSUBIX_PERF_TRACE: '1' } });
  assert.equal(unresolved.status, 1, 'unresolved HEAD fails before ledger evidence');
  assert.match(unresolved.stdout, /LEDGER FAIL: .*unresolved HEAD/i);
  assert.equal(fs.existsSync(path.join(unbornRoot, '.sdd/tdd.jsonl')), false,
    'unresolved HEAD does not create ledger evidence');
  const unresolvedReference = spawnSync(process.execPath, [cli, 'tdd', 'check', '--root', unbornRoot],
    { encoding: 'utf8', env: { ...process.env, MUSUBIX_PERF_TRACE: '1', MUSUBIX_PERF_REFERENCE: '1' } });
  assert.equal(unresolvedReference.status, unresolved.status);
  assert.equal(unresolvedReference.stdout, unresolved.stdout,
    'reference mode preserves the unresolved-HEAD error');

  const nonGitRoot = workspace(t);
  const nonGit = spawnSync(process.execPath, [cli, 'tdd', 'check', '--root', nonGitRoot],
    { encoding: 'utf8', env: { ...process.env, MUSUBIX_PERF_TRACE: '1' } });
  const nonGitReference = spawnSync(process.execPath, [cli, 'tdd', 'check', '--root', nonGitRoot],
    { encoding: 'utf8', env: { ...process.env, MUSUBIX_PERF_TRACE: '1', MUSUBIX_PERF_REFERENCE: '1' } });
  assert.equal(nonGitReference.status, nonGit.status);
  assert.equal(nonGitReference.stdout, nonGit.stdout,
    'reference mode preserves non-repository behavior');

  const planRoot = workspace(t);
  fs.mkdirSync(path.join(planRoot, '.sdd/specs'), { recursive: true });
  git(planRoot, 'init', '-q');
  git(planRoot, 'config', 'user.name', 'LSR Test');
  git(planRoot, 'config', 'user.email', 'lsr@example.invalid');
  const features = [], tasks = [];
  for (const id of ['A', 'B', 'C']) {
    const feature = id.toLowerCase(), req = `REQ-FIX-${id}`, testId = `TEST-FIX-${id}`;
    const spec = `.sdd/specs/${feature}.md`, testFile = `${feature}.test.mjs`;
    fs.writeFileSync(path.join(planRoot, spec),
      `---\nfeature: ${feature}\ntier: T1\n---\n| ${req} | When checked, the system shall retain the fixture state. (test-only) | ${testId} |\n`);
    fs.writeFileSync(path.join(planRoot, testFile),
      `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n/** @id ${testId} @verifies ${req} */\ntest('${testId}', () => assert.equal(1, 1));\n`);
    features.push({ id: feature, dependsOn: [] });
    tasks.push({
      id: `TASK-${id}`, feature, kind: 'implementation', reqs: [req], dependsOn: [],
      artifacts: [spec, testFile], condition: 'The current test and specification are readable.',
      tests: [testId],
      checks: [{ name: 'fixture', argv: [process.execPath, '-e', ''], timeoutMs: 10000 }],
      specs: { [spec]: sha(fs.readFileSync(path.join(planRoot, spec))) }, dependencies: {},
      status: 'not-started', receipt: null,
    });
  }
  fs.writeFileSync(path.join(planRoot, '.sdd/config.json'), JSON.stringify({
    planning: { required: true },
    testCmd: [process.execPath, '--test', '--test-name-pattern', '{id}', '{file}'],
  }));
  fs.writeFileSync(path.join(planRoot, '.sdd/implementation-plan.json'), JSON.stringify({
    schemaVersion: 1, features, tasks,
  }));
  const planLedger = path.join(planRoot, '.sdd/tdd.jsonl');
  const planLedgerBytes = ledgerBytes([ledgerEvent(1, 'plan-check')]);
  fs.writeFileSync(planLedger, planLedgerBytes);
  git(planRoot, 'add', '.');
  git(planRoot, 'commit', '-qm', 'plan-check fixture');

  const planCheck = spawnSync(process.execPath, [cli, 'plan', 'check', '--json', '--root', planRoot],
    { cwd: planRoot, encoding: 'utf8', timeout: 60000,
      maxBuffer: 8 * 1024 * 1024, env: { ...process.env, MUSUBIX_PERF_TRACE: '1' } });
  assert.ifError(planCheck.error);
  assert.equal(planCheck.signal, null);
  assert.equal(planCheck.status, 0, planCheck.stdout + planCheck.stderr);
  const planDecision = JSON.parse(planCheck.stdout);
  assert.equal(planDecision.status, 'PASS');
  assert.deepEqual(planDecision.tasks.map(task => task.state), ['not-started', 'not-started', 'not-started']);
  const planTrace = JSON.parse(planCheck.stderr.trim());
  for (const stage of ['read', 'parse', 'verify']) {
    assert.equal(planTrace.ledger[stage].count, 1,
      `plan check must reuse one shared native-ledger ${stage} snapshot across tasks`);
  }
  const referenceCheck = spawnSync(process.execPath, [cli, 'plan', 'check', '--json', '--root', planRoot],
    { cwd: planRoot, encoding: 'utf8', timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, MUSUBIX_PERF_TRACE: '1', MUSUBIX_PERF_REFERENCE: '1' } });
  assert.ifError(referenceCheck.error);
  assert.equal(referenceCheck.signal, null);
  assert.equal(referenceCheck.status, 0, referenceCheck.stdout + referenceCheck.stderr);
  assert.equal(referenceCheck.stdout, planCheck.stdout,
    'reference mode must preserve plan check decisions and output');
  const referenceTrace = JSON.parse(referenceCheck.stderr.trim());
  for (const stage of ['read', 'parse', 'verify']) {
    assert.equal(referenceTrace.ledger[stage].count, stage === 'verify' ? 6 : 3,
      `reference mode must bypass the shared native-ledger ${stage} snapshot`);
  }
  assert.deepEqual(fs.readFileSync(planLedger), planLedgerBytes,
    'read-only plan check must preserve the native ledger bytes');

  const verifyRoot = workspace(t);
  fs.mkdirSync(path.join(verifyRoot, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(verifyRoot, 'src'), { recursive: true });
  git(verifyRoot, 'init', '-q');
  git(verifyRoot, 'config', 'user.name', 'LSR Test');
  git(verifyRoot, 'config', 'user.email', 'lsr@example.invalid');
  const verifyReq = 'REQ-FIX-VERIFY';
  const verifyTest = 'TEST-LSR-003';
  const verifySpec = '.sdd/specs/verify.md';
  const verifyTestFile = 'verify.test.mjs';
  const verifySource = 'src/value.mjs';
  fs.writeFileSync(path.join(verifyRoot, verifySpec),
    `---\nfeature: verify\ntier: T1\n---\n| ${verifyReq} | When evaluated, the system shall return the expected value. | ${verifyTest} |\n`);
  fs.writeFileSync(path.join(verifyRoot, verifyTestFile),
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { value } from './src/value.mjs';\n/** @id ${verifyTest} @verifies ${verifyReq} */\ntest('TEST-LSR-003 unchanged ledger reuses parse/verify; changed signature refreshes', () => assert.equal(value(), 1));\n`);
  fs.writeFileSync(path.join(verifyRoot, verifySource),
    `/** @id CODE-FIX-VERIFY @implements ${verifyReq} */\nexport const value = () => 0;\n`);
  fs.writeFileSync(path.join(verifyRoot, '.sdd/config.json'), JSON.stringify({
    planning: { required: true },
    testCmd: [process.execPath, '--test', '--test-name-pattern', '{id}', '{file}'],
  }));
  const appendLedgerEvent = `const fs=require('node:fs'),{createHash}=require('node:crypto'),file='.sdd/tdd.jsonl';const rows=fs.readFileSync(file,'utf8').trimEnd().split('\\n').map(JSON.parse);const event={v:1,seq:rows.length+1,type:'approval',feature:'post-check',approvalSha:'a'.repeat(64),at:new Date().toISOString(),prev:rows.at(-1)?.hash??''};event.hash=createHash('sha256').update(JSON.stringify(event)).digest('hex');fs.appendFileSync(file,JSON.stringify(event)+'\\n');`;
  fs.writeFileSync(path.join(verifyRoot, '.sdd/implementation-plan.json'), JSON.stringify({
    schemaVersion: 1,
    features: [{ id: 'verify', dependsOn: [] }],
    tasks: [{
      id: 'TASK-VERIFY', feature: 'verify', kind: 'implementation', reqs: [verifyReq],
      dependsOn: [], artifacts: [verifySpec, verifySource, verifyTestFile],
      condition: 'The current test and implementation are readable.', tests: [verifyTest],
      checks: [{ name: 'append-ledger-event', argv: [process.execPath, '-e', appendLedgerEvent], timeoutMs: 10000 }],
      specs: { [verifySpec]: sha(fs.readFileSync(path.join(verifyRoot, verifySpec))) },
      dependencies: {}, status: 'in-progress', receipt: null,
    }],
  }));
  git(verifyRoot, 'add', '.');
  git(verifyRoot, 'commit', '-qm', 'plan-verify fixture');
  const verifyCli = (...args) => spawnSync(process.execPath, [cli, ...args, '--root', verifyRoot],
    { cwd: verifyRoot, encoding: 'utf8', timeout: 60000,
      maxBuffer: 8 * 1024 * 1024, env: { ...process.env, MUSUBIX_PERF_TRACE: '0' } });
  const verifyRed = verifyCli('tdd', 'red', verifyTest);
  assert.ifError(verifyRed.error);
  assert.equal(verifyRed.status, 0, verifyRed.stdout + verifyRed.stderr);
  fs.writeFileSync(path.join(verifyRoot, verifySource),
    `/** @id CODE-FIX-VERIFY @implements ${verifyReq} */\nexport const value = () => 1;\n`);
  const verifyGreen = verifyCli('tdd', 'green', verifyTest);
  assert.ifError(verifyGreen.error);
  assert.equal(verifyGreen.status, 0, verifyGreen.stdout + verifyGreen.stderr);
  const verifiedPlan = spawnSync(process.execPath, [cli, 'plan', 'verify', 'TASK-VERIFY', '--json', '--root', verifyRoot],
    { cwd: verifyRoot, encoding: 'utf8', timeout: 60000,
      maxBuffer: 8 * 1024 * 1024, env: { ...process.env, MUSUBIX_PERF_TRACE: '1' } });
  assert.ifError(verifiedPlan.error);
  assert.equal(verifiedPlan.signal, null);
  assert.equal(verifiedPlan.status, 0, verifiedPlan.stdout + verifiedPlan.stderr);
  assert.equal(JSON.parse(verifiedPlan.stdout).status, 'PASS');
  const verifyTrace = JSON.parse(verifiedPlan.stderr.trim());
  assert.ok(verifyTrace.ledger.read.count >= 2,
    `plan verify rereads the ledger for the post-command evaluation: ${JSON.stringify(verifyTrace.ledger)}`);
  const verifyPlanPath = path.join(verifyRoot, '.sdd/implementation-plan.json');
  const verifyPlanModel = JSON.parse(fs.readFileSync(verifyPlanPath, 'utf8'));
  verifyPlanModel.tasks[0].checks = [{
    name: 'mutate-source-during-verification',
    argv: [process.execPath, '-e',
      `require('node:fs').appendFileSync('${verifySource}', '\\n// changed during verification\\n');`],
    timeoutMs: 10000,
  }];
  fs.writeFileSync(verifyPlanPath, JSON.stringify(verifyPlanModel));
  const changedDuringVerify = spawnSync(process.execPath,
    [cli, 'plan', 'verify', 'TASK-VERIFY', '--json', '--root', verifyRoot],
    { cwd: verifyRoot, encoding: 'utf8', timeout: 60000,
      maxBuffer: 8 * 1024 * 1024, env: { ...process.env, MUSUBIX_PERF_TRACE: '1' } });
  assert.ifError(changedDuringVerify.error);
  assert.equal(changedDuringVerify.signal, null);
  assert.equal(changedDuringVerify.status, 1, changedDuringVerify.stdout + changedDuringVerify.stderr);
  assert.ok(JSON.parse(changedDuringVerify.stdout).errors
    .some(error => error.reason === 'task inputs changed during verification'),
  'post-command source changes cannot reuse the prior verification input snapshot');
});

/** @id TEST-LSR-004 @verifies REQ-LSR-004 */
test('TEST-LSR-004 locked append preserves current bytes and concurrent events', t => {
  const root = workspace(t);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'LSR Test');
  git(root, 'config', 'user.email', 'lsr@example.invalid');
  const first = ledgerEvent(1, 'one');
  const file = path.join(root, '.sdd/tdd.jsonl');
  const initial = ledgerBytes([first]);
  fs.writeFileSync(file, initial);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial ledger');
  const api = ledgerApi(root);
  api.readLedger();
  const stable = structuredClone(api.perf.ledger);
  api.readLedger();
  assert.equal(JSON.stringify(api.perf.ledger), JSON.stringify(stable),
    'unchanged read is reused before append');

  const second = ledgerEvent(2, 'two', first.hash);
  fs.appendFileSync(file, ledgerBytes([second]));
  const prefix = fs.readFileSync(file);
  api.appendLedger({ type: 'approval', feature: 'three', approvalSha: 'b'.repeat(64) });
  const result = fs.readFileSync(file);
  assert.ok(result.subarray(0, prefix.length).equals(prefix), 'append retains exact prior bytes');
  const afterAppend = structuredClone(api.perf.ledger);
  assert.equal(api.verifyChain(api.readLedger()), null);
  assert.equal(api.readLedger().length, 3, 'cache is invalidated after append');
  assert.equal(api.perf.ledger.read.count, afterAppend.read.count + 1,
    'post-append read reloads the invalidated snapshot');
  assert.equal(fs.existsSync(path.join(root, '.sdd/tdd.lock')), false, 'lock released');
});

/** @id TEST-LSR-005 @verifies REQ-LSR-003 */
test('TEST-LSR-005 repeated stale ledger refresh fails closed with exit 2', t => {
  const root = workspace(t);
  const file = path.join(root, '.sdd/tdd.jsonl');
  const a = ledgerEvent(1, 'first');
  const b = ledgerEvent(1, 'other');
  fs.writeFileSync(file, ledgerBytes([a]));
  const immutable = ledgerApi(root);
  assert.ok(Object.isFrozen(immutable.readLedger()), 'stale retries start from an immutable cached ledger');
  let reads = 0;
  const wrappedFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'readFileSync') return (name, ...args) => {
        const bytes = fs.readFileSync(name, ...args);
        if (path.resolve(name) === file) {
          reads++;
          fs.writeFileSync(file, ledgerBytes([reads % 2 ? b : a]));
        }
        return bytes;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const api = ledgerApi(root, { fs: wrappedFs });
  assert.throws(() => api.readLedger(), error => error.exitCode === 2);
  assert.equal(reads, 2, 'refresh is bounded to one retry');
  assert.match(api.messages.join('\n'),
    /LEDGER STALE: \.sdd\/tdd\.jsonl changed during snapshot refresh; aborting/);
});
