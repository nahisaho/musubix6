import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scripts, 'sdd.mjs');
const harnessFile = path.join(scripts, 'ledger-performance-baseline.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
delete environment.MUSUBIX_PERF_TRACE;
function workspace(t) {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.lpb-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: environment });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function repository(t) {
  const root = workspace(t);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Baseline Test');
  git(root, 'config', 'user.email', 'baseline@example.invalid');
  fs.mkdirSync(path.join(root, '.sdd'), { recursive: true });
  const event = { v: 1, seq: 1, type: 'approval', feature: 'historical',
    approvalSha: 'a'.repeat(64), at: '2026-01-01T00:00:00.000Z', prev: '' };
  event.hash = sha(JSON.stringify(event));
  fs.writeFileSync(path.join(root, '.sdd/tdd.jsonl'), JSON.stringify(event) + '\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return root;
}
async function harness() {
  assert.ok(fs.existsSync(harnessFile), 'standalone baseline harness must exist');
  return import(harnessFile);
}
function traceOf(result) {
  const lines = result.stderr.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `exactly one trace JSON line: ${result.stderr}`);
  return JSON.parse(lines[0]);
}
const metrics = () => ({ schemaVersion: 1, kind: 'musubix-perf-trace', gitSpawns: 2,
  ledger: Object.fromEntries(['read', 'parse', 'verify'].map(stage =>
    [stage, { count: 1, bytes: 42, events: stage === 'read' ? 0 : 1 }])) });
const emptyLedgerShas = () => Object.fromEntries(['checkDefShas', 'admissionShas']
  .map(field => [field, { total: 0, unique: 0, duplicate: 0 }]));
const outcome = (command = 'tdd check') => ({ status: command === 'gate --no-run' ? 2 : 0,
  signal: null, error: null, stdout: command === 'gate --no-run' ? 'INCOMPLETE\n' : 'OK\n',
  stderr: JSON.stringify(metrics()) + '\n' });

/** @id TEST-LPB-001 @verifies REQ-LPB-001 */
test('TEST-LPB-001 opt-in trace counts real boundaries and preserves ordinary outcomes', t => {
  const root = repository(t);
  const invoke = value => spawnSync(process.execPath, [cli, 'tdd', 'check', '--root', root],
    { encoding: 'utf8', env: { ...environment, ...(value === undefined ? {} : { MUSUBIX_PERF_TRACE: value }) } });
  const result = invoke('1');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const trace = traceOf(result);
  const bytes = fs.statSync(path.join(root, '.sdd/tdd.jsonl')).size;
  assert.equal(trace.kind, 'musubix-perf-trace');
  assert.equal(trace.gitSpawns, 2, 'source inventory and pinned baseline lookup are each performed once');
  assert.deepEqual(Object.fromEntries(['read', 'parse', 'verify'].map(key =>
    [key, trace.ledger[key].count])), { read: 2, parse: 2, verify: 1 });
  assert.equal(trace.ledger.read.bytes, bytes * 2);
  assert.equal(trace.ledger.parse.bytes, bytes * 2);
  assert.equal(trace.ledger.verify.bytes, bytes);
  for (const stage of ['read', 'parse', 'verify']) {
    assert.deepEqual(Object.keys(trace.ledger[stage]).sort(), ['bytes', 'count', 'events']);
  }
  for (const value of [undefined, '', '0', 'true', '01', ' 1', '1 ']) {
    const ordinary = invoke(value);
    assert.equal(ordinary.status, result.status);
    assert.equal(ordinary.stdout, result.stdout);
    assert.equal(ordinary.stderr, '');
  }
  const source = fs.readFileSync(cli, 'utf8');
  const block = source.slice(source.indexOf('/** @id CODE-LPB-001'), source.indexOf('const BOOL ='));
  const recordWork = vm.runInNewContext(`(function(){${block}; return ledgerWork;})()`, {
    process: { env: { MUSUBIX_PERF_TRACE: '1' }, on() {} }, Buffer,
    createHash: () => assert.fail('trace counters must not hash full ledger buffers'),
  });
  for (const stage of ['read', 'parse', 'verify']) recordWork(stage, Buffer.from('ledger'));
  assert.ok(block.includes('function tracedSpawnSync'), 'one central subprocess boundary');
  const calls = [], exits = [];
  const fakeProcess = { env: { MUSUBIX_PERF_TRACE: '1' }, on: (name, fn) => exits.push(fn) };
  const boundary = vm.runInNewContext(`(function(){${block}; return tracedSpawnSync;})()`,
    { process: fakeProcess, fs: { writeSync: (_fd, text) => calls.push(JSON.parse(text)) },
      spawnSync: (...args) => { calls.push(args); return args; }, createHash, Buffer, path });
  const executables = ['git', 'GIT', 'git.exe', 'Git.CmD', 'git.bat', 'git.com',
    '/opt/bin/GIT.EXE', 'C:\\Program Files\\Git\\git.exe', '/a/notgit', 'git.sh', 'git.exe.bad', 'node'];
  for (const executable of executables) boundary(executable, ['--version'], { env: { X: '1' } });
  exits[0]();
  assert.equal(calls.at(-1).gitSpawns, 8, 'all finite executable suffix policies and both path separators');
  assert.equal(calls[0][2].env.MUSUBIX_PERF_TRACE, '0', 'descendants do not emit CLI-owned traces');
  const thrown = new Error('spawn boundary failure');
  const throwing = vm.runInNewContext(`(function(){${block}; return tracedSpawnSync;})()`,
    { process: fakeProcess, fs: {}, spawnSync: () => { throw thrown; }, createHash, Buffer, path });
  assert.throws(() => throwing('git', []), error => error === thrown, 'spawn exceptions must propagate');
  assert.equal((source.match(/\bspawnSync\(/g) ?? []).length, 1, 'every direct spawn routes through the wrapper');
  const normalCall = calls[0];
  assert.equal(normalCall[0], 'git');
  assert.deepEqual(normalCall[1], ['--version']);
  const help = spawnSync(process.execPath, [cli, 'tdd', '--help'], {
    encoding: 'utf8', env: { ...environment, MUSUBIX_PERF_TRACE: '1' } });
  assert.equal(help.status, 0);
  assert.equal(traceOf(help).ledger.read.count, 0, 'no invented work for a help-only invocation');
  const merged = spawnSync(process.execPath, [cli, 'tdd', 'merge-ledger', '--root', root], {
    encoding: 'utf8', env: { ...environment, MUSUBIX_PERF_TRACE: '1' } });
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  assert.equal(traceOf(merged).ledger.parse.events, 4,
    'merge parses the retained prefix for ordering and its tail hash, not just input/output batches');
  fs.writeFileSync(path.join(root, '.sdd/tdd.jsonl'), '{broken\n');
  const corrupt = invoke('1');
  assert.equal(corrupt.status, 2);
  assert.match(corrupt.stdout, /LEDGER CORRUPT/);
  assert.equal(traceOf(corrupt).ledger.parse.count, 2,
    'pinned baseline parsing and failed current-ledger parse work are retained');
});

test('TEST-LPB-001 fresh-array verification uses parsed bytes without serializing retained events', t => {
  const root = repository(t);
  const source = fs.readFileSync(cli, 'utf8');
  const instrumentation = source.slice(source.indexOf('/** @id CODE-LPB-001'), source.indexOf('const BOOL ='));
  const ledger = source.slice(source.indexOf('function readLedger()'), source.indexOf('// every baseline ledger entry'));
  const file = path.join(root, '.sdd/tdd.jsonl');
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  event.feature = '履歴';
  delete event.hash;
  event.hash = sha(JSON.stringify(event));
  const bytes = '  ' + JSON.stringify(event) + '\r\n\n';
  fs.writeFileSync(file, bytes);
  const serialized = [];
  const api = vm.runInNewContext(`(function(){${instrumentation}\n${ledger}
    return { readLedger, verifyChain, appendLedgerLocked, ledgerLines, parseLedgerLine, perf };})()`, {
    process: { env: { MUSUBIX_PERF_TRACE: '1' }, on() {} }, Buffer, fs, path,
    LEDGER: file, SDD: path.dirname(file), sha, rel: value => value,
    out: assert.fail, ledgerRegression: () => null,
    JSON: { parse: JSON.parse, stringify: value => {
      if (value?.hash) serialized.push(value);
      return JSON.stringify(value);
    } },
  });
  const entries = api.readLedger();
  assert.equal(api.verifyChain(entries), null, 'valid-input control');
  assert.equal(api.perf.ledger.verify.bytes, Buffer.byteLength(bytes));
  assert.equal(api.perf.ledger.verify.events, 1);
  const fresh = api.ledgerLines(JSON.stringify(event) + '\n').map(api.parseLedgerLine);
  assert.equal(api.verifyChain(fresh), null);
  assert.equal(serialized.length, 0, 'fresh parsed arrays must not reserialize full events');
  assert.equal(api.perf.ledger.verify.bytes, Buffer.byteLength(bytes) + Buffer.byteLength(JSON.stringify(event) + '\n'));
  assert.equal(api.perf.ledger.verify.events, 2);
  const unterminated = '\n\n  ' + JSON.stringify(event) + '\r';
  const priorBytes = api.perf.ledger.verify.bytes;
  assert.equal(api.verifyChain(api.ledgerLines(unterminated).map(api.parseLedgerLine)), null);
  assert.equal(api.perf.ledger.verify.bytes - priorBytes, Buffer.byteLength(unterminated),
    'fresh parsed batches retain blank lines, Unicode, whitespace and absent final newlines');
  assert.equal(api.verifyChain(api.ledgerLines('').map(api.parseLedgerLine)), null);
  assert.equal(api.perf.ledger.verify.bytes - priorBytes, Buffer.byteLength(unterminated),
    'empty batches contribute no bytes');
  serialized.length = 0;
  const before = api.perf.ledger.verify.bytes;
  api.appendLedgerLocked({ type: 'approval', feature: 'new', approvalSha: 'b'.repeat(64) });
  const appended = fs.readFileSync(file).subarray(Buffer.byteLength(bytes));
  assert.equal(serialized.filter(value => value.seq === 1).length, 0,
    'append verification must reuse exact readLedger metadata for the retained prefix');
  assert.equal(api.perf.ledger.verify.bytes - before, Buffer.byteLength(bytes) + appended.length);
  assert.equal(api.perf.ledger.verify.events, 5);
});

/** @id TEST-LPB-002 @verifies REQ-LPB-002 */
test('TEST-LPB-002 fixture copies exact ledger, prepares every command, and cleans on failure', async t => {
  const api = await harness();
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'untracked.bin'), Buffer.from([0, 255, 13, 10]));
  const original = api.snapshotSource(root);
  const work = workspace(t);
  const fixture = api.createFixture({ sourceRoot: root, scriptsRoot: scripts, workRoot: work });
  try {
    assert.deepEqual(fs.readFileSync(path.join(fixture.root, '.sdd/tdd.jsonl')),
      fs.readFileSync(path.join(root, '.sdd/tdd.jsonl')));
    const prepared = api.prepareFixtures(fixture, process.execPath);
    assert.equal(prepared.length, 6);
    const sourceLedger = fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'));
    for (const entry of prepared) {
      assert.ok(fs.readFileSync(path.join(entry.root, '.sdd/tdd.jsonl')).subarray(0, sourceLedger.length).equals(sourceLedger));
      const before = api.fixtureIdentity(entry.root);
      const raw = api.runAttempt({ root: entry.root, runtime: process.execPath,
        command: entry.command, script: cli });
      assert.equal(api.classifyAttempt(entry.command, raw).verdict,
        entry.command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS', JSON.stringify(raw));
      assert.equal(before.ledger.bytes >= sourceLedger.length, true);
    }
    assert.throws(() => api.withWorktree(fixture, fixture.commit, () => { throw new Error('injected trial failure'); }),
      /injected trial failure/);
    const harnessSource = fs.readFileSync(path.join(scripts, 'ledger-performance-baseline.mjs'), 'utf8');
    const actionError = new Error('injected action failure');
    const worktreeCleanupError = new Error('injected worktree cleanup failure');
    const withWorktreeSource = harnessSource.slice(harnessSource.indexOf('export function withWorktree'),
      harnessSource.indexOf('export function createFixture')).replace('export function', 'function');
    const withWorktree = vm.runInNewContext(`(function(){${withWorktreeSource}; return withWorktree;})()`, {
      addWorktree: () => 'trial', removeWorktree: () => { throw worktreeCleanupError; }, AggregateError,
    });
    assert.throws(() => withWorktree({}, 'revision', () => { throw actionError; }), error =>
      error.name === 'AggregateError' && error.errors.includes(actionError) && error.errors.includes(worktreeCleanupError),
    'worktree cleanup preserves both trial and cleanup failures');

    const preparationError = new Error('injected fixture preparation failure');
    const fixtureCleanupError = new Error('injected fixture cleanup failure');
    const prepareSource = harnessSource.slice(harnessSource.indexOf('export function prepareFixtures'),
      harnessSource.indexOf('/** @id CODE-LPB-003')).replace('export function', 'function');
    const prepareFixtures = vm.runInNewContext(`(function(){${prepareSource}; return prepareFixtures;})()`, {
      COMMANDS: ['tdd check'], TEST: 'TEST-LPB-FIXTURE-001', addWorktree: () => { throw preparationError; },
      fs, path, JSON, save() {}, runAttempt() {}, classifyAttempt() {}, withWorktree() {},
      AggregateError,
    });
    assert.throws(() => prepareFixtures({ commit: 'revision', cleanup: () => { throw fixtureCleanupError; } }, process.execPath),
      error => error.name === 'AggregateError' && error.errors.includes(preparationError)
        && error.errors.includes(fixtureCleanupError),
      'fixture cleanup preserves both preparation and cleanup failures');
    const errorRecordSource = harnessSource.slice(harnessSource.indexOf('function errorMessage'),
      harnessSource.indexOf('function childEnvironment'));
    const recordError = vm.runInNewContext(`(function(){${errorRecordSource}; return errorRecord;})()`, { AggregateError });
    const gitCleanupError = new Error('git worktree remove denied');
    const snapshotError = new Error('EISDIR: leftover worktree directory');
    const nestedFailure = new AggregateError([
      new AggregateError([gitCleanupError], 'Fixture cleanup failed'), snapshotError,
    ], 'Source preservation failed');
    assert.match(recordError(nestedFailure).message, /Source preservation failed.*Fixture cleanup failed.*git worktree remove denied.*EISDIR/);
    assert.equal(git(fixture.repository, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 7,
      'failed trial worktree was removed; six prepared worktrees remain');
    fixture.removePrepared();
  } finally { fixture.cleanup(); }
  assert.deepEqual(git(fixture.repository, 'worktree', 'list', '--porcelain').match(/^worktree /gm), ['worktree ']);
  assert.deepEqual(api.snapshotSource(root), original);
  const ledgerFile = path.join(root, '.sdd/tdd.jsonl'), ledgerBytes = fs.readFileSync(ledgerFile);
  fs.appendFileSync(ledgerFile, '\n');
  const changedLedger = api.snapshotSource(root);
  assert.notEqual(changedLedger.ledgerSha256, original.ledgerSha256);
  assert.notEqual(changedLedger.diffSha256, original.diffSha256);
  assert.throws(() => api.assertSourceUnchanged(original, changedLedger), /source snapshot changed/i);
  fs.writeFileSync(ledgerFile, ledgerBytes);
  git(root, 'commit', '--allow-empty', '-qm', 'changed HEAD');
  assert.notEqual(api.snapshotSource(root).head, original.head);
  assert.throws(() => api.assertSourceUnchanged(original, api.snapshotSource(root)), /source snapshot changed/i);
  git(root, 'update-ref', 'HEAD', original.head);
  fs.appendFileSync(path.join(root, 'untracked.bin'), 'tamper');
  assert.throws(() => api.assertSourceUnchanged(original, api.snapshotSource(root)), /source snapshot changed/i);
  fs.writeFileSync(path.join(root, 'untracked.bin'), Buffer.from([0, 255, 13, 10]));
  const report = '.sdd/evidence/declared.json';
  fs.mkdirSync(path.join(root, '.sdd/evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, report), '{}');
  assert.deepEqual(api.snapshotSource(root, report), original, 'only exact declared report is excluded');
  fs.writeFileSync(path.join(root, '.sdd/evidence/other.json'), '{}');
  assert.throws(() => api.assertSourceUnchanged(original, api.snapshotSource(root, report)), /source snapshot changed/i);
  const beforeRun = api.snapshotSource(root);
  const unknown = api.runBaseline({ root, nodes: [path.join(root, 'unavailable-node')] });
  assert.equal(unknown.exit, 2, 'unavailable runtimes are unknown, not passes or measured failures');
  assert.equal(unknown.report.results.length, 30, 'all five runtimes and six commands retain explicit cells');
  assert.ok(unknown.report.results.every(cell => cell.verdict === 'unknown'));
  assert.deepEqual(api.snapshotSource(root, path.relative(root, unknown.file).split(path.sep).join('/')), beforeRun);
  assert.ok(fs.readdirSync(root).every(file => !file.startsWith('.lpb-work-')), 'orchestrator removed scratch data');
});

/** @id TEST-LPB-003 @verifies REQ-LPB-003 */
test('TEST-LPB-003 pairs all 30 cold/warm attempts without dropping failures', async () => {
  const api = await harness();
  const log = [];
  const inputs = [];
  let tick = 0;
  const cell = api.measureCell({ command: 'tdd check',
    ledgerMetrics: emptyLedgerShas,
    prepare: () => ({ hash: 'fixture' }),
    clone: prepared => ({ hash: prepared.hash }),
    dispose: () => {},
    identity: fixture => fixture.hash,
    now: () => ++tick,
    attempt: (_fixture, details) => {
      inputs.push(_fixture);
      log.push([details.ordinal, details.mode, details.warmup, details.timeoutMs]);
      return details.ordinal === 7 && details.mode === 'cold' ? { ...outcome(), status: 1 } : outcome();
    } });
  assert.equal(cell.attempts.length, 60);
  assert.equal(cell.verdict, 'FAIL');
  assert.deepEqual(cell.attempts.filter(attempt => attempt.verdict === 'FAIL').map(attempt =>
    [attempt.ordinal, attempt.mode]), [[7, 'cold']]);
  assert.ok(cell.attempts.every(attempt => attempt.elapsedMs === 1));
  assert.equal(new Set(inputs).size, 90, 'warm-up and measured attempts use separate fixture clones');
  assert.deepEqual(log, Array.from({ length: 30 }, (_, index) => [
    [index + 1, 'cold', false, 120000], [index + 1, 'warm', true, 120000],
    [index + 1, 'warm', false, 120000],
  ]).flat());
  assert.equal(api.validateCell({ ...cell, attempts: cell.attempts.slice(1) }), 'FAIL');
  const mismatch = api.measureCell({ command: 'tdd check', prepare: () => 'a', clone: () => 'b',
    ledgerMetrics: emptyLedgerShas,
    dispose: () => {}, identity: value => value, now: () => ++tick, attempt: () => outcome() });
  assert.equal(mismatch.verdict, 'FAIL', 'non-equivalent cold/warm inputs cannot pass');
  assert.equal(mismatch.attempts.length, 60, 'fixture failure does not omit attempts');
  let invalid;
  assert.doesNotThrow(() => {
    invalid = api.measureCell({ command: 'tdd check', prepare: () => 'a', clone: () => 'a',
      ledgerMetrics: emptyLedgerShas,
      dispose: () => {}, identity: value => value, now: () => ++tick,
      attempt: () => ({ ...outcome(), stderr: '{"schemaVersion":1}\n' }) });
  }, 'malformed traces must produce failed raw attempts, not abort report aggregation');
  assert.equal(invalid.attempts.length, 60);
  assert.equal(invalid.verdict, 'FAIL');
  for (const command of ['tdd check', 'gate --no-run']) {
    const control = api.measureCell({ command, prepare: () => 'valid', clone: () => 'valid',
      ledgerMetrics: emptyLedgerShas,
      dispose: () => {}, identity: value => value, now: () => ++tick, attempt: () => outcome(command) });
    assert.equal(control.verdict, command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS',
      'complete valid evidence must be accepted without relabeling gate INCOMPLETE as PASS');
    assert.equal(control.attempts.length, 60);
  }
});

/** @id TEST-LPB-004 @verifies REQ-LPB-004 */
test('TEST-LPB-004 exact outcomes, runtime unknowns, schema and collision refusal', async t => {
  const api = await harness();
  for (const command of api.COMMANDS) {
    const valid = api.classifyAttempt(command, outcome(command));
    assert.equal(valid.verdict, command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS');
    for (const invalid of [
      { ...outcome(command), stderr: '' }, { ...outcome(command), stderr: '{bad\n' },
      { ...outcome(command), stderr: JSON.stringify({ ...metrics(), gitSpawns: -1 }) },
      { ...outcome(command), stderr: JSON.stringify(metrics()) + '\n' + JSON.stringify(metrics()) },
      { ...outcome(command), status: command === 'gate --no-run' ? 0 : 2 },
      { ...outcome(command), signal: 'SIGTERM' },
      { ...outcome(command), error: { code: 'ETIMEDOUT', message: 'bounded' } },
      { ...outcome(command), error: { code: 'ENOENT', message: 'not an unknown attempt' } },
    ]) assert.equal(api.classifyAttempt(command, invalid).verdict, 'FAIL', JSON.stringify(invalid));
  }
  assert.equal(api.classifyAttempt('gate --no-run', { ...outcome('gate --no-run'), stdout: 'PASS' }).verdict, 'FAIL');
  const missing = api.runtimeMatrix({ platform: 'linux', runtimes: [] });
  assert.equal(missing.length, 5);
  assert.ok(missing.every(cell => cell.status === 'unknown'));
  assert.deepEqual(missing.map(cell => [cell.platform, cell.nodeMajor]),
    [['linux', 22], ['linux', 24], ['win32', 20], ['win32', 22], ['win32', 24]]);
  const available = api.runtimeMatrix({ platform: process.platform,
    runtimes: [{ executable: process.execPath, version: process.version, platform: process.platform }] });
  assert.equal(available.filter(cell => cell.status === 'available').length, 1);
  assert.throws(() => api.runtimeMatrix({ platform: 'linux',
    runtimes: [{ executable: process.execPath, version: 'v22.1.0', platform: 'linux' },
      { executable: process.execPath, version: 'v22.2.0', platform: 'linux' }] }), /duplicate runtime/i);
  const root = repository(t);
  const snapshot = api.snapshotSource(root);
  const report = api.createReport({ sourceSnapshot: snapshot, matrix: missing, results: [] });
  assert.deepEqual(Object.keys(report), ['schemaVersion', 'runId', 'createdAt', 'environment', 'sourceSnapshot', 'matrix', 'results']);
  assert.equal(report.schemaVersion, 1);
  assert.match(report.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(report.environment.node, process.version);
  assert.equal(report.environment.arch, process.arch);
  assert.equal(report.environment.sourceCommit, snapshot.head);
  assert.deepEqual(report.sourceSnapshot.ledger, {
    bytes: fs.statSync(path.join(root, '.sdd/tdd.jsonl')).size, events: 1,
    sha256: sha(fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'))),
  }, 'source ledger identity exists even when every runtime is unknown');
  let launch;
  const boundedAttempt = vm.runInNewContext(`(${api.runAttempt.toString()})`, {
    path, scriptsRoot: scripts, commandArgs: () => ['tdd', 'check'],
    childEnvironment: () => ({ MUSUBIX_PERF_TRACE: '1' }),
    errorRecord: error => error, spawnSync: (...args) => {
      launch = args;
      return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };
    },
  });
  const timeout = boundedAttempt({ root, runtime: process.execPath });
  assert.equal(launch[2].timeout, 120000, 'actual subprocess timeout, not just sampling metadata');
  assert.equal(timeout.timedOut, true);
  assert.equal(api.classifyAttempt('tdd check', timeout).verdict, 'FAIL');
  const file = api.writeReport(root, report);
  assert.equal(path.relative(root, file).split(path.sep).join('/'),
    `.sdd/evidence/ledger-performance-baseline.${process.platform}-node${process.versions.node.split('.')[0]}.${report.runId}.json`);
  const original = fs.readFileSync(file);
  assert.throws(() => api.writeReport(root, report), error => error.code === 'EEXIST');
  assert.deepEqual(fs.readFileSync(file), original);
});

/** @id TEST-LPB-005 @verifies REQ-LPB-001 */
test('TEST-LPB-005 only completed successful Git shows count as ledger reads', () => {
  const source = fs.readFileSync(cli, 'utf8');
  const block = source.slice(source.indexOf('/** @id CODE-LPB-001'), source.indexOf('const BOOL ='));
  const cases = [
    [{ status: 0, signal: null, stdout: 'ok' }, 1],
    [{ status: 0, signal: null, stdout: '' }, 1],
    [{ status: 1, signal: null, stdout: 'partial' }, 0],
    [{ status: null, signal: 'SIGTERM', stdout: 'partial' }, 0],
    [{ status: 0, signal: 'SIGTERM', stdout: 'partial' }, 0],
    [{ status: 0, error: { code: 'ETIMEDOUT' }, stdout: 'partial' }, 0],
    [{ status: null, error: { code: 'ENOENT' }, stdout: '' }, 0],
    [{ status: 0, stdout: null }, 0],
  ];
  for (const [result, expected] of cases) {
    let emit, trace;
    const boundary = vm.runInNewContext(`(function(){${block}; return tracedSpawnSync;})()`, {
      process: { env: { MUSUBIX_PERF_TRACE: '1' }, on: (_name, fn) => { emit = fn; } },
      fs: { writeSync: (_fd, text) => { trace = JSON.parse(text); } },
      spawnSync: () => result, Buffer, createHash,
    });
    assert.equal(boundary('git', ['show', 'HEAD:./.sdd/tdd.jsonl']), result);
    emit();
    assert.equal(trace.gitSpawns, 1);
    assert.equal(trace.ledger.read.count, expected, JSON.stringify(result));
    assert.equal(trace.ledger.read.bytes, expected ? Buffer.byteLength(result.stdout) : 0);
  }
});

/** @id TEST-LPB-006 @verifies REQ-LPB-004 */
test('TEST-LPB-006 ledger field SHA counts are separate, value-free and outside timing', async t => {
  const api = await harness();
  assert.equal(typeof api.ledgerShaCounts, 'function', 'post-timing ledger field metric collector exists');
  const root = workspace(t);
  fs.mkdirSync(path.join(root, '.sdd'));
  const file = path.join(root, '.sdd/tdd.jsonl');
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  const ledger = [
    { checkDefShas: { x: a, y: a }, admissionShas: { x: a } },
    { checkDefShas: { z: b }, admissionShas: { x: a, absent: null, invalid: 'not-a-digest' } },
    { unrelated: a }, {},
  ].map(event => JSON.stringify(event)).join('\n') + '\n';
  fs.writeFileSync(file, ledger);
  const expected = { checkDefShas: { total: 3, unique: 2, duplicate: 1 },
    admissionShas: { total: 2, unique: 1, duplicate: 1 } };
  assert.deepEqual(api.ledgerShaCounts(root), expected);
  fs.writeFileSync(file, '');
  assert.deepEqual(api.ledgerShaCounts(root), emptyLedgerShas());
  fs.writeFileSync(file, '{broken\n');
  assert.throws(() => api.ledgerShaCounts(root), SyntaxError);
  fs.writeFileSync(file, '');
  let timing = false;
  const cell = api.measureCell({ command: 'tdd check', prepare: () => root, clone: value => value,
    dispose: () => {}, identity: () => 'same', now: () => { timing = !timing; return timing ? 10 : 11; },
    attempt: (_root, details) => {
      if (!details.warmup) assert.equal(timing, true);
      fs.writeFileSync(file, ledger);
      return outcome();
    },
    ledgerMetrics: directory => {
      assert.equal(timing, false, 'field parsing must run after the timing window');
      const counts = api.ledgerShaCounts(directory);
      fs.writeFileSync(file, '');
      return counts;
    } });
  assert.equal(cell.verdict, 'PASS');
  assert.ok(cell.attempts.every(attempt => attempt.elapsedMs === 1));
  assert.deepEqual(cell.attempts.map(attempt => attempt.ledgerShas), Array(60).fill(expected));
  for (const stage of ['read', 'parse', 'verify']) {
    assert.deepEqual(Object.keys(cell.ledgerTotals[stage]).sort(), ['bytes', 'count', 'events']);
    assert.equal(cell.ledgerTotals[stage].count, 60);
  }
  assert.ok(!JSON.stringify(cell).includes(a), 'no SHA values are serialized');
  const unreadable = api.measureCell({ command: 'tdd check', prepare: () => root, clone: value => value,
    dispose: () => {}, identity: () => 'same', now: () => 1, attempt: () => outcome(),
    ledgerMetrics: () => { throw new Error('unreadable fixture ledger'); } });
  assert.equal(unreadable.verdict, 'FAIL', 'missing field metrics cannot establish valid evidence');
  assert.equal(unreadable.attempts.length, 60);
  assert.ok(unreadable.attempts.every(attempt => attempt.ledgerShaError?.message === 'unreadable fixture ledger'));
});

/** @id TEST-LPB-007 @verifies REQ-LPB-002 */
test('TEST-LPB-007 final source validation precedes exclusive report publication', async () => {
  const api = await harness();
  for (const changedAt of [null, 2, 3]) {
    let snapshots = 0, writes = 0;
    const run = vm.runInNewContext(`(${api.runBaseline.toString()})`, {
      process, path, COMMANDS: [], probeRuntime: () => null, runtimeMatrix: () => [],
      snapshotSource: () => ({ generation: ++snapshots === changedAt ? 'changed' : 'original' }),
      assertSourceUnchanged: api.assertSourceUnchanged,
      createReport: () => ({ runId: 'test', results: [] }),
      createFixture: () => ({ cleanup() {} }), fs: { mkdirSync() {}, rmSync() {} },
      errorRecord: error => error ? ({ message: error.message }) : null,
      writeReport: (_root, report) => {
        writes++;
        if (changedAt) assert.ok(report.runnerFailure,
          'source preservation failure must never leave a success-shaped report');
        return 'report.json';
      },
    });
    if (changedAt === 3) {
      assert.throws(() => run({ root: '.', nodes: [] }), /Source snapshot changed/);
      assert.equal(writes, 0, 'no report published before final validation');
    } else {
      assert.equal(run({ root: '.', nodes: [] }).exit, changedAt ? 1 : 0);
      assert.equal(writes, 1);
    }
  }
  const cleanupError = new Error('git worktree remove failed: retained registered worktree');
  const snapshotError = new Error('EISDIR: cannot hash retained .lpb-work-test');
  let snapshots = 0, removals = 0, writes = 0;
  const run = vm.runInNewContext(`(${api.runBaseline.toString()})`, {
    process, path, COMMANDS: [], probeRuntime: () => null,
    runtimeMatrix: () => [{ platform: 'linux', nodeMajor: 24, status: 'available',
      runtime: { executable: process.execPath } }],
    prepareFixtures: () => [],
    snapshotSource: () => {
      if (++snapshots > 1) throw snapshotError;
      return { generation: 'original' };
    },
    assertSourceUnchanged: api.assertSourceUnchanged,
    createReport: () => ({ runId: 'test', results: [] }),
    createFixture: () => ({ removePrepared() {}, cleanup() { throw cleanupError; } }),
    fs: { mkdirSync() {}, rmSync() { removals++; } },
    errorRecord: error => error ? ({ message: error.message }) : null,
    writeReport: () => { writes++; return 'report.json'; },
  });
  assert.throws(() => run({ root: '.', nodes: [] }), error => {
    assert.match(error.message, /git worktree remove failed/, 'cleanup cause must remain visible');
    assert.match(error.message, /EISDIR: cannot hash/, 'source snapshot cause must remain visible');
    const causes = error => [error, ...Array.from(error.errors ?? []).flatMap(causes)];
    assert.ok(causes(error).includes(cleanupError), 'original cleanup error is retained');
    assert.ok(causes(error).includes(snapshotError), 'original snapshot error is retained');
    return true;
  });
  assert.equal(removals, 0, 'failed Git cleanup must retain the work root');
  assert.equal(writes, 0, 'unverifiable source preservation must never publish a report');
});

const lsrCommands = ['tdd check', 'tdd red', 'tdd green', 'tdd refactor', 'gate --no-run', 'plan check'];
const lsrPrefixSha = 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe';
function pairedLsrReports() {
  const fixture = { sha256: 'a'.repeat(64), files: { '.sdd/tdd.jsonl': lsrPrefixSha, 'value.mjs': 'c'.repeat(64) },
    ledger: { bytes: 21368146, events: 2131, sha256: lsrPrefixSha } };
  const sourceSnapshot = { head: 'd'.repeat(40), diffSha256: 'e'.repeat(64), untracked: {},
    ledgerSha256: lsrPrefixSha, ledger: fixture.ledger };
  const report = mode => ({ schemaVersion: 1, mode,
    environment: { platform: 'linux', node: 'v24.22.1', nodeMajor: 24 }, sourceSnapshot,
    matrix: [{ platform: 'linux', nodeMajor: 24, status: 'available' }], results: lsrCommands.map((command, index) => {
      const exit = command === 'gate --no-run' ? 2 : 0;
      const verdict = exit === 2 ? 'INCOMPLETE' : 'PASS';
      const gitSpawns = mode === 'reference' ? [2, 5, 5, 5, 3, 2][index] : [1, 4, 4, 4, 3, 2][index];
      const count = mode === 'reference' ? 4 : 2;
      return { platform: 'linux', nodeMajor: 24, command, fixture, verdict,
        attempts: ['cold', 'warm'].flatMap(sampleMode => Array.from({ length: 30 }, (_, i) => {
          const elapsedMs = mode === 'reference' ? 100 : 104;
          const elapsedText = command === 'tdd red' ? `${elapsedMs}ms — fails with: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n`
            : command === 'tdd green' ? `${elapsedMs}ms\n`
              : command === 'tdd refactor' ? `${elapsedMs}ms\n` : '';
          const prefix = command === 'tdd red' ? 'RED' : command === 'tdd green' ? 'GREEN' : 'REFACTOR';
          const stdout = ['tdd red', 'tdd green', 'tdd refactor'].includes(command)
            ? `${prefix} ok TEST-LPB-FIXTURE-001 (REQ-LPB-FIXTURE-001) ${elapsedText}`
            : command === 'gate --no-run' ? 'SDD GATE INCOMPLETE\n' : 'LEDGER OK\n';
          return { ordinal: i + 1, mode: sampleMode, fixtureHash: fixture.sha256, elapsedMs, stdout, status: exit, signal: null,
            error: null, timedOut: false, verdict, traceError: null, ledgerShaError: null,
            trace: { schemaVersion: 1, kind: 'musubix-perf-trace', gitSpawns,
              ledger: Object.fromEntries(['read', 'parse', 'verify'].map(stage =>
                [stage, { count, bytes: count * 42, events: stage === 'read' ? 0 : count }])) } };
        })) };
    }) });
  return { reference: report('reference'), candidate: report('candidate') };
}
function lsrResult(report, command) { return report.results.find(result => result.command === command); }

/** @id TEST-LSR-006 @verifies REQ-LSR-005 */
test('TEST-LSR-006 frozen prefix and input validation remain strict', async t => {
  const api = await harness();
  const repoRoot = path.resolve(scripts, '../../../../');
  const readPrefix = api.readLedgerPrefix;
  assert.equal(typeof readPrefix, 'function', 'frozen ledger-prefix reader is required');
  const prefix = readPrefix(repoRoot, 2131,
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe');
  assert.equal(prefix.length, 21368146);
  assert.throws(() => readPrefix(repoRoot, 2131, '0'.repeat(64)), /ledger prefix SHA-256 mismatch/);
  assert.throws(() => readPrefix(repoRoot, 2130,
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe'), /ledger prefix SHA-256 mismatch/);
  assert.throws(() => readPrefix(repoRoot, 1000000, '0'.repeat(64)), /fewer than 1000000 records/);

  const parseArgs = api.parseBaselineArgs;
  assert.equal(typeof parseArgs, 'function', 'strict prefix argument parser is required');
  const pinnedArgs = ['--root', repoRoot, '--ledger-prefix-events', '2131', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe'];
  assert.equal(parseArgs(pinnedArgs).ledgerPrefixEvents, 2131, 'valid pinned arguments are accepted');
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2131']), /both ledger-prefix arguments are required/);
  assert.throws(() => parseArgs(['--ledger-prefix-sha256', 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /both ledger-prefix arguments are required/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2131abc', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /malformed ledger-prefix arguments/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2131', '--ledger-prefix-sha256',
    'DC5607852DAB001505E47A5B9480B5980C4F3CB3AD6F68B715DB6210A71B54FE']), /malformed ledger-prefix arguments/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2131', '--ledger-prefix-events', '2131',
    '--ledger-prefix-sha256', 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /duplicate ledger-prefix argument/);
  assert.throws(() => parseArgs(['--ledger-prefix-events=2131', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /Usage/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2131', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe',
    '--ledger-prefix-sha256', 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /duplicate ledger-prefix argument/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /malformed ledger-prefix arguments/);
  assert.throws(() => parseArgs(['--root']), /malformed ledger-prefix arguments/);
  assert.throws(() => parseArgs([...pinnedArgs, '--unknown']), /Usage/);
  assert.throws(() => parseArgs(['--ledger-prefix-events', '2130', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe']), /frozen ledger prefix arguments mismatch/);

  const malformedRoot = workspace(t);
  fs.mkdirSync(path.join(malformedRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(malformedRoot, '.sdd/tdd.jsonl'), '{"event":"no-final-lf"}');
  assert.throws(() => readPrefix(malformedRoot, 1, sha(Buffer.from('{"event":"no-final-lf"}'))),
    /LF-terminated/);
  const symlinkRoot = workspace(t);
  fs.mkdirSync(path.join(symlinkRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(symlinkRoot, 'ledger.jsonl'), '{}\n');
  fs.symlinkSync(path.join(symlinkRoot, 'ledger.jsonl'), path.join(symlinkRoot, '.sdd/tdd.jsonl'));
  assert.throws(() => readPrefix(symlinkRoot, 1, sha(Buffer.from('{}\n'))), /regular non-symlink/);
  for (const invalidRecord of ['\n', '[]\n', 'not-json\n']) {
    const invalidRoot = workspace(t);
    fs.mkdirSync(path.join(invalidRoot, '.sdd'), { recursive: true });
    fs.writeFileSync(path.join(invalidRoot, '.sdd/tdd.jsonl'), invalidRecord);
    assert.throws(() => readPrefix(invalidRoot, 1, sha(Buffer.from(invalidRecord))), /JSON object record/);
  }
  const firstLf = prefix.indexOf(0x0a);
  const blankRecordPrefix = Buffer.concat([prefix.subarray(0, firstLf + 1), Buffer.from('\n'),
    prefix.subarray(firstLf + 1)]);
  let prefixLfCount = 0, prefixEnd = -1;
  for (let index = 0; index < blankRecordPrefix.length; index++) {
    if (blankRecordPrefix[index] === 0x0a && ++prefixLfCount === 2131) {
      prefixEnd = index + 1;
      break;
    }
  }
  assert.ok(prefixEnd > 0, 'test input contains the requested prefix boundary');
  const blankRecordRoot = workspace(t);
  fs.mkdirSync(path.join(blankRecordRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(blankRecordRoot, '.sdd/tdd.jsonl'), blankRecordPrefix);
  assert.throws(() => readPrefix(blankRecordRoot, 2131,
    sha(blankRecordPrefix.subarray(0, prefixEnd))), /JSON object record/);
  const directoryRoot = workspace(t);
  fs.mkdirSync(path.join(directoryRoot, '.sdd/tdd.jsonl'), { recursive: true });
  assert.throws(() => readPrefix(directoryRoot, 1, '0'.repeat(64)), /regular non-symlink/);
  const linkedDirectoryRoot = workspace(t);
  fs.mkdirSync(path.join(linkedDirectoryRoot, 'real-sdd'), { recursive: true });
  fs.writeFileSync(path.join(linkedDirectoryRoot, 'real-sdd/tdd.jsonl'), '{}\n');
  fs.symlinkSync('real-sdd', path.join(linkedDirectoryRoot, '.sdd'));
  assert.throws(() => readPrefix(linkedDirectoryRoot, 1, sha(Buffer.from('{}\n'))),
    /\.sdd must be a non-symlink directory/);

  const workRoot = workspace(t);
  const fixture = api.createFixture({ sourceRoot: repoRoot, workRoot, ledgerBytesOverride: prefix });
  assert.equal(api.fixtureIdentity(fixture.root).ledger.sha256,
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe',
    'candidate fixture uses the exact frozen ledger prefix');
  fixture.cleanup();
  const legacyFixture = api.createFixture({ sourceRoot: repoRoot, workRoot: workspace(t) });
  assert.equal(api.fixtureIdentity(legacyFixture.root).ledger.sha256,
    sha(fs.readFileSync(path.join(repoRoot, '.sdd/tdd.jsonl'))),
    'omitting the optional prefix preserves LPB full-ledger fixture behavior');
  legacyFixture.cleanup();
  const trailingRoot = workspace(t);
  fs.mkdirSync(path.join(trailingRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(trailingRoot, '.sdd/tdd.jsonl'),
    Buffer.concat([prefix, Buffer.from('{"seq":"ignored-tail"}\n')]));
  const trailingPrefix = readPrefix(trailingRoot, 2131,
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe');
  assert.deepEqual(trailingPrefix, prefix, 'records after the frozen prefix are ignored');
  const trailingFixture = api.createFixture({ sourceRoot: trailingRoot, workRoot: workspace(t),
    ledgerBytesOverride: trailingPrefix });
  assert.deepEqual(api.fixtureIdentity(trailingFixture.root).ledger,
    { bytes: 21368146, events: 2131, sha256: 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe' });
  trailingFixture.cleanup();

  const invalidRoot = workspace(t);
  fs.mkdirSync(path.join(invalidRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(invalidRoot, '.sdd/tdd.jsonl'), '{"event":"not-the-frozen-prefix"}\n');
  assert.throws(() => api.runBaseline({ root: invalidRoot, nodes: [],
    ledgerPrefixEvents: 2131,
    ledgerPrefixSha256: 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe' }),
  /fewer than 2131 records/);
  assert.equal(fs.existsSync(path.join(invalidRoot, '.sdd/evidence')), false,
    'invalid prefix produces no evidence report');
  const wrongHashRoot = workspace(t);
  fs.mkdirSync(path.join(wrongHashRoot, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(wrongHashRoot, '.sdd/tdd.jsonl'), '{"x":1}\n'.repeat(2131));
  assert.throws(() => api.runBaseline({ root: wrongHashRoot, nodes: [],
    ledgerPrefixEvents: 2131,
    ledgerPrefixSha256: 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe' }),
  /ledger prefix SHA-256 mismatch/);
  assert.equal(fs.existsSync(path.join(wrongHashRoot, '.sdd/evidence')), false,
    'hash mismatch produces no evidence report');
  const cliHashFailure = spawnSync(process.execPath, [harnessFile, '--root', wrongHashRoot,
    '--ledger-prefix-events', '2131', '--ledger-prefix-sha256',
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe'],
  { encoding: 'utf8', env: environment });
  assert.equal(cliHashFailure.status, 1, 'invalid prefix CLI exits 1');
  assert.match(cliHashFailure.stderr, /ledger prefix SHA-256 mismatch/);
  assert.equal(fs.existsSync(path.join(wrongHashRoot, '.sdd/evidence')), false,
    'invalid prefix CLI does not create a report');
  const missingRoot = workspace(t);
  fs.mkdirSync(path.join(missingRoot, '.sdd'), { recursive: true });
  assert.throws(() => readPrefix(missingRoot, 2131,
    'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe'), /ENOENT/);
  const cliFailure = spawnSync(process.execPath, [harnessFile, '--root', missingRoot,
    '--ledger-prefix-events', '2131'], { encoding: 'utf8', env: environment });
  assert.equal(cliFailure.status, 1, 'incomplete CLI prefix flags exit 1');
  assert.match(cliFailure.stderr, /both ledger-prefix arguments are required/);
  assert.equal(fs.existsSync(path.join(missingRoot, '.sdd/evidence')), false,
    'invalid CLI arguments do not create a report');

  const historyPath = '.sdd/evidence/ledger-performance-baseline.linux-node24.ea3cb607-248d-4fac-9bd3-27b209830b5c.json';
  const historyFixtureRoot = workspace(t);
  const historyFixture = api.createFixture({ sourceRoot: repoRoot, workRoot: historyFixtureRoot, ledgerBytesOverride: prefix });
  const historyFile = path.join(historyFixture.root, historyPath);
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  const historicalBytes = Buffer.from('retained historical artifact; not an A/B oracle\n');
  fs.writeFileSync(historyFile, historicalBytes);
  let result;
  assert.doesNotThrow(() => {
    result = api.runBaseline({ root: historyFixture.root, nodes: [], ledgerPrefixEvents: 2131,
      ledgerPrefixSha256: lsrPrefixSha });
  }, 'A/B setup must not require the historical LPB report');
  assert.notEqual(result.exit, 0, 'missing measurements are not PASS');
  assert.notEqual(result.file, historyFile, 'new evidence is published at a unique path');
  assert.deepEqual(fs.readFileSync(historyFile), historicalBytes, 'historical report bytes remain untouched');
  historyFixture.cleanup();
});

/** @id TEST-LSR-007 @verifies REQ-LSR-005 */
test('TEST-LSR-007 A/B comparator accepts valid controls and rejects drift and threshold violations', async () => {
  const api = await harness();
  const evaluate = api.evaluateSnapshotReuseReport;
  assert.equal(typeof evaluate, 'function', 'A/B report comparator is required');
  const { reference, candidate } = pairedLsrReports();
  const valid = evaluate(candidate, reference);
  assert.equal(valid.status, 'PASS', 'valid paired samples pass even when only recognized duration text differs');
  assert.equal(valid.exit, 0);
  assert.deepEqual(valid.commands, lsrCommands);

  const outcomeDrift = structuredClone(candidate);
  lsrResult(outcomeDrift, 'tdd red').attempts[0].stdout += 'unexpected output\n';
  assert.equal(evaluate(outcomeDrift, reference).status, 'FAIL', 'non-duration output drift fails');
  const numericDrift = structuredClone(candidate);
  lsrResult(numericDrift, 'tdd red').attempts[0].stdout += 'unrelated 104ms\n';
  assert.equal(evaluate(numericDrift, reference).status, 'FAIL', 'non-duration numeric text drift fails');
  const signalDrift = structuredClone(candidate);
  lsrResult(signalDrift, 'tdd check').attempts[0].signal = 'SIGTERM';
  assert.equal(evaluate(signalDrift, reference).status, 'FAIL', 'signal drift fails');
  const errorDrift = structuredClone(candidate);
  lsrResult(errorDrift, 'tdd check').attempts[0].error = { name: 'Error', message: 'injected' };
  assert.equal(evaluate(errorDrift, reference).status, 'FAIL', 'execution error drift fails');
  const timeoutDrift = structuredClone(candidate);
  lsrResult(timeoutDrift, 'tdd check').attempts[0].timedOut = true;
  assert.equal(evaluate(timeoutDrift, reference).status, 'FAIL', 'timeout drift fails');
  const statusDrift = structuredClone(candidate);
  lsrResult(statusDrift, 'gate --no-run').attempts[0].status = 0;
  assert.equal(evaluate(statusDrift, reference).status, 'FAIL', 'exit/verdict mismatch fails');
  const fixtureDrift = structuredClone(candidate);
  lsrResult(fixtureDrift, 'tdd check').fixture.ledger.bytes++;
  assert.equal(evaluate(fixtureDrift, reference).status, 'FAIL', 'paired fixture mismatch fails');
  const missingSample = structuredClone(candidate);
  lsrResult(missingSample, 'tdd check').attempts.pop();
  assert.equal(evaluate(missingSample, reference).status, 'FAIL', 'missing required samples fail');
  const duplicateOrdinal = structuredClone(candidate);
  lsrResult(duplicateOrdinal, 'tdd check').attempts[2].ordinal = 1;
  assert.equal(evaluate(duplicateOrdinal, reference).status, 'FAIL', 'duplicate sample ordinals fail');

  const gitRegression = structuredClone(candidate);
  for (const attempt of lsrResult(gitRegression, 'tdd red').attempts) attempt.trace.gitSpawns = 6;
  assert.equal(evaluate(gitRegression, reference).status, 'FAIL', 'per-command Git-spawn median regression fails');
  const gitSumRegression = structuredClone(candidate);
  for (const command of lsrCommands) {
    const baseline = lsrResult(reference, command).attempts;
    lsrResult(gitSumRegression, command).attempts.forEach((attempt, index) => {
      attempt.trace.gitSpawns = baseline[index].trace.gitSpawns;
    });
  }
  assert.equal(evaluate(gitSumRegression, reference).status, 'FAIL',
    'summed Git-spawn medians fail even when each command equals its reference');
  const duplicateRegression = structuredClone(candidate);
  for (const attempt of lsrResult(duplicateRegression, 'tdd check').attempts) {
    for (const stage of ['read', 'parse', 'verify']) attempt.trace.ledger[stage].count = 4;
  }
  assert.equal(evaluate(duplicateRegression, reference).status, 'FAIL', 'duplicate-operation bound fails');
  const warmGitRegression = structuredClone(candidate);
  for (const attempt of lsrResult(warmGitRegression, 'tdd red').attempts.filter(item => item.mode === 'warm')) {
    attempt.trace.gitSpawns = 6;
  }
  assert.equal(evaluate(warmGitRegression, reference).status, 'FAIL', 'warm-only Git-spawn regression fails');
  const warmDuplicateRegression = structuredClone(candidate);
  for (const attempt of lsrResult(warmDuplicateRegression, 'tdd check').attempts.filter(item => item.mode === 'warm')) {
    for (const stage of ['read', 'parse', 'verify']) attempt.trace.ledger[stage].count = 4;
  }
  assert.equal(evaluate(warmDuplicateRegression, reference).status, 'FAIL', 'warm-only duplicate-operation regression fails');
  const latencyRegression = structuredClone(candidate);
  const latencyAttempts = lsrResult(latencyRegression, 'tdd green').attempts.filter(item => item.mode === 'cold');
  latencyAttempts.slice(-2).forEach(item => { item.elapsedMs = 106; });
  assert.equal(evaluate(latencyRegression, reference).status, 'FAIL', 'rank-29 p95 over 105% fails');
  const warmLatencyRegression = structuredClone(candidate);
  const warmLatencyAttempts = lsrResult(warmLatencyRegression, 'tdd green').attempts.filter(item => item.mode === 'warm');
  warmLatencyAttempts.slice(-2).forEach(item => { item.elapsedMs = 106; });
  assert.equal(evaluate(warmLatencyRegression, reference).status, 'FAIL', 'warm-only rank-29 p95 over 105% fails');
  const latencyBoundary = structuredClone(candidate);
  for (const attempt of lsrResult(latencyBoundary, 'tdd green').attempts.filter(item => item.mode === 'cold')) {
    attempt.elapsedMs = 105;
    attempt.stdout = attempt.stdout.replace('104ms', '105ms');
  }
  assert.equal(evaluate(latencyBoundary, reference).status, 'PASS', 'rank-29 p95 exactly at 105% passes');
  const outOfScope = structuredClone(candidate);
  outOfScope.environment.platform = 'win32';
  assert.equal(evaluate(outOfScope, reference).status, 'FAIL', 'out-of-scope runtime cannot pass');
});

/** @id TEST-LSR-008 @verifies REQ-LSR-005 */
test('TEST-LSR-008 fixture preparation is deterministic and keeps canonical ledgers valid', async t => {
  const api = await harness();
  const repoRoot = path.resolve(scripts, '../../../../');
  const prefix = api.readLedgerPrefix(repoRoot, 2131, lsrPrefixSha);
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const workRoot = workspace(t);
    const fixture = api.createFixture({ sourceRoot: repoRoot, workRoot, ledgerBytesOverride: prefix });
    try {
      const prepared = api.prepareFixtures(fixture, process.execPath);
      assert.deepEqual(prepared.map(entry => entry.command), lsrCommands);
      const rows = prepared.map(entry => {
        const ledger = fs.readFileSync(path.join(entry.root, '.sdd/tdd.jsonl'));
        assert.ok(ledger.subarray(0, prefix.length).equals(prefix), `${entry.command} preserves every prefix byte`);
        const checked = api.classifyAttempt('tdd check', api.runAttempt({ root: entry.root,
          runtime: process.execPath, command: 'tdd check', script: fixture.script }));
        assert.equal(checked.verdict, 'PASS', `${entry.command} canonicalized ledger is accepted`);
        return { command: entry.command, identity: api.fixtureIdentity(entry.root) };
      });
      for (const command of ['tdd green', 'tdd refactor']) {
        const entry = prepared.find(item => item.command === command);
        const measured = api.classifyAttempt(command,
          api.runAttempt({ root: entry.root, runtime: process.execPath, command, script: fixture.script }));
        assert.equal(measured.verdict, 'PASS', `${command} accepts normalized setup events and appends valid evidence`);
        const checked = api.classifyAttempt('tdd check', api.runAttempt({ root: entry.root,
          runtime: process.execPath, command: 'tdd check', script: fixture.script }));
        assert.equal(checked.verdict, 'PASS', `${command} leaves a valid appended ledger`);
      }
      runs.push(rows);
    } finally { fixture.cleanup(); }
  }
  assert.deepEqual(runs[0], runs[1], 'independent fixture preparations produce identical identities');
});

/** @id TEST-LSR-009 @verifies REQ-LSR-005 */
test('TEST-LSR-009 reference mode bypasses snapshots only when tracing and preserves outcomes', async t => {
  const api = await harness();
  const repoRoot = path.resolve(scripts, '../../../../');
  const prefix = api.readLedgerPrefix(repoRoot, 2131, lsrPrefixSha);
  const workRoot = workspace(t);
  const fixture = api.createFixture({ sourceRoot: repoRoot, workRoot, ledgerBytesOverride: prefix });
  try {
    const args = { root: fixture.root, runtime: process.execPath, command: 'tdd check', script: fixture.script };
    const candidate = api.classifyAttempt('tdd check', api.runAttempt({ ...args, reference: false }));
    const reference = api.classifyAttempt('tdd check', api.runAttempt({ ...args, reference: true }));
    assert.equal(candidate.verdict, 'PASS', 'candidate valid-input control');
    assert.equal(reference.verdict, 'PASS', 'reference valid-input control');
    assert.equal(candidate.stdout, reference.stdout, 'reference mode preserves command outcomes');
    assert.ok(reference.trace.gitSpawns > candidate.trace.gitSpawns, 'reference mode re-enumerates source and HEAD inputs');
    assert.ok(reference.trace.ledger.read.count > candidate.trace.ledger.read.count,
      'reference mode rereads the ledger instead of reusing its snapshot');

    const priorReferenceFlag = process.env.MUSUBIX_PERF_REFERENCE;
    let inheritedFlagCandidate;
    try {
      process.env.MUSUBIX_PERF_REFERENCE = '1';
      inheritedFlagCandidate = api.classifyAttempt('tdd check', api.runAttempt({ ...args, reference: false }));
    } finally {
      if (priorReferenceFlag === undefined) delete process.env.MUSUBIX_PERF_REFERENCE;
      else process.env.MUSUBIX_PERF_REFERENCE = priorReferenceFlag;
    }
    assert.deepEqual(inheritedFlagCandidate.trace, candidate.trace,
      'candidate mode removes an inherited reference flag');

    const untraced = spawnSync(process.execPath, [fixture.script, 'tdd', 'check', '--root', fixture.root], {
      encoding: 'utf8', env: { ...environment, MUSUBIX_PERF_TRACE: '0', MUSUBIX_PERF_REFERENCE: '1' },
    });
    assert.equal(untraced.status, 0, untraced.stdout + untraced.stderr);
    assert.equal(untraced.stderr, '', 'reference flag has no effect without the trace gate');
  } finally { fixture.cleanup(); }
});
