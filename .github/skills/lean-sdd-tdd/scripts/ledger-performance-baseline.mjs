#!/usr/bin/env node
// Usage: node ledger-performance-baseline.mjs [--root checkout] [--node /path/to/node ...]
// Cold means first CLI invocation after fixture setup, not OS-cache-cold.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

export const COMMANDS = ['tdd check', 'tdd red', 'tdd green', 'tdd refactor', 'gate --no-run', 'plan check'];
const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const TEST = 'TEST-LPB-FIXTURE-001';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const LSR_PREFIX = { events: 2131, bytes: 21368146,
  sha256: 'dc5607852dab001505e47a5b9480b5980c4f3cb3ad6f68b715db6210a71b54fe' };

function statSignature(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}
/** @id CODE-LSR-001 @implements REQ-LSR-005 */
export function readLedgerPrefix(root, eventCount, expectedSha256) {
  if (!Number.isSafeInteger(eventCount) || eventCount < 1
    || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Malformed ledger-prefix arguments');
  const sdd = path.join(root, '.sdd');
  const sddStat = fs.lstatSync(sdd, { bigint: true });
  if (!sddStat.isDirectory() || sddStat.isSymbolicLink()) throw new Error('.sdd must be a non-symlink directory');
  const file = path.join(sdd, 'tdd.jsonl');
  const pathStat = fs.lstatSync(file, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw new Error('Ledger prefix source must be a regular non-symlink file');
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(file, flags);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.dev !== pathStat.dev || before.ino !== pathStat.ino) {
      throw new Error('Ledger prefix source changed while opening');
    }
    const source = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(file, { bigint: true });
    if (statSignature(before) !== statSignature(after) || after.dev !== pathAfter.dev
      || after.ino !== pathAfter.ino || !pathAfter.isFile() || pathAfter.isSymbolicLink()) {
      throw new Error('Ledger prefix source changed while reading');
    }
    let start = 0, prefixEnd = -1;
    for (let record = 0; record < eventCount; record++) {
      const lf = source.indexOf(0x0a, start);
      if (lf < 0) {
        if (start < source.length) throw new Error('Ledger prefix contains a non-LF-terminated record');
        throw new Error(`ledger prefix has fewer than ${eventCount} records`);
      }
      const line = source.subarray(start, lf);
      if (!line.length || !line.toString('utf8').trim()) throw new Error('ledger prefix contains an empty JSON object record');
      let value;
      try { value = JSON.parse(line.toString('utf8')); }
      catch { throw new Error('ledger prefix contains an invalid JSON object record'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('ledger prefix contains a non-JSON object record');
      }
      start = lf + 1;
      prefixEnd = start;
    }
    const prefix = source.subarray(0, prefixEnd);
    if (sha(prefix) !== expectedSha256) throw new Error('ledger prefix SHA-256 mismatch');
    return prefix;
  } finally { fs.closeSync(fd); }
}

/** @id CODE-LSR-002 @implements REQ-LSR-005 */
export function parseBaselineArgs(args) {
  let root = process.cwd(), ledgerPrefixEvents = null, ledgerPrefixSha256 = null;
  const nodes = [], seenPrefix = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag.includes('=')) throw new Error('Usage: prefix flags require separate --flag value tokens');
    if (!['--root', '--node', '--ledger-prefix-events', '--ledger-prefix-sha256'].includes(flag)) {
      throw new Error('Usage: ledger-performance-baseline.mjs [--root checkout] [--node executable ...] [--ledger-prefix-events 2131 --ledger-prefix-sha256 sha256]');
    }
    if (flag.startsWith('--ledger-prefix-') && seenPrefix.has(flag)) {
      throw new Error('duplicate ledger-prefix argument');
    }
    if (flag.startsWith('--ledger-prefix-')) seenPrefix.add(flag);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error('malformed ledger-prefix arguments');
    if (flag === '--root') root = value;
    else if (flag === '--node') nodes.push(value);
    else if (flag === '--ledger-prefix-events') {
      if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('malformed ledger-prefix arguments');
      ledgerPrefixEvents = Number(value);
    } else ledgerPrefixSha256 = value;
  }
  if (seenPrefix.size && seenPrefix.size !== 2) throw new Error('both ledger-prefix arguments are required');
  if (seenPrefix.size && !/^[a-f0-9]{64}$/.test(ledgerPrefixSha256)) {
    throw new Error('malformed ledger-prefix arguments');
  }
  if (seenPrefix.size && (ledgerPrefixEvents !== LSR_PREFIX.events || ledgerPrefixSha256 !== LSR_PREFIX.sha256)) {
    throw new Error('frozen ledger prefix arguments mismatch');
  }
  return { root, nodes, ledgerPrefixEvents, ledgerPrefixSha256 };
}

/** @id CODE-LSR-003 @implements REQ-LSR-005 */
function errorMessage(error) {
  const message = error?.message ?? String(error);
  const nested = error instanceof AggregateError ? error.errors.map(errorMessage) : [];
  return [...new Set([message, ...nested].filter(Boolean))].join(': ');
}
const errorRecord = error => error ? { code: error.code ?? null, name: error.name, message: errorMessage(error) } : null;
function childEnvironment(trace = false) {
  const env = { ...process.env, MUSUBIX_PERF_TRACE: trace ? '1' : '0', LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0' };
  delete env.MUSUBIX_PERF_REFERENCE;
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  for (const key of Object.keys(env)) if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(key)) delete env[key];
  return env;
}
function git(root, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: root, env: childEnvironment(), encoding,
    timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) throw new Error(`git ${args.join(' ')}: ${result.signal ?? result.status}: ${result.stderr}`);
  return result.stdout;
}
function hashFile(file) {
  const stat = fs.lstatSync(file);
  return stat.isSymbolicLink() ? sha(Buffer.from(fs.readlinkSync(file))) : sha(fs.readFileSync(file));
}

/** @id CODE-LPB-002 @implements REQ-LPB-002 */
export function snapshotSource(root, excludedReport) {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const diff = git(root, ['diff', '--binary', 'HEAD', '--'], null);
  const untracked = Object.fromEntries(git(root, ['ls-files', '--others', '-z']).split('\0')
    .filter(file => file && file !== excludedReport).sort()
    .map(file => [file, hashFile(path.join(root, file))]));
  const ledger = fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'));
  return { head, diffSha256: sha(diff), untracked, ledgerSha256: sha(ledger),
    ledger: { bytes: ledger.length, events: ledger.toString('utf8').split('\n').filter(Boolean).length, sha256: sha(ledger) } };
}
export function assertSourceUnchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source snapshot changed during baseline measurement');
}
function inventory(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true })
    .filter(entry => entry.name !== '.git').sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .flatMap(entry => {
      const file = prefix + entry.name;
      return entry.isDirectory() ? inventory(root, file + '/') : [[file, hashFile(path.join(root, file))]];
    });
}
export function fixtureIdentity(root) {
  const bytes = fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'));
  const files = inventory(root);
  return { sha256: sha(JSON.stringify(files)), files: Object.fromEntries(files),
    ledger: { bytes: bytes.length, events: bytes.toString('utf8').split('\n').filter(Boolean).length, sha256: sha(bytes) } };
}
const implementation = value =>
  `/** @id CODE-LPB-FIXTURE-001 @implements REQ-LPB-FIXTURE-001 */\nexport const value = () => ${value};\n`;
function save(root, file, value) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
}
function commit(root) {
  git(root, ['add', '--all']);
  git(root, ['commit', '--allow-empty', '-qm', 'synthetic baseline precondition']);
  return git(root, ['rev-parse', 'HEAD']).trim();
}
function addWorktree(fixture, revision) {
  const root = path.join(fixture.workRoot, 'trial-' + randomUUID());
  // Register before invoking Git so even a partial add is checked during cleanup.
  fixture.worktrees.add(root);
  git(fixture.repository, ['worktree', 'add', '--quiet', '--detach', root, revision]);
  return root;
}
function removeWorktree(fixture, root) {
  git(fixture.repository, ['worktree', 'remove', '--force', root]);
  if (fs.existsSync(root)) throw new Error(`Leftover worktree: ${root}`);
  fixture.worktrees.delete(root);
}
export function withWorktree(fixture, revision, action) {
  const root = addWorktree(fixture, revision);
  let actionError;
  try { return action(root); }
  catch (error) { actionError = error; throw error; }
  finally {
    try { removeWorktree(fixture, root); }
    catch (cleanupError) {
      if (actionError) throw new AggregateError([actionError, cleanupError], 'Worktree action and cleanup failed');
      throw cleanupError;
    }
  }
}
export function createFixture({ sourceRoot, workRoot, scriptsRoot: toolRoot = scriptsRoot, ledgerBytesOverride }) {
  const root = path.join(workRoot, 'repository');
  fs.mkdirSync(path.join(root, '.sdd/specs'), { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Ledger Baseline']);
  git(root, ['config', 'user.email', 'ledger-baseline@example.invalid']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'core.hooksPath', path.join(root, '.git/disabled-hooks')]);
  if (ledgerBytesOverride !== undefined) fs.writeFileSync(path.join(root, '.sdd/tdd.jsonl'), ledgerBytesOverride);
  else fs.copyFileSync(path.join(sourceRoot, '.sdd/tdd.jsonl'), path.join(root, '.sdd/tdd.jsonl'));
  const spec = '.sdd/specs/lpb-fixture.md';
  fs.writeFileSync(path.join(root, spec), '---\nfeature: lpb-fixture\ntier: T1\n---\nREQ-LPB-FIXTURE-001: When called, value shall return one.\n');
  fs.writeFileSync(path.join(root, 'value.mjs'), implementation(0));
  fs.writeFileSync(path.join(root, 'value.test.mjs'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value } from './value.mjs';
/** @id ${TEST} @verifies REQ-LPB-FIXTURE-001 */
test('${TEST}', () => assert.equal(value(), 1));\n`);
  save(root, '.sdd/config.json', { planning: { required: true },
    testCmd: [process.execPath, '--test', '--test-name-pattern', '{id}', '{file}'],
    checks: [{ name: 'test', cmd: [process.execPath, '--test', 'value.test.mjs'], timeoutMs: 120000 }] });
  save(root, '.sdd/implementation-plan.json', { schemaVersion: 1,
    features: [{ id: 'lpb-fixture', dependsOn: [] }],
    tasks: [{ id: 'LPB-FIXTURE', feature: 'lpb-fixture', kind: 'implementation',
      reqs: ['REQ-LPB-FIXTURE-001'], dependsOn: [], artifacts: ['value.mjs', 'value.test.mjs'],
      condition: 'The value test asserts one.', tests: [TEST],
      checks: [{ name: 'value', argv: [process.execPath, '--test', 'value.test.mjs'], timeoutMs: 120000 }],
      specs: { [spec]: sha(fs.readFileSync(path.join(root, spec))) }, dependencies: {},
      status: 'not-started', receipt: null }] });
  const fixture = { root, repository: root, workRoot, script: path.join(toolRoot, 'sdd.mjs'),
    ledgerPrefix: ledgerBytesOverride,
    worktrees: new Set(), commit: commit(root) };
  fixture.removePrepared = () => {
    for (const directory of [...fixture.worktrees]) removeWorktree(fixture, directory);
  };
  fixture.cleanup = () => {
    const errors = [];
    for (const directory of [...fixture.worktrees]) {
      try { removeWorktree(fixture, directory); } catch (error) { errors.push(error); }
    }
    const remaining = git(root, ['worktree', 'list', '--porcelain']).split('\n').filter(line => line.startsWith('worktree '));
    if (remaining.length !== 1 || fixture.worktrees.size) errors.push(new Error('Leftover worktree after cleanup'));
    if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed');
  };
  return fixture;
}
function commandArgs(command) {
  if (!COMMANDS.includes(command)) throw new Error(`Unknown baseline command: ${command}`);
  const argv = command.split(' ');
  if (['tdd red', 'tdd green', 'tdd refactor'].includes(command)) argv.push(TEST);
  return argv;
}
export function runAttempt({ root, runtime, command, script = path.join(scriptsRoot, 'sdd.mjs'),
  reference = false }) {
  const result = spawnSync(runtime, [script, ...commandArgs(command), '--root', root],
    { cwd: root, env: { ...childEnvironment(true),
      ...(reference ? { MUSUBIX_PERF_REFERENCE: '1' } : {}) }, encoding: 'utf8', timeout: 120000,
      maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, signal: result.signal, error: errorRecord(result.error),
    timedOut: result.error?.code === 'ETIMEDOUT', stdout: result.stdout, stderr: result.stderr };
}
/** @id CODE-LSR-013 @implements REQ-LSR-005 */
export function normalizeFixtureLedger(prefix, ledgerBytes) {
  if (!Buffer.isBuffer(prefix) || prefix.length !== LSR_PREFIX.bytes || sha(prefix) !== LSR_PREFIX.sha256) {
    throw new Error('Invalid deterministic fixture prefix');
  }
  if (!Buffer.isBuffer(ledgerBytes) || ledgerBytes.length < prefix.length
    || !ledgerBytes.subarray(0, prefix.length).equals(prefix)) {
    throw new Error('Fixture ledger does not preserve the frozen prefix');
  }
  const suffix = ledgerBytes.subarray(prefix.length);
  if (!suffix.length) return Buffer.from(prefix);
  if (suffix.at(-1) !== 0x0a) throw new Error('Fixture setup suffix must end with LF');
  const rawLines = suffix.toString('utf8').split('\n');
  if (rawLines.at(-1) !== '') throw new Error('Fixture setup suffix must end with LF');
  const events = rawLines.slice(0, -1).map((line, index) => {
    if (!line.trim()) throw new Error(`Fixture setup suffix has an empty event at ${index + 1}`);
    let event;
    try { event = JSON.parse(line); }
    catch { throw new Error(`Fixture setup suffix has invalid JSON at ${index + 1}`); }
    if (!event || typeof event !== 'object' || Array.isArray(event)
      || !['red', 'green', 'refactor'].includes(event.type)) {
      throw new Error(`Unsupported fixture setup event at ${index + 1}`);
    }
    return event;
  });
  const lastPrefixEvent = JSON.parse(prefix.toString('utf8').trimEnd().split('\n').at(-1));
  let previous = lastPrefixEvent.hash;
  if (typeof previous !== 'string') throw new Error('Frozen prefix has no final event hash');
  const prefixAt = Date.parse(lastPrefixEvent.at);
  if (!Number.isFinite(prefixAt) || prefixAt >= Date.now()) {
    throw new Error('Frozen ledger prefix timestamp must precede fixture execution');
  }
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    event.at = new Date(prefixAt + index + 1).toISOString();
    event.ms = 0;
    event.prev = previous;
    const body = { ...event };
    delete body.hash;
    event.hash = sha(JSON.stringify(body));
    previous = event.hash;
  }
  return Buffer.concat([prefix, Buffer.from(events.map(event => JSON.stringify(event) + '\n').join(''))]);
}
export function prepareFixtures(fixture, runtime) {
  const prepared = [];
  try {
    for (const command of COMMANDS) {
      const root = addWorktree(fixture, fixture.commit);
      const config = JSON.parse(fs.readFileSync(path.join(root, '.sdd/config.json')));
      config.testCmd[0] = runtime;
      config.checks[0].cmd[0] = runtime;
      // Gate measures the native evidence gate, not a root-bound planning receipt.
      config.planning.required = command !== 'gate --no-run';
      save(root, '.sdd/config.json', config);
      const plan = JSON.parse(fs.readFileSync(path.join(root, '.sdd/implementation-plan.json')));
      plan.tasks[0].checks[0].argv[0] = runtime;
      save(root, '.sdd/implementation-plan.json', plan);
      const setup = name => {
        const raw = runAttempt({ root, runtime, command: name, script: fixture.script });
        if (classifyAttempt(name, raw).verdict !== 'PASS') throw new Error(`Fixture setup ${name} failed: ${JSON.stringify(raw)}`);
      };
      if (!['tdd check', 'tdd red'].includes(command)) setup('tdd red');
      if (['tdd refactor', 'gate --no-run', 'plan check'].includes(command)) {
        fs.writeFileSync(path.join(root, 'value.mjs'), implementation(1));
        setup('tdd green');
      } else if (command === 'tdd green') fs.writeFileSync(path.join(root, 'value.mjs'), implementation(1));
      if (fixture.ledgerPrefix) {
        const ledger = path.join(root, '.sdd/tdd.jsonl');
        fs.writeFileSync(ledger, normalizeFixtureLedger(fixture.ledgerPrefix, fs.readFileSync(ledger)));
        setup('tdd check');
      }
      const revision = commit(root);
      prepared.push({ command, root, revision, identity: fixtureIdentity(root) });
    }
    return prepared;
  } catch (error) {
    try { fixture.cleanup(); }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Fixture preparation and cleanup failed');
    }
    throw error;
  }
}

/** @id CODE-LPB-003 @implements REQ-LPB-003 */
export function measureCell({ command, prepare, clone, dispose, identity,
  attempt, now = () => performance.now(), ledgerMetrics = ledgerShaCounts }) {
  const attempts = [];
  for (let ordinal = 1; ordinal <= 30; ordinal++) {
    const allocated = [];
    const pair = {};
    let setupError = null;
    try {
      pair.cold = prepare(); allocated.push(pair.cold);
      pair.warmup = clone(pair.cold); allocated.push(pair.warmup);
      pair.warm = clone(pair.cold); allocated.push(pair.warm);
      pair.fixtureHash = identity(pair.cold);
      if ([pair.warmup, pair.warm].some(item => identity(item) !== pair.fixtureHash)) {
        throw new Error('Cold/warm fixture hash mismatch');
      }
    } catch (error) { setupError = errorRecord(error); }
    try {
      for (const mode of ['cold', 'warm']) {
        let warmup = null, raw, elapsedMs = null, ledgerShas = null, ledgerShaError = null;
        const details = { ordinal, mode, warmup: false, timeoutMs: 120000 };
        if (setupError) raw = { status: null, signal: null, error: setupError, stdout: '', stderr: '' };
        else {
          if (mode === 'warm') {
            try { warmup = classifyAttempt(command, attempt(pair.warmup, { ...details, warmup: true })); }
            catch (error) { warmup = classifyAttempt(command, { error: errorRecord(error) }); }
          }
          const start = now();
          try { raw = attempt(pair[mode], details); }
          catch (error) { raw = { status: null, signal: null, error: errorRecord(error), stdout: '', stderr: '' }; }
          elapsedMs = now() - start;
          try { ledgerShas = ledgerMetrics(pair[mode]); }
          catch (error) { ledgerShaError = errorRecord(error); }
        }
        const classified = classifyAttempt(command, raw);
        attempts.push({ ordinal, mode, fixtureHash: pair.fixtureHash ?? null, elapsedMs,
          ...classified, ledgerShas, ledgerShaError, warmup,
          verdict: ledgerShaError || warmup?.verdict === 'FAIL' ? 'FAIL' : classified.verdict });
      }
    } finally {
      const errors = [];
      for (const item of allocated.reverse()) {
        try { dispose(item); } catch (error) { errors.push(errorRecord(error)); }
      }
      if (errors.length) for (const recorded of attempts.filter(item => item.ordinal === ordinal)) {
        recorded.cleanupErrors = errors;
        recorded.verdict = 'FAIL';
      }
    }
  }
  const cell = { command, attempts };
  cell.verdict = validateCell(cell);
  cell.ledgerTotals = ledgerTotals(attempts);
  return cell;
}
export function validateCell(cell) {
  if (cell.attempts.length !== 60) return 'FAIL';
  for (let ordinal = 1; ordinal <= 30; ordinal++) {
    const pair = cell.attempts.filter(attempt => attempt.ordinal === ordinal);
    if (pair.length !== 2 || pair[0].mode !== 'cold' || pair[1].mode !== 'warm'
      || !pair[0].fixtureHash || pair[0].fixtureHash !== pair[1].fixtureHash
      || pair.some(attempt => !Number.isFinite(attempt.elapsedMs) || attempt.elapsedMs < 0
        || attempt.verdict !== (cell.command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS'))) return 'FAIL';
  }
  return cell.command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS';
}
function ledgerTotals(attempts) {
  return Object.fromEntries(['read', 'parse', 'verify'].map(stage => {
    const values = attempts.filter(attempt => !attempt.traceError).map(attempt => attempt.trace?.ledger[stage]).filter(Boolean);
    return [stage, { count: values.reduce((n, value) => n + value.count, 0),
      bytes: values.reduce((n, value) => n + value.bytes, 0),
      events: values.reduce((n, value) => n + value.events, 0) }];
  }));
}

/** @id CODE-LPB-004 @implements REQ-LPB-004 */
export function ledgerShaCounts(root) {
  const counts = Object.fromEntries(['checkDefShas', 'admissionShas']
    .map(field => [field, { total: 0, values: new Set() }]));
  const ledger = fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'), 'utf8');
  for (const line of ledger.split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    for (const [field, metric] of Object.entries(counts)) {
      for (const value of Object.values(event[field] ?? {})) {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) continue;
        metric.total++;
        metric.values.add(value.toLowerCase());
      }
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([field, metric]) =>
    [field, { total: metric.total, unique: metric.values.size, duplicate: metric.total - metric.values.size }]));
}
function validTrace(trace) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  return trace?.schemaVersion === 1 && trace.kind === 'musubix-perf-trace'
    && count(trace.gitSpawns) && ['read', 'parse', 'verify'].every(stage => {
      const metric = trace.ledger?.[stage];
      return metric && ['count', 'bytes', 'events'].every(key => count(metric[key]))
        && (metric.count !== 0 || metric.bytes === 0 && metric.events === 0);
    });
}
export function classifyAttempt(command, raw) {
  let trace = null, traceError = null;
  try {
    const lines = raw.stderr?.trim().split('\n').filter(Boolean);
    if (lines?.length !== 1) throw new Error('Expected exactly one stderr trace');
    trace = JSON.parse(lines[0]);
    if (!validTrace(trace)) throw new Error('Malformed performance trace');
  } catch (error) { traceError = error.message; }
  const timedOut = raw.timedOut === true || raw.error?.code === 'ETIMEDOUT';
  const expectedExit = command === 'gate --no-run' ? 2 : 0;
  const valid = COMMANDS.includes(command) && !raw.error && !raw.signal && !timedOut && !traceError
    && raw.status === expectedExit && (expectedExit !== 2 || /\bINCOMPLETE\b/.test(raw.stdout));
  return { ...raw, timedOut, trace, traceError,
    verdict: valid ? expectedExit === 2 ? 'INCOMPLETE' : 'PASS' : 'FAIL' };
}
export function runtimeMatrix({ platform, runtimes }) {
  const matrix = [['linux', 22], ['linux', 24], ['win32', 20], ['win32', 22], ['win32', 24]]
    .map(([target, nodeMajor]) => ({ platform: target, nodeMajor, status: 'unknown',
      reason: target === platform ? 'runtime unavailable' : 'platform unavailable', runtime: null }));
  for (const runtime of runtimes) {
    const major = Number(/^v(\d+)\./.exec(runtime.version)?.[1]);
    const cell = matrix.find(item => item.platform === runtime.platform && item.nodeMajor === major);
    if (!cell || runtime.platform !== platform) throw new Error(`Unsupported runtime: ${JSON.stringify(runtime)}`);
    if (cell.status === 'available') throw new Error('Duplicate runtime for matrix cell');
    Object.assign(cell, { status: 'available', reason: null, runtime });
  }
  return matrix;
}
export function createReport({ sourceSnapshot, matrix, results, runId = randomUUID() }) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId)) throw new Error('Invalid RFC4122 UUID');
  return { schemaVersion: 1, runId, createdAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform,
      os: { type: os.type(), release: os.release(), version: os.version() },
      arch: process.arch, sourceCommit: sourceSnapshot.head,
      dirty: sourceSnapshot.diffSha256 !== sha(Buffer.alloc(0)) || Object.keys(sourceSnapshot.untracked).length > 0,
      sourceDirtyIdentity: sha(JSON.stringify(sourceSnapshot)),
      coldDefinition: 'First CLI invocation after fixture preparation; not OS-cache-cold',
      warmDefinition: 'Unmeasured same command on a separate hash-equivalent worktree before warm measurement',
      attemptsPerMode: 30, timeoutMs: 120000, timing: 'performance.now()', cacheFlush: false },
    sourceSnapshot, matrix, results };
}
export function writeReport(root, report) {
  const prefix = report.referenceResults ? 'ledger-snapshot-reuse-ab' : 'ledger-performance-baseline';
  const name = `${prefix}.${process.platform}-node${process.versions.node.split('.')[0]}.${report.runId}.json`;
  const file = path.join(root, '.sdd/evidence', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return file;
}
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const rank = (values, position) => [...values].sort((a, b) => a - b)[position - 1];
function duplicateOps(attempt) {
  return ['read', 'parse', 'verify']
    .reduce((sum, stage) => sum + Math.max(0, attempt.trace.ledger[stage].count - 1), 0);
}
function normalizeElapsedOutput(stdout) {
  return String(stdout ?? '').replace(
    /^(RED|GREEN|REFACTOR) ok (TEST-[\w-]+) \((REQ-[\w-]+)\) \d+(?:\.\d+)?ms(?= |\n|$)/gm,
    '$1 ok $2 ($3) <elapsed>ms');
}
function validFixtureIdentity(fixture) {
  return !!fixture && /^[a-f0-9]{64}$/.test(fixture.sha256)
    && fixture.files && typeof fixture.files === 'object' && !Array.isArray(fixture.files)
    && fixture.ledger && Number.isSafeInteger(fixture.ledger.bytes) && fixture.ledger.bytes >= LSR_PREFIX.bytes
    && Number.isSafeInteger(fixture.ledger.events) && fixture.ledger.events >= LSR_PREFIX.events
    && /^[a-f0-9]{64}$/.test(fixture.ledger.sha256)
    && fixture.files['.sdd/tdd.jsonl'] === fixture.ledger.sha256;
}
function sameAttemptOutcome(left, right) {
  return ['status', 'signal', 'error', 'timedOut', 'verdict', 'traceError', 'ledgerShaError']
    .every(field => sameJson(left[field], right[field]))
    && normalizeElapsedOutput(left.stdout) === normalizeElapsedOutput(right.stdout)
    && sameJson(left.ledgerShas, right.ledgerShas);
}
/** @id CODE-LSR-004 @implements REQ-LSR-005 */
export function evaluateSnapshotReuseReport(candidate, reference) {
  const failures = [];
  const fail = message => failures.push(message);
  if (!candidate || !reference || !Array.isArray(candidate.results) || !Array.isArray(reference.results)) {
    return { status: 'FAIL', exit: 1, failures: ['A/B reference and candidate results are required'], commands: [] };
  }
  const runtime = report => report.environment?.platform === 'linux'
    && (report.environment.nodeMajor ?? Number(/^v?(\d+)/.exec(report.environment.node ?? '')?.[1])) === 24;
  if (!runtime(candidate) || !runtime(reference)) fail('A/B qualification requires Linux Node 24');
  if (!candidate.sourceSnapshot || !reference.sourceSnapshot
    || candidate.environment?.node !== reference.environment?.node
    || !sameJson(candidate.sourceSnapshot, reference.sourceSnapshot)
    || !sameJson(candidate.matrix, reference.matrix)) fail('Reference/candidate environment or source snapshot differs');
  for (const [label, report] of [['reference', reference], ['candidate', candidate]]) {
    const matrix = report.matrix ?? [];
    if (matrix.length !== 1 || matrix[0].platform !== 'linux' || matrix[0].nodeMajor !== 24
      || matrix[0].status !== 'available') fail(`${label} report is not the single Linux Node 24 cell`);
    if (report.results.length !== COMMANDS.length
      || new Set(report.results.map(result => result.command)).size !== COMMANDS.length) {
      fail(`${label} report must contain each of the six command results exactly once`);
    }
  }
  const resultMap = report => new Map(report.results.map(result => [result.command, result]));
  const referenceResults = resultMap(reference), candidateResults = resultMap(candidate);
  const gitMedians = { cold: [], warm: [] };
  for (const command of COMMANDS) {
    const base = referenceResults.get(command), result = candidateResults.get(command);
    if (!base || !result) { fail(`Missing reference/candidate result for ${command}`); continue; }
    const expectedVerdict = command === 'gate --no-run' ? 'INCOMPLETE' : 'PASS';
    if (!validFixtureIdentity(base.fixture) || !validFixtureIdentity(result.fixture)
      || !sameJson(base.fixture, result.fixture)) {
      fail(`Fixture identity mismatch for ${command}`);
      continue;
    }
    if (!Array.isArray(base.attempts) || !Array.isArray(result.attempts)) {
      fail(`Missing sample arrays for ${command}`);
      continue;
    }
    if (base.verdict !== expectedVerdict || result.verdict !== expectedVerdict
      || validateCell(base) !== expectedVerdict || validateCell(result) !== expectedVerdict) {
      fail(`Invalid or mismatched command verdict for ${command}`);
    }
    for (const mode of ['cold', 'warm']) {
      const baselineAttempts = base.attempts.filter(attempt => attempt.mode === mode);
      const attempts = result.attempts.filter(attempt => attempt.mode === mode);
      if (baselineAttempts.length !== 30 || attempts.length !== 30) {
        fail(`Expected 30 ${mode} samples for ${command}`);
        continue;
      }
      for (let index = 0; index < 30; index++) {
        const baseline = baselineAttempts[index], attempt = attempts[index];
        if (baseline.ordinal !== index + 1 || attempt.ordinal !== index + 1
          || baseline.fixtureHash !== base.fixture.sha256 || attempt.fixtureHash !== result.fixture.sha256
          || !Number.isFinite(baseline.elapsedMs) || baseline.elapsedMs < 0
          || !Number.isFinite(attempt.elapsedMs) || attempt.elapsedMs < 0
          || !validTrace(baseline.trace) || !validTrace(attempt.trace)
          || baseline.traceError || attempt.traceError || baseline.ledgerShaError || attempt.ledgerShaError) {
          fail(`Invalid ${mode} sample ${index + 1} for ${command}`);
          continue;
        }
        if (!sameAttemptOutcome(attempt, baseline)) fail(`Outcome differs for ${mode} sample ${index + 1} of ${command}`);
        if (!!attempt.warmup !== !!baseline.warmup) fail(`Warmup evidence differs for ${mode} sample ${index + 1} of ${command}`);
        else if (attempt.warmup && (!validTrace(attempt.warmup.trace) || !validTrace(baseline.warmup.trace)
          || !sameAttemptOutcome(attempt.warmup, baseline.warmup))) {
          fail(`Warmup outcome differs for ${mode} sample ${index + 1} of ${command}`);
        }
      }
      const gitMedian = rank(attempts.map(attempt => attempt.trace.gitSpawns), 15);
      const referenceGitMedian = rank(baselineAttempts.map(attempt => attempt.trace.gitSpawns), 15);
      if (!Number.isFinite(gitMedian) || gitMedian > referenceGitMedian) fail(`Git-spawn median regressed for ${mode} ${command}`);
      gitMedians[mode].push(gitMedian);
      const duplicateMedian = rank(attempts.map(duplicateOps), 15);
      const referenceDuplicateMedian = rank(baselineAttempts.map(duplicateOps), 15);
      if (!Number.isFinite(duplicateMedian) || duplicateMedian > Math.floor(referenceDuplicateMedian / 2)) {
        fail(`Duplicate ledger-operation median exceeds the bound for ${mode} ${command}`);
      }
      const p95 = rank(attempts.map(attempt => attempt.elapsedMs), 29);
      const referenceP95 = rank(baselineAttempts.map(attempt => attempt.elapsedMs), 29);
      if (!Number.isFinite(p95) || !Number.isFinite(referenceP95) || p95 > referenceP95 * 1.05) {
        fail(`P95 latency exceeds the bound for ${mode} ${command}`);
      }
    }
  }
  for (const mode of ['cold', 'warm']) {
    if (gitMedians[mode].length !== COMMANDS.length || gitMedians[mode].reduce((sum, value) => sum + value, 0) > 19) {
      fail(`${mode} Git-spawn median sum exceeds 19`);
    }
  }
  return { status: failures.length ? 'FAIL' : 'PASS', exit: failures.length ? 1 : 0,
    failures, commands: [...COMMANDS] };
}

function probeRuntime(executable) {
  const result = spawnSync(executable, ['-p', 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'],
    { encoding: 'utf8', env: childEnvironment(), timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.error?.code === 'ENOENT') return null;
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) throw new Error(`Runtime probe failed: ${executable}: ${result.stderr}`);
  return { executable, ...JSON.parse(result.stdout) };
}
/** @id CODE-LSR-005 @implements REQ-LSR-005 */
export function runBaseline({ root = process.cwd(), nodes = [process.execPath],
  ledgerPrefixEvents = null, ledgerPrefixSha256 = null } = {}) {
  root = path.resolve(root);
  const hasPrefixEvents = ledgerPrefixEvents !== null, hasPrefixSha = ledgerPrefixSha256 !== null;
  if (hasPrefixEvents !== hasPrefixSha) throw new Error('both ledger-prefix arguments are required');
  let ledgerBytesOverride;
  if (hasPrefixEvents) {
    if (ledgerPrefixEvents !== LSR_PREFIX.events || ledgerPrefixSha256 !== LSR_PREFIX.sha256) {
      throw new Error('frozen ledger prefix arguments mismatch');
    }
    ledgerBytesOverride = readLedgerPrefix(root, ledgerPrefixEvents, ledgerPrefixSha256);
    if (ledgerBytesOverride.length !== LSR_PREFIX.bytes) throw new Error('frozen ledger prefix byte count mismatch');
  }
  const before = snapshotSource(root);
  const runtimes = nodes.map(probeRuntime).filter(Boolean);
  const node24 = process.platform === 'linux'
    ? runtimes.find(runtime => runtime.platform === 'linux' && Number(/^v(\d+)\./.exec(runtime.version)?.[1]) === 24)
    : null;
  const matrix = hasPrefixEvents
    ? [{ platform: 'linux', nodeMajor: 24, status: node24 ? 'available' : 'unknown',
      reason: node24 ? null : process.platform === 'linux' ? 'Node 24 runtime unavailable' : 'Linux host unavailable',
      runtime: node24 }]
    : runtimeMatrix({ platform: process.platform, runtimes });
  const initialResults = matrix.flatMap(cell => COMMANDS.map(command => ({
    platform: cell.platform, nodeMajor: cell.nodeMajor, command, attempts: [],
    verdict: cell.status === 'unknown' ? 'unknown' : 'FAIL',
    reason: cell.status === 'unknown' ? cell.reason : 'Required attempts not executed',
  })));
  const report = createReport({ sourceSnapshot: before, matrix, results: initialResults });
  if (hasPrefixEvents) report.referenceResults = structuredClone(initialResults);
  const reportKind = hasPrefixEvents ? 'ledger-snapshot-reuse-ab' : 'ledger-performance-baseline';
  const reportRelative = `.sdd/evidence/${reportKind}.${process.platform}-node${process.versions.node.split('.')[0]}.${report.runId}.json`;
  const workRoot = path.join(root, '.lpb-work-' + report.runId);
  let fixture, failure;
  const combinedFailure = (error, message) => new AggregateError([...(failure ? [failure] : []), error],
    [message, errorRecord(failure)?.message, errorRecord(error)?.message].filter(Boolean).join(': '));
  try {
    if (matrix.some(cell => cell.status === 'available')) {
      fs.mkdirSync(workRoot);
      fixture = createFixture({ sourceRoot: root, workRoot, ledgerBytesOverride });
      for (const runtimeCell of matrix) {
        if (runtimeCell.status === 'unknown') continue;
        const runtime = runtimeCell.runtime.executable;
        const prepared = prepareFixtures(fixture, runtime);
        for (const entry of prepared) {
          const index = report.results.findIndex(result => result.platform === runtimeCell.platform
            && result.nodeMajor === runtimeCell.nodeMajor && result.command === entry.command);
          if (!hasPrefixEvents) {
            const cell = measureCell({ command: entry.command,
              prepare: () => addWorktree(fixture, entry.revision),
              clone: () => addWorktree(fixture, entry.revision),
              dispose: directory => removeWorktree(fixture, directory),
              identity: directory => fixtureIdentity(directory).sha256,
              attempt: directory => runAttempt({ root: directory, runtime, command: entry.command, script: fixture.script }) });
            report.results[index] = { platform: runtimeCell.platform, nodeMajor: runtimeCell.nodeMajor,
              runtime: runtimeCell.runtime, fixture: entry.identity, ...cell };
            continue;
          }
          const measure = reference => measureCell({ command: entry.command,
            prepare: () => addWorktree(fixture, entry.revision),
            clone: () => addWorktree(fixture, entry.revision),
            dispose: directory => removeWorktree(fixture, directory),
            identity: directory => fixtureIdentity(directory).sha256,
            attempt: directory => runAttempt({ root: directory, runtime, command: entry.command,
              script: fixture.script, reference }) });
          const measured = {};
          const order = COMMANDS.indexOf(entry.command) % 2 ? ['candidate', 'reference'] : ['reference', 'candidate'];
          for (const mode of order) measured[mode] = measure(mode === 'reference');
          const result = { platform: runtimeCell.platform, nodeMajor: runtimeCell.nodeMajor,
            runtime: runtimeCell.runtime, fixture: entry.identity };
          report.referenceResults[index] = { ...result, ...measured.reference };
          report.results[index] = { ...result, ...measured.candidate };
        }
        fixture.removePrepared();
      }
    }
  } catch (error) { failure = error; }
  finally {
    try {
      if (fixture) fixture.cleanup();
      fs.rmSync(workRoot, { recursive: true, force: true });
    } catch (error) { failure = combinedFailure(error, 'Baseline cleanup failed'); }
    try { assertSourceUnchanged(before, snapshotSource(root)); }
    catch (error) { failure = combinedFailure(error, 'Source preservation failed'); }
  }
  if (failure) report.runnerFailure = errorRecord(failure);
  try { assertSourceUnchanged(before, snapshotSource(root, reportRelative)); }
  catch (error) { throw failure ? combinedFailure(error, 'Final source preservation failed') : error; }
  if (hasPrefixEvents) {
    if (failure || report.results.some(cell => cell.verdict === 'FAIL')
      || report.referenceResults.some(cell => cell.verdict === 'FAIL')) {
      report.snapshotReuse = { status: 'FAIL', exit: 1,
        failures: [errorRecord(failure)?.message ?? 'Reference or candidate measurement failed'] };
    } else if (matrix[0].status === 'unknown') {
      report.snapshotReuse = { status: 'UNKNOWN', exit: 2, failures: [matrix[0].reason] };
    } else {
      report.snapshotReuse = evaluateSnapshotReuseReport(report,
        { ...report, results: report.referenceResults });
    }
  }
  const file = writeReport(root, report);
  const runFailed = !!failure || report.results.some(cell => cell.verdict === 'FAIL')
    || report.referenceResults?.some(cell => cell.verdict === 'FAIL');
  return { file, report, exit: hasPrefixEvents
    ? runFailed ? 1 : report.snapshotReuse.exit
    : runFailed ? 1 : report.results.some(cell => cell.verdict === 'unknown') ? 2 : 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseBaselineArgs(process.argv.slice(2));
    if (!options.nodes.length) options.nodes = [process.execPath];
    const result = runBaseline(options);
    console.log(result.file);
    process.exitCode = result.exit;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
