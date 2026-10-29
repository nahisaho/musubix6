import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sha, fileSha, json, save, mkdir, execute, cleanEnvironment, retainProcess,
  fingerprint, externalOutput, npmAncestors } from './release-qualification-io.mjs';
import { parseEvents, parseTap, namedControl, processControl, validateHost, validateMutationRows } from './release-qualification-evidence.mjs';
import { canonicalEnvironment, parseArguments, validateArchiveMembers } from './release-qualification-cli.mjs';
import { materializeSource } from './release-qualification.mjs';
import { applyLiteralEdit, cellCatalogue, runAdapter, validateAdapter, validateCandidateTree } from './release-qualification-cells.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const historical = json(path.join(source, '.sdd/release-validation.v0.2.0.json'));
const context = process.env.QUALIFY_CONTEXT ? json(process.env.QUALIFY_CONTEXT) : null;
const development = process.env.QUALIFY_DEVELOPMENT_DIR || path.join(source, '.release-qualification-test-work');

function work(t) {
  mkdir(development);
  const directory = fs.mkdtempSync(path.join(development, 'oracle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const encode = events => events.map(event => JSON.stringify(event)).join('\n') + '\n';
function eventLog(name = 'owned', { fail = false, skip, todo, owner = '/fixture.test.mjs', line = 12 } = {}) {
  return encode([
    { type: fail ? 'test:fail' : 'test:pass', data: { name, nesting: 0, skip, todo,
      details: fail ? { error: { name: 'AssertionError', code: 'ERR_ASSERTION', message: 'expected owned value',
        stack: `AssertionError [ERR_ASSERTION]: expected owned value\n    at ${owner}:${line}:3` } } : {} } },
    { type: 'test:plan', data: { nesting: 0, count: 1 } },
    ...Object.entries({ tests: 1, pass: fail || skip || todo ? 0 : 1,
      fail: fail && !skip && !todo ? 1 : 0, cancelled: 0, skipped: skip ? 1 : 0, todo: todo ? 1 : 0 })
      .map(([key, value]) => ({ type: 'test:diagnostic', data: { nesting: 0, message: `${key} ${value}` } })),
  ]);
}
function evidence(directory, text, exit = 0) {
  const target = fs.mkdtempSync(path.join(directory, 'receipt-'));
  return { command: [process.execPath, '--test', '/fixture.test.mjs'], exit, signal: null, timedOut: false,
    stdout: save(path.join(target, 'stdout'), text), stderr: save(path.join(target, 'stderr'), '') };
}
function host(directory) {
  const catalogue = historical.hostMutationCatalogue.map(name => ({
    name, test: 'owned', file: '/fixture.test.mjs', assertionLines: [12], expectedAssertion: 'expected owned value',
  }));
  const cases = catalogue.map(target => {
    const control = stage => {
      const failed = stage === 'mutant';
      const retained = evidence(directory, eventLog('owned', { fail: failed }), failed ? 1 : 0);
      return { status: failed ? 1 : 0, signal: null, assertion: failed,
        counts: { tests: 1, pass: failed ? 0 : 1, fail: failed ? 1 : 0, cancelled: 0, skipped: 0, todo: 0 },
        log: retained.stdout.path, logSha256: retained.stdout.sha256 };
    };
    return { name: target.name, test: target.test, file: target.file,
      baseline: control('baseline'), mutant: control('mutant'), restored: control('restored') };
  });
  return { catalogue, data: { status: 'PASS', cases } };
}
function assertHost(directory, fixture, mutate) {
  const value = structuredClone(fixture.data);
  mutate?.(value);
  return () => validateHost({ catalogue: fixture.catalogue, evidence: evidence(directory, JSON.stringify(value)) });
}
async function actualMutation(t, id) {
  assert.ok(context, 'frozen oracle context is required for actual mandatory mutation controls');
  const root = work(t);
  const manifest = { catalogues: {
    mutations: historical.mutationCatalogue, diagnosticMutations: historical.diagnosticMutationCatalogue,
  } };
  const cell = { id: 'MUTATION', runtime: '20', kind: 'mutation', timeoutSeconds: 300 };
  const catalogue = cellCatalogue(manifest, cell, source).filter(row => row.id === id);
  assert.equal(catalogue.length, 1);
  const node = context.configuration.runtimes.find(row => row.major === 20).executable;
  const result = await runAdapter({ cell, source, output: root, node, catalogue,
    environment: context.environment, configuration: context.configuration });
  assert.equal(result.status, 'PASS');
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].mutant.exit, 1);
  assert.equal(result.cases[0].originalSha256, result.cases[0].restoredSha256);
}
async function focused(t, id) {
  const directory = work(t);
  const result = await execute({
    command: [process.execPath, '--test', '--test-reporter=tap', '--test-name-pattern', `^${id} `,
      path.join(source, 'scripts/release-qualification.test.mjs')],
    cwd: source, env: { ...cleanEnvironment(process.env, process.env.PATH),
      QUALIFY_DEVELOPMENT_DIR: directory }, timeoutMs: 120000,
  });
  assert.equal(result.exit, 0, result.stdout + result.stderr);
  const parsed = parseTap(result.stdout);
  assert.equal(parsed.rows.filter(row => !row.filtered).length, 1);
}

async function isolatedOracleMutation(t, before, after, targetIndex) {
  const directory = work(t), copy = path.join(directory, 'source');
  fs.cpSync(source, copy, { recursive: true, filter: file => {
    const relative = path.relative(source, file);
    return !relative.split(path.sep).some(part => ['.git', 'node_modules', '.release-qualification-test-work'].includes(part));
  } });
  const target = path.join(copy, 'scripts/release-qualification-evidence.mjs');
  const original = fs.readFileSync(target, 'utf8');
  const run = async expected => {
    const result = await execute({
      command: [process.execPath, '--test', '--test-reporter=tap', '--test-name-pattern',
        '^' + historical.oracleCatalogue[targetIndex].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
        path.join(copy, 'scripts/release-qualification-oracles.test.mjs')],
      cwd: copy, env: { ...cleanEnvironment(process.env, process.env.PATH), QUALIFY_DEVELOPMENT_DIR: directory },
      timeoutMs: 120000,
    });
    assert.equal(result.exit, expected, result.stdout + result.stderr);
    if (expected === 1) assert.match(result.stdout, /ERR_ASSERTION/);
  };
  await run(0);
  try { fs.writeFileSync(target, applyLiteralEdit(original, { before, after, count: 1 })); await run(1); }
  finally { fs.writeFileSync(target, original); }
  await run(0);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
}

const checks = [
  async () => {
    for (const mode of ['preflight', 'prepare', 'freeze', 'check', 'run', 'status']) {
      assert.equal(parseArguments([mode, '--input', 'fixture.json']).mode, mode);
    }
    for (const args of [[], ['publish', '--input', 'x'], ['run'], ['run', '--input', 'x', '--extra']]) {
      assert.throws(() => parseArguments(args));
    }
  },
  () => {
    const config = { basePath: ['/provisioned/julia/bin', '/usr/bin', '/bin'],
      runtimes: [{ executable: '/nodes/20/node' }, { executable: '/nodes/24/node' }], environment: {} };
    const result = canonicalEnvironment(config, config.runtimes[0]);
    assert.ok(result.canonicalPath.indexOf('/provisioned/julia/bin') < result.canonicalPath.indexOf('/usr/bin'));
    assert.ok(!result.canonicalPath.includes('.juliaup'));
  },
  t => isolatedOracleMutation(t, "  unique(rows.map(row => row.name), 'native target');\n  const plans = events",
    '  const plans = events', 23),
  () => {
    assert.equal(applyLiteralEdit('alpha', { before: 'alpha', after: 'beta', count: 1 }), 'beta');
    for (const edit of [{ before: 'missing', after: 'beta', count: 1 },
      { before: 'alpha', after: 'alpha', count: 1 }, { before: 'alpha', after: 'beta', count: 2 }]) {
      assert.throws(() => applyLiteralEdit('alpha', edit));
    }
  },
  t => {
    const directory = work(t), candidate = path.join(directory, 'candidate');
    mkdir(path.join(candidate, '.git'));
    assert.throws(() => validateCandidateTree(candidate), /Git metadata/);
    fs.rmSync(path.join(candidate, '.git'), { recursive: true });
    assert.doesNotThrow(() => validateCandidateTree(candidate));
  },
  t => {
    const directory = work(t), candidate = path.join(directory, 'candidate');
    mkdir(candidate);
    fs.symlinkSync(candidate, path.join(directory, 'alias'));
    assert.throws(() => externalOutput(candidate, path.join(directory, 'alias', 'new-output')), /inside/);
    assert.equal(fs.existsSync(path.join(candidate, 'new-output')), false);
    assert.doesNotThrow(() => externalOutput(candidate, path.join(directory, 'external')));
  },
  () => assert.throws(() => namedControl(parseEvents(eventLog('/file.test.mjs')), ['owned']), /deep|equal|Expected/),
  () => {
    assert.doesNotThrow(() => namedControl(parseEvents(eventLog()), ['owned']));
    assert.throws(() => namedControl(parseEvents(eventLog('owned', { skip: true })), ['owned']));
    assert.throws(() => namedControl(parseEvents(eventLog('owned', { todo: true })), ['owned']));
    assert.doesNotThrow(() => namedControl(parseEvents(eventLog('known TODO', { fail: true, todo: true })),
      ['known TODO'], { excludedTodos: ['known TODO'] }));
  },
  t => {
    const directory = work(t), candidate = path.join(directory, 'candidate');
    mkdir(candidate);
    const before = npmAncestors(candidate);
    save(path.join(directory, '.npmrc'), 'registry=https://example.invalid\n');
    assert.notDeepEqual(npmAncestors(candidate), before);
    fs.unlinkSync(path.join(directory, '.npmrc'));
    assert.deepEqual(npmAncestors(candidate), before);
  },
  async t => {
    const directory = work(t), candidate = path.join(directory, 'source');
    mkdir(candidate); save(path.join(candidate, 'bytes'), 'immutable');
    await assert.rejects(materializeSource({ cell: { kind: 'gate' }, sourceRoot: candidate,
      destination: path.join(directory, 'copy'), gitHistory: { bundle: 'absent' } }), /history/);
    assert.equal(fs.readFileSync(path.join(candidate, 'bytes'), 'utf8'), 'immutable');
  },
  async t => {
    const directory = work(t), repo = path.join(directory, 'history'), candidate = path.join(directory, 'candidate');
    mkdir(repo); mkdir(candidate);
    save(path.join(repo, 'approval-history.txt'), 'fixture historical approval bytes; no release authorization');
    const env = cleanEnvironment(process.env, process.env.PATH);
    const run = async args => {
      const result = await execute({ command: ['git', '-C', repo, ...args], cwd: repo, env });
      assert.equal(result.exit, 0, result.stderr);
      return result.stdout.trim();
    };
    await run(['init', '-q']); await run(['add', '.']);
    await run(['-c', 'user.name=Oracle Fixture', '-c', 'user.email=oracle@example.invalid', 'commit', '-qm', 'historical fixture']);
    const commit = await run(['rev-parse', 'HEAD']), bundle = path.join(directory, 'history.bundle');
    await run(['bundle', 'create', bundle, '--all']);
    save(path.join(candidate, 'approval-history.txt'), 'current frozen candidate bytes');
    const destination = path.join(directory, 'gate');
    await materializeSource({ cell: { kind: 'gate' }, sourceRoot: candidate, destination,
      gitHistory: { bundle, sha256: fileSha(bundle), commit }, environment: env,
      runtime: { canonicalPath: process.env.PATH } });
    assert.equal(fs.readFileSync(path.join(destination, 'approval-history.txt'), 'utf8'), 'current frozen candidate bytes');
    const previous = await execute({ command: ['git', '-C', destination, 'show', `${commit}:approval-history.txt`],
      cwd: destination, env });
    assert.equal(previous.stdout, 'fixture historical approval bytes; no release authorization');
  },
  t => isolatedOracleMutation(t, '  equal(evidence.exit, expectedExit);', '  // isolated mutation removes exit ownership', 16),
  () => {
    const configuration = { basePath: ['/native/bin', '/usr/bin', '/bin'], environment: {},
      runtimes: [20, 22, 24].map(major => ({ executable: `/runtime/${major}/bin/node` })) };
    for (const runtime of configuration.runtimes) {
      const a = canonicalEnvironment(configuration, runtime), b = canonicalEnvironment(configuration, runtime);
      assert.deepEqual(a, b);
      assert.equal(a.canonicalPath.split(':')[0], path.dirname(runtime.executable));
    }
    assert.throws(() => canonicalEnvironment({ ...configuration, basePath: ['/runtime/22/bin'] }, configuration.runtimes[0]));
  },
  t => actualMutation(t, 'iterator-helper-names'),
  t => actualMutation(t, 'ownership-child-selector'),
  async t => {
    const directory = work(t), result = await execute({ command: [process.execPath, '-e',
      'process.stdout.write("out");process.stderr.write("err")'], cwd: directory, env: {} });
    const receipt = retainProcess(path.join(directory, 'record'), result);
    assert.deepEqual(processControl(receipt), { text: 'out', stderr: 'err' });
  },
  async t => {
    const directory = work(t), result = await execute({ command: [process.execPath, '-e',
      'process.stdout.write("out");process.stderr.write("err");process.exit(17)'], cwd: directory, env: {} });
    const receipt = retainProcess(path.join(directory, 'record'), result);
    assert.doesNotThrow(() => processControl(receipt, 17));
    assert.throws(() => processControl(receipt));
  },
  t => {
    const directory = work(t);
    for (const xml of ['<testsuite tests="0" failures="0" errors="0" skipped="0"></testsuite>',
      '<testsuite tests="1" failures="0" errors="0" skipped="1"></testsuite>']) {
      const report = save(path.join(directory, `report-${sha(xml)}.xml`), xml);
      const controls = ['baseline', 'mutant', 'restored'].map(phase => ({
        phase, evidence: evidence(directory, 'native report', phase === 'mutant' ? 1 : 0), reports: [report],
      }));
      assert.throws(() => validateAdapter({ cell: { id: 'NATIVE-GRADLE', mode: 'gradle' },
        evidence: evidence(directory, JSON.stringify({ status: 'PASS', controls })) }));
    }
  },
  async t => {
    const directory = work(t), executable = path.join(directory, 'tool'), entry = path.join(directory, 'dispatch');
    save(executable, '#!/bin/sh\nprintf "%s\\n" "$0"\n'); fs.chmodSync(executable, 0o700);
    fs.symlinkSync(executable, entry);
    const result = await execute({ command: [entry, '--version'], cwd: directory, env: {} });
    assert.equal(result.stdout.trim(), entry);
    assert.equal(fingerprint(entry).target.sha256, fileSha(executable));
    assert.equal(fingerprint(entry).link, executable);
  },
  t => {
    const directory = work(t);
    const target = { name: 'skill-route', targetName: 'owned', sourceTest: '/fixture.test.mjs', assertionLines: [12],
      assertionDiagnostics: [{ line: 12, kind: 'legacy' }] };
    const controls = Object.fromEntries(['baseline', 'mutant', 'restored'].map(phase =>
      [phase, evidence(directory, eventLog('owned', { fail: phase === 'mutant' }), phase === 'mutant' ? 1 : 0)]));
    const data = { status: 'PASS', cases: [{ name: target.name, ...controls,
      originalSha256: sha('original'), restoredSha256: sha('original') }] };
    const validate = value => validateMutationRows({ catalogue: [target], evidence: evidence(directory, JSON.stringify(value)) });
    assert.doesNotThrow(() => validate(data));
    for (const change of [value => { value.cases[0].mutant = value.cases[0].baseline; },
      value => { delete value.cases[0].restored; }, value => { value.cases[0].restoredSha256 = sha('changed'); }]) {
      const corrupt = structuredClone(data); change(corrupt); assert.throws(() => validate(corrupt));
    }
    delete target.assertionDiagnostics;
    assert.throws(() => validate(data), /frozen assertion diagnostics required/);
  },
  t => {
    const directory = work(t), fixture = host(directory);
    assert.doesNotThrow(assertHost(directory, fixture));
    assert.throws(assertHost(directory, fixture, data => { data.cases[0].mutant.status = 0; }));
    assert.throws(assertHost(directory, fixture, data => { data.cases[0].restored.counts.skipped = 1; }));
  },
  async t => {
    const directory = work(t), filename = path.join(directory, 'native.test.mjs');
    save(filename, 'import {test} from "node:test";test("observed lightweight target",()=>{});\n');
    const result = await execute({ command: [process.execPath, '--test', '--test-reporter=tap', filename],
      cwd: directory, env: {} });
    assert.equal(result.exit, 0);
    assert.doesNotThrow(() => namedControl(parseTap(result.stdout), ['observed lightweight target']));
  },
  t => focused(t, 'TEST-RELQ-003'),
  () => {
    for (const text of ['', 'TAP version 13\n1..0\n# tests 0\n', 'TAP version 13\nok 1 - owned\n']) {
      assert.throws(() => parseTap(text));
    }
    for (const options of [{ skip: true }, { todo: true }]) {
      assert.throws(() => namedControl(parseEvents(eventLog('owned', options)), ['owned']));
    }
    const rows = JSON.parse(eventLog().split('\n')[0]);
    assert.throws(() => parseEvents(encode([rows, rows, { type: 'test:plan', data: { nesting: 0, count: 2 } },
      ...Object.entries({ tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 })
        .map(([key, value]) => ({ type: 'test:diagnostic', data: { nesting: 0, message: `${key} ${value}` } })),
    ])));
  },
  () => {
    assert.doesNotThrow(() => validateArchiveMembers(['scripts/release-qualification.mjs', '.github/skills/skill/SKILL.md']));
    for (const name of ['../escape', '/absolute', 'package/__pycache__/x.pyc', 'x/.git/config', 'a\\b']) {
      assert.throws(() => validateArchiveMembers([name]));
    }
  },
  t => {
    const directory = work(t);
    const validate = log => validateAdapter({ cell: { id: 'NATIVE-PROSE', mode: 'prose' },
      evidence: evidence(directory, JSON.stringify({ status: 'PASS', evidence: evidence(directory, log) })) });
    assert.doesNotThrow(() => validate('Ran 2 tests in 0.1s\n\nOK\n'));
    for (const log of ['Ran 0 tests in 0.1s\n\nOK\n', 'Ran 2 tests in 0.1s\n\nOK (skipped=1)\n',
      'Ran 2 tests in 0.1s\n\nFAILED (failures=1)\n']) assert.throws(() => validate(log));
  },
  t => focused(t, 'TEST-RELQ-001'),
  async t => {
    const directory = work(t), marker = 'PRIVATE_FIXTURE_BODY_MARKER';
    save(path.join(directory, '.sdd/specs/a.md'), `---\nfeature: a\ntier: T1\n---\nREQ-A-001 ${marker}\n`);
    const command = [process.execPath, path.join(source, '.github/skills/lean-sdd-tdd/scripts/sdd.mjs'),
      'context', 'a', '--max-bytes', '1', '--root', directory];
    const result = await execute({ command, cwd: directory, env: cleanEnvironment(process.env, process.env.PATH) });
    assert.notEqual(result.exit, 0);
    assert.ok(!result.stdout.includes(marker) && !result.stdout.includes(JSON.stringify(marker)));
  },
  t => {
    const directory = work(t), fixture = host(directory);
    assert.doesNotThrow(assertHost(directory, fixture));
    for (const mutate of [data => { data.cases.pop(); },
      data => { data.cases.push(structuredClone(data.cases[0])); },
      data => { delete data.cases[0].restored; },
      data => { data.cases[0].mutant.logSha256 = sha('forged'); }]) {
      assert.throws(assertHost(directory, fixture, mutate));
    }
  },
];

assert.equal(checks.length, historical.oracleCatalogue.length);
for (const [index, title] of historical.oracleCatalogue.entries()) {
  test(title, { timeout: 300000 }, checks[index]);
}
