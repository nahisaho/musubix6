import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import * as processIo from './release-qualification-io.mjs';
import {
  contentCaseCatalogue, buildContentCasePlan, runContentCase, validateContentCase,
  applyContentEdit,
  assertContentInventory,
} from './release-qualification-content-mutations.mjs';
import { parseContentPython } from './release-qualification-evidence.mjs';
import {
  admitPlan, freezeCandidate, checkFrozenCandidate, validateCellEvidence,
  evaluateReadiness as evaluateReadinessApi, recordRun, runQualificationCell, prepareReleaseReport,
  verifyPackageEntrypoints,
} from './release-qualification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const planRelative = '.sdd/release-validation.v0.2.4.json';
const inheritedRelative = '.sdd/release-validation.v0.2.0.json';
const approvalsRelative = '.sdd/approvals.json';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const fileDigest = file => digest(fs.readFileSync(file));
const inherited = read(path.join(root, inheritedRelative));
const approvedPlan = read(path.join(root, planRelative));
const genuineLock = read(path.join(root, approvalsRelative))['release-qualification'];
const required = inherited.requiredCells.filter(cell => cell.id !== 'NATIVE-WSLC');
const contentReference = read(path.join(root, '.sdd/release-content-mutations.v0.2.4.json'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return file;
};

/** @id TEST-RELQ-PROCESS-001 @verifies REQ-RELQ-003 */
test('TEST-RELQ-PROCESS-001 rejects observation and cleanup errors and bounds repeated termination', async () => {
  const permission = () => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }); };
  await assert.rejects(processIo.waitForProcessExit(process.pid, 1000, { kill: permission }),
    { code: 'EPERM' }, 'EPERM must not mean the process disappeared');
  await assert.doesNotReject(processIo.waitForProcessExit(process.pid, 1000, {
    kill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); },
  }));
  for (const state of ['S', 'R', 'Z']) {
    assert.equal(processIo.processState(`123 (worker ) with spaces) ${state} 1 2 3`), state);
  }
  assert.throws(() => processIo.processState('123 (broken) unknown'), /process stat/);
  await assert.doesNotReject(processIo.waitForProcessExit(process.pid, 1000, {
    kill: () => true, readStat: () => '123 (worker ) with spaces) Z 1 2 3',
  }));
  await assert.rejects(processIo.waitForProcessExit(process.pid, 1000, {
    kill: () => true, readStat: permission,
  }), { code: 'EPERM' });
  const simulated = async ({ overflow = false, killError } = {}) => {
    const child = new EventEmitter();
    child.pid = process.pid;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const timers = [], kills = [];
    const result = await processIo.execute({ command: ['unit-only-command'], cwd: root, env: {},
      timeoutMs: 2000, maxBytes: 1 }, {
      spawn: () => {
        queueMicrotask(() => {
          if (overflow) {
            child.stdout.emit('data', Buffer.from('XX'));
            child.stderr.emit('data', Buffer.from('XX'));
          }
          child.emit('close', 0, null);
        });

        return child;
      },
      kill: (pid, signal) => {
        kills.push([pid, signal]);
        if (killError) throw Object.assign(new Error(killError), { code: killError });
      },
      setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
      clearTimeout: timer => { timer.cleared = true; },
    });
    return { result, timers, kills };
  };
  const valid = await simulated();
  assert.equal(valid.result.exit, 0); assert.equal(valid.result.error, null);
  const absent = await simulated({ killError: 'ESRCH' });
  assert.equal(absent.result.error, null, 'already absent group is a valid cleanup');
  for (const overflow of [false, true]) {
    const denied = await simulated({ overflow, killError: 'EPERM' });
    assert.match(denied.result.error, /EPERM/, 'cleanup permission errors must remain explicit');
  }
  const over = await simulated({ overflow: true });
  assert.equal(over.result.outputLimit, true);
  assert.equal(over.timers.filter(timer => timer.delay === 1000).length, 1, 'one escalation for repeated overflow');
  assert.equal(over.kills.filter(([, signal]) => signal === 'SIGTERM').length, 1);
  assert.ok(over.timers.every(timer => timer.cleared), 'no delayed signals survive process completion');
});

/** @id TEST-RELQ-CLOSURE-001 @verifies REQ-RELQ-002 */
test('TEST-RELQ-CLOSURE-001 rejects unbound execution inputs and manifest policy rewrites', async t => {
  const directory = workspace(t);
  const { request, effects } = freezeFixture(directory);
  const dependencies = path.join(directory, 'execution-dependencies');
  const npm = write(path.join(dependencies, 'npm/bin/npm-cli.js'), 'fixture npm');
  const python = write(path.join(dependencies, 'python/bin/python'), 'fixture interpreter');
  write(path.join(dependencies, 'python/lib/site-packages/model.py'), 'original model');
  const jar = write(path.join(dependencies, 'junit.jar'), 'fixture JAR');
  const modules = path.join(dependencies, 'node_modules');
  write(path.join(modules, 'typescript/index.js'), 'fixture dependency');
  request.execution = { sourceRoot: request.files.find(file => file.kind === 'source').path,
    packagePath: request.files.find(file => file.kind === 'package').path, nodeModules: modules,
    prosePython: python, gradleJars: [jar],
    runtimes: request.tools.filter(tool => /^node/.test(tool.id)).map(tool => ({
      major: Number(tool.id.slice(4)), executable: tool.executable, npm,
    })) };
  await reject(freezeCandidate(request, effects), 'execution dependency closure must be frozen, not just a nominal dependency file');
  request.files.push({ kind: 'dependencies', path: dependencies });
  const extra = path.join(directory, 'environment-dependency');
  const extraFile = write(path.join(extra, 'entry.js'), 'environment-selected dependency');
  const pathKeys = ['R_HOME', 'R_LIBS', 'GEM_PATH', 'JULIA_PROJECT', 'JULIA_LOAD_PATH',
    'MUSUBIX_TEST_TSC', 'SDD_R34_TYPESCRIPT', 'QUALIFY_PROSE_PYTHON'];
  for (const key of pathKeys) {
    request.execution.environment = { [key]: key.includes('TSC') || key.includes('TYPESCRIPT') || key.includes('PYTHON') ? extraFile : extra };
    await reject(freezeCandidate({ ...request, outputPath: path.join(directory, `unbound-${key}.json`) }, effects),
      `${key} cannot introduce an unfrozen execution dependency`);
  }
  request.files.push({ kind: 'dependencies', path: extra });
  for (const key of pathKeys) {
    request.execution.environment = { [key]: extra };
    await pass(freezeCandidate({ ...request, outputPath: path.join(directory, `bound-${key}.json`) }, effects),
      `explicitly bound ${key} control`);
  }
  for (const [key, value] of [['R_LIBS', `:${extra}`], ['GEM_PATH', `${extra}:`], ['JULIA_LOAD_PATH', '@stdlib']]) {
    request.execution.environment = { [key]: value };
    await reject(freezeCandidate({ ...request, outputPath: path.join(directory, `unsupported-${key}.json`) }, effects),
      'unresolved environment path forms must be refused explicitly');
  }
  delete request.execution.environment;
  const frozen = await pass(freezeCandidate(request, effects), 'complete explicit dependency closure');
  const input = { manifestPath: frozen.manifestPath, manifestSha256: frozen.manifestSha256 };
  await pass(checkFrozenCandidate(input, effects), 'bound complete closure control');
  for (const file of [path.join(modules, 'typescript/index.js'), jar,
    path.join(dependencies, 'python/lib/site-packages/model.py')]) {
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, 'changed');
    await reject(checkFrozenCandidate(input, effects), 'changed installed dependency must reject');
    fs.writeFileSync(file, bytes);
    await pass(checkFrozenCandidate(input, effects), 'restored dependency bytes accepted');
  }
  for (const hash of [undefined, '', 'not-a-digest', digest('wrong')]) {
    await reject(checkFrozenCandidate({ ...input, manifestSha256: hash }, effects), 'caller-bound exact digest required');
  }
  const baseline = fs.readFileSync(input.manifestPath), manifest = read(input.manifestPath);
  for (const change of [
    copy => { copy.requiredCells = []; copy.commands = []; },
    copy => { copy.commands.pop(); },
    copy => { copy.commands[0].timeoutSeconds--; },
    copy => { copy.execution.nodeModules = path.join(directory, 'outside'); },
  ]) {
    const copy = clone(manifest); change(copy);
    copy.inputsSha256 = digest(JSON.stringify({ files: copy.files, tools: copy.tools, environment: copy.environment,
      commands: copy.commands, catalogues: copy.catalogues, execution: copy.execution,
      cellCatalogues: copy.cellCatalogues, requiredCells: copy.requiredCells, exclusions: copy.exclusions,
      registeredNames: copy.registeredNames }));
    write(input.manifestPath, copy);
    await reject(checkFrozenCandidate({ ...input, manifestSha256: fileDigest(input.manifestPath) }, effects),
      'rehashing a structurally weakened manifest cannot establish a valid frozen candidate');
  }
  fs.writeFileSync(input.manifestPath, baseline);
  await pass(checkFrozenCandidate(input, effects), 'unchanged original manifest remains accepted');
  const { assertionCatalogue } = await import('./release-qualification-cells.mjs');
  const { createRequire } = await import('node:module');
  const parserModule = createRequire(import.meta.url).resolve('typescript');
  const isolated = path.join(directory, 'isolated-parser'), marker = path.join(directory, 'ambient-parser-used');
  write(path.join(isolated, 'package.json'), '{"type":"module"}');
  write(path.join(isolated, 'owned.test.mjs'), "test('owned',()=>assert.equal(1,1,'owned expectation'));\n");
  write(path.join(isolated, 'node_modules/typescript/package.json'), '{"main":"index.cjs"}');
  write(path.join(isolated, 'node_modules/typescript/index.cjs'),
    `const fs=require('node:fs'),ts=require(${JSON.stringify(parserModule)});module.exports={...ts,createSourceFile(...args){fs.writeFileSync(${JSON.stringify(marker)},'ambient');return ts.createSourceFile(...args)}};`);
  const parsed = assertionCatalogue(isolated, 'owned.test.mjs', 'owned', 'owned expectation', path.join(root, 'node_modules'));
  assert.deepEqual(parsed.assertionLines, [1]);
  assert.equal(fs.existsSync(marker), false, 'use the explicitly frozen parser, not ambient candidate dependency resolution');
  fs.rmSync(path.join(isolated, 'node_modules'), { recursive: true });
  assert.deepEqual(assertionCatalogue(isolated, 'owned.test.mjs', 'owned', 'owned expectation',
    path.join(root, 'node_modules')).assertionLines, [1], 'an isolated source archive needs no installed dependency symlink');
  write(path.join(isolated, 'package.json'), { type: 'module', scripts: { test: 'node --test owned.test.mjs' } });
  const { discoverCurrentCatalogue } = await import('./release-qualification-cells.mjs');
  const registered = await discoverCurrentCatalogue({
    source: isolated, node20: process.execPath, output: path.join(directory, 'archive-registration'),
    environment: {}, nodeModules: path.join(root, 'node_modules'),
  }, {
    execute: async invocation => {
      const modules = path.join(invocation.cwd, 'node_modules');
      const available = fs.existsSync(modules) && fs.realpathSync(modules) === fs.realpathSync(path.join(root, 'node_modules'));
      const counts = { tests: 1, pass: 0, fail: 0, cancelled: 0, skipped: 1, todo: 0 };
      return { ...invocation, exit: 0, signal: null, timedOut: false, error: null, stderr: '',
        stdout: [
          { type: 'test:pass', data: { name: available ? 'bound dependency available' : 'dependency missing',
            nesting: 0, skip: 'test name does not match pattern' } },
          { type: 'test:plan', data: { nesting: 0, count: 1 } },
          ...Object.entries(counts).map(([key, value]) => ({
            type: 'test:diagnostic', data: { nesting: 0, message: `${key} ${value}` },
          })),
        ].map(row => JSON.stringify(row)).join('\n') + '\n' };
    },
  });
  assert.deepEqual(registered.names, ['bound dependency available'], 'archive registration must receive the explicit installed dependencies');
  assert.equal(fs.existsSync(path.join(isolated, 'node_modules')), false, 'registration must not modify the immutable source archive');
});

/** @id TEST-RELQ-READINESS-001 @verifies REQ-RELQ-004 */
test('TEST-RELQ-READINESS-001 refuses synthetic inline empty-run readiness without a bound manifest', async t => {
  const directory = workspace(t), hash = digest('fixture');
  const manifest = { sha256: hash, candidateSha256: hash, inputsSha256: hash, requiredCells: [], commands: [] };
  const history = [1, 2].map(id => ({
    id: `fake-${id}`, status: 'PASS', manifestSha256: hash, candidateSha256: hash,
    beforeInputsSha256: hash, afterInputsSha256: hash, cells: [],
    state: { sourceRoots: [], homeRoots: [], cacheRoots: [] },
  }));
  await reject(evaluateReadinessApi({ manifest, history }), 'two empty synthetic passes must never mean technical-ready');
  await initializeReadiness(directory);
  const valid = readinessFixture(directory, [runFixture(directory, 1), runFixture(directory, 2)]);
  await pass(evaluateReadiness(valid), 'two complete fresh bound fixture runs remain accepted through the same public API');
  const unbound = { ...valid }; delete unbound.manifestSha256;
  await reject(evaluateReadinessApi(unbound), 'public readiness requires the expected retained manifest digest');
});

/** @id TEST-RELQ-PACKAGE-BINDING-001 @verifies REQ-RELQ-005 */
test('TEST-RELQ-PACKAGE-BINDING-001 uses the exact frozen tgz and rejects mismatched packaged origins', async t => {
  const directory = workspace(t);
  const npm = path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
  const packed = await processIo.execute({ command: [process.execPath, npm, 'pack', '--offline',
    '--ignore-scripts', '--json', '--pack-destination', directory], cwd: root,
    env: processIo.cleanEnvironment(process.env, process.env.PATH), timeoutMs: 120000 });
  assert.equal(packed.exit, 0, packed.stderr);
  const tgz = path.join(directory, JSON.parse(packed.stdout)[0].filename);
  const context = contentContext(directory, 'SKILL-MUTATION');
  context.configuration = { qualifying: true, packagePath: tgz, packageSha256: fileDigest(tgz) };
  const target = contentCaseCatalogue(contentReference, 'SKILL-MUTATION')
    .find(row => row.kind === 'vendor' && row.origin === 'package' && row.policy === 'unauthorized-byte');
  const plan = buildContentCasePlan(context, target);
  assert.ok(plan.setupCommands.every(command => !command.includes('pack')), 'qualifying package origins cannot silently repack');
  assert.ok(plan.setupCommands.some(command => command.includes(tgz)), 'commands consume the exact frozen archive');
  const row = await runContentCase(context, target);
  assert.equal(row.status, 'PASS');
  assert.doesNotThrow(() => validateContentCase({ row, target, plan, reference: contentReference }));
  for (const change of [
    copy => { delete copy.packagePath; }, copy => { delete copy.packageSha256; },
    copy => { copy.packageSha256 = digest('other archive'); },
    copy => { copy.packagePath = path.join(directory, 'missing.tgz'); },
  ]) {
    const configuration = clone(context.configuration); change(configuration);
    assert.throws(() => buildContentCasePlan({ ...context, configuration }, target));
  }
  const development = buildContentCasePlan({ ...context, configuration: {} }, target);
  assert.ok(development.setupCommands.some(command => command.includes('pack')),
    'explicit development repacking remains supported without qualification credit');
});

function workspace(t) {
  const parent = process.env.QUALIFY_DEVELOPMENT_DIR || os.tmpdir();
  const directory = path.join(parent, `fixture-${randomUUID()}`);
  fs.mkdirSync(directory, { recursive: true });
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function contentContext(directory, cellId) {
  return {
    source: root, output: path.join(directory, 'content'), node: process.execPath,
    cell: { id: cellId, runtime: '24', timeoutSeconds: 3600 },
    environment: { ...process.env, TMPDIR: directory, PYTHONDONTWRITEBYTECODE: '1' },
    configuration: {},
  };
}

function alteredContentReceipt(directory, row, change) {
  const copy = clone(row), receipt = copy.mutant;
  change(receipt);
  const record = { ...receipt };
  delete record.receipt;
  receipt.receipt = retained(directory, `altered-${randomUUID()}.json`, JSON.stringify(record));
  return copy;
}

/** @id TEST-RELQ-CONTENT-ADMISSION-001 @verifies REQ-RELQ-001 */
test('TEST-RELQ-CONTENT-ADMISSION-001 accepts seven genuine bindings and rejects absent or changed content catalogue', async t => {
  const scope = scopeFixture(workspace(t));
  await pass(admitPlan(scope), 'matching seven-artifact unit must be admitted');
  const reference = path.join(scope.root, '.sdd/release-content-mutations.v0.2.4.json');
  const original = fs.readFileSync(reference);
  fs.appendFileSync(reference, '\n');
  await reject(admitPlan(scope), 'changed content catalogue must reject');
  relockFixture(scope);
  await reject(admitPlan(scope), 'relocked catalogue without matching plan digest must reject');
  fs.writeFileSync(reference, original);
  relockFixture(scope);
  await pass(admitPlan(scope), 'restored genuine seven-artifact unit');
  fs.rmSync(reference);
  await reject(admitPlan(scope), 'missing content catalogue must reject');
});

/** @id TEST-RELQ-SKILL-001 @verifies REQ-RELQ-003, REQ-RELQ-005 */
test('TEST-RELQ-SKILL-001 preserves 1163 exact cases and owned native inventory controls', async t => {
  const directory = workspace(t);
  const catalogue = contentCaseCatalogue(contentReference, 'SKILL-MUTATION');
  assert.equal(catalogue.length, 1163, '13 semantic plus 1150 vendor mechanisms');
  assert.equal(new Set(catalogue.map(row => row.id)).size, 1163);
  assert.equal(catalogue.filter(row => row.kind === 'semantic').length, 13);
  assert.equal(catalogue.filter(row => row.kind === 'vendor').length, 1150);
  assert.deepEqual(catalogue.slice(0, 13).map(row => row.id), contentReference.skillCatalogue.map(row => row.proposedId));
  assert.deepEqual(catalogue.slice(-60).map(row => row.id), contentReference.vendorReference.originSensitivityCases.map(row => row.id));
  const context = contentContext(directory, 'SKILL-MUTATION');
  const target = catalogue.find(row => row.kind === 'vendor' && row.origin === 'source' && row.policy === 'unauthorized-mode-400');
  const plan = buildContentCasePlan(context, target);
  const row = await runContentCase(context, target);
  assert.equal(row.status, 'PASS');
  assert.doesNotThrow(() => validateContentCase({ row, target, plan, reference: contentReference }));
  const inventoryInput = { referencePath: path.join(root, '.sdd/release-content-mutations.v0.2.4.json'),
    referenceSha256: fileDigest(path.join(root, '.sdd/release-content-mutations.v0.2.4.json')),
    originRoot: plan.originRoot, origin: 'source', host: 'copilot' };
  assert.doesNotThrow(() => assertContentInventory(inventoryInput));
  assert.throws(() => assertContentInventory({ ...inventoryInput, duplicateProbe: true }), /duplicate paths/);
  const skillRoot = path.join(plan.originRoot, '.github/skills'), originalFile = path.join(plan.originRoot, target.file);
  const stash = path.join(directory, 'saved-file');
  fs.renameSync(originalFile, stash);
  try { assert.throws(() => assertContentInventory(inventoryInput), /inventory paths/); }
  finally { fs.renameSync(stash, originalFile); }
  const extra = path.join(skillRoot, 'tech-writer', 'extra-file');
  fs.writeFileSync(extra, 'unapproved');
  try { assert.throws(() => assertContentInventory(inventoryInput), /inventory paths/); }
  finally { fs.rmSync(extra); }
  const empty = path.join(skillRoot, 'tech-writer', 'scripts', 'unapproved-empty');
  fs.mkdirSync(empty);
  try {
    assert.deepEqual(fs.readdirSync(empty), []);
    assert.throws(() => assertContentInventory(inventoryInput),
      { code: 'ERR_ASSERTION', message: /owned inventory paths/ });
  } finally { fs.rmdirSync(empty); }
  assert.doesNotThrow(() => assertContentInventory(inventoryInput), 'exact directory tree restored');
  const obsidian = path.join(skillRoot, 'obsidian-unapproved');
  fs.mkdirSync(obsidian);
  try { assert.throws(() => assertContentInventory(inventoryInput), /inventory names/); }
  finally { fs.rmdirSync(obsidian); }
  const cache = path.join(skillRoot, 'tech-writer', '__pycache__');
  fs.mkdirSync(cache);
  try { assert.throws(() => assertContentInventory(inventoryInput), /inventory cache/); }
  finally { fs.rmdirSync(cache); }
  fs.symlinkSync(directory, extra);
  try { assert.throws(() => assertContentInventory(inventoryInput), /external symlink/); }
  finally { fs.rmSync(extra); }
  assert.doesNotThrow(() => assertContentInventory(inventoryInput));
  for (const other of [
    catalogue.find(entry => entry.kind === 'vendor' && entry.origin === 'source' && entry.policy === 'unauthorized-byte'),
    catalogue.find(entry => entry.kind === 'vendor' && entry.origin === 'package' && entry.policy === 'unauthorized-byte'),
  ]) {
    if (other.origin === 'package') assert.equal(buildContentCasePlan(context, other).inventoryHost, 'copilot',
      'hostless extracted packages use the complete Copilot reference inventory without a CLI host flag');
    const observed = await runContentCase(context, other);
    assert.equal(observed.status, 'PASS', 'source byte and package portable-mode positive controls');
    assert.doesNotThrow(() => validateContentCase({
      row: observed, target: other, plan: buildContentCasePlan(context, other), reference: contentReference,
    }));
  }
  for (const change of [
    receipt => { receipt.command = [process.execPath, '--version']; },
    receipt => { receipt.exit = 0; },
    receipt => { receipt.signal = 'SIGTERM'; },
    receipt => { receipt.timedOut = true; },
    receipt => { receipt.stdout.sha256 = digest('forged log'); },
  ]) {
    const invalid = alteredContentReceipt(directory, row, change);
    assert.throws(() => validateContentCase({ row: invalid, target, plan, reference: contentReference }));
  }
  assert.throws(() => contentCaseCatalogue({ ...contentReference, skillCatalogue: [] }, 'SKILL-MUTATION'));
  assert.throws(() => contentCaseCatalogue(contentReference, 'UNKNOWN'));
  const invalidReceipt = clone(row);
  invalidReceipt.mutant.startedAt = 'not the retained command start';
  assert.throws(() => validateContentCase({ row: invalidReceipt, target, plan, reference: contentReference }));
  for (const corrupt of [
    copy => { copy.afterSha256 = digest('not restored'); },
    copy => { copy.restored.exit = 1; },
  ]) {
    const copy = clone(row); corrupt(copy);
    assert.throws(() => validateContentCase({ row: copy, target, plan, reference: contentReference }));
  }
  const scoped = { scope: 'def chosen(', before: '"old"', after: '"new"' };
  assert.equal(applyContentEdit('def chosen():\n    value = "old"\nclass Following:\n    value = "old"\n', scoped),
    'def chosen():\n    value = "new"\nclass Following:\n    value = "old"\n');
  for (const text of ['def other():\n    value = "old"\n', 'def chosen():\n    pass\n',
    'def chosen():\n    values = ["old", "old"]\n', 'def chosen():\n    pass\ndef chosen():\n    value = "old"\n']) {
    assert.throws(() => applyContentEdit(text, scoped));
  }
  const unsafeSource = path.join(directory, 'unsafe-source'), unsafeOutput = path.join(unsafeSource, 'evidence');
  write(path.join(unsafeSource, 'scripts/release-qualification-content-mutations.mjs'),
    fs.readFileSync(path.join(root, 'scripts/release-qualification-content-mutations.mjs'), 'utf8'));
  write(path.join(unsafeSource, '.sdd/release-content-mutations.v0.2.4.json'), contentReference);
  try { await runContentCase({ ...context, source: unsafeSource, output: unsafeOutput }, target); }
  catch (error) { assert.ok(error); }
  assert.equal(fs.existsSync(unsafeOutput), false, 'source-contained case output must reject before any mkdir');
  // These are parser unit data, not native execution or qualification credit.
  const python = { assertionSource: '/unit-data/oracle.py', assertionLines: [232],
    targetNames: ['InvariantTests.test_protected'] };
  const block = 'FAIL: test_protected (__main__.InvariantTests.test_protected)\n' +
    'Traceback (most recent call last):\n  File "/unit-data/oracle.py", line 232, in test_protected\nAssertionError: blocked != passed\n';
  const failure = block.repeat(11) + 'Ran 1 test in 0.1s\nFAILED (failures=11)\n';
  assert.deepEqual(parseContentPython(failure, python, true), { tests: 1, failures: 11 });
  const calledOracle = block.replace('Traceback (most recent call last):\n',
    'Traceback (most recent call last):\n  File "/unit-data/production.py", line 9, in call_oracle\n');
  assert.deepEqual(parseContentPython(calledOracle.repeat(11) + 'Ran 1 test in 0.1s\nFAILED (failures=11)\n',
    python, true), { tests: 1, failures: 11 }, 'owned throwing frame after a production caller remains valid');
  const productionThrow = block.replace('\nAssertionError:',
    '\n  File "/unit-data/production.py", line 9, in assertFalse\nAssertionError:');
  for (const filename of ['<string>', '<stdin>', 'dir with spaces/prod.py', 'prod "quoted".py',
    '/other/a "quoted" oracle.py']) {
    assert.throws(() => parseContentPython(productionThrow.replace('/unit-data/production.py', filename) +
      'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), /wrong exact Python assertion frame/,
    'pseudo or quoted throwing filename must not disappear behind an earlier owned frame');
  }
  assert.throws(() => parseContentPython(productionThrow.replace('/unit-data/production.py', 'prod.py') +
    'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), /wrong exact Python assertion frame/,
  'relative throwing filename must not disappear behind an earlier owned frame');
  for (const header of ['  File "prod.py", line nope, in fail', '  File "prod.py", line 0, in fail',
    '  File "prod.py", line 9007199254740992, in fail', '  File "prod.py", line 9',
    '  File prod.py, line 9, in fail', '    File "prod.py", line 9, in fail',
    '  File "prod.py", line 9, in ']) {
    assert.throws(() => parseContentPython(block.replace('\nAssertionError:', '\n' + header + '\nAssertionError:') +
      'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), /unparseable Python traceback frame/,
    'malformed frame must not disappear behind a valid prior frame');
  }
  for (const filename of ['prod.py', '<string>', 'dir with spaces/a "quoted".py']) {
    const caller = block.replace('Traceback (most recent call last):\n',
      `Traceback (most recent call last):\n  File "${filename}", line 9, in caller\n`);
    assert.deepEqual(parseContentPython(caller + 'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true),
      { tests: 1, failures: 1 }, 'non-owned caller followed by exact owned throw is valid');
  }
  const quotedOwner = '/unit-data/a "quoted" oracle.py';
  assert.throws(() => parseContentPython(block.replaceAll(python.assertionSource, 'oracle.py') +
    'Ran 1 test in 0.1s\nFAILED (failures=1)\n', { ...python, assertionSource: 'oracle.py' }, true),
  /wrong exact Python assertion frame/, 'a relative expected source cannot authorize a relative throwing frame');
  assert.deepEqual(parseContentPython(block.replaceAll(python.assertionSource, quotedOwner) +
    'Ran 1 test in 0.1s\nFAILED (failures=1)\n', { ...python, assertionSource: quotedOwner }, true),
  { tests: 1, failures: 1 }, 'literal spaces and embedded filename quotes preserve exact frame identity');
  assert.deepEqual(parseContentPython(block.replace('\nAssertionError:',
    '\n    File = "ordinary source code, not a frame"\nAssertionError:') +
    'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), { tests: 1, failures: 1 });
  for (const index of [0, 5, 10]) {
    const mixed = Array.from({ length: 11 }, (_, i) => i === index ? productionThrow : block).join('') +
      'Ran 1 test in 0.1s\nFAILED (failures=11)\n';
    assert.throws(() => parseContentPython(mixed, python, true), /wrong exact Python assertion frame/,
      'each failed traceback must throw at its independently owned assertion');
  }
  assert.throws(() => parseContentPython(productionThrow.replace('/unit-data/production.py", line 9',
    '/unit-data/oracle.py", line 231') + 'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true),
  /wrong exact Python assertion frame/);
  assert.deepEqual(parseContentPython('Ran 1 test in 0.1s\n\nOK\n', python, false), { tests: 1, failures: 0 });
  for (const message of ['skipped', 'expected failure', 'unexpected success',
    'test_protected (__main__.InvariantTests.test_protected) ... skipped is literal diagnostic data']) {
    assert.deepEqual(parseContentPython(block.replace('blocked != passed', message) +
      'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), { tests: 1, failures: 1 },
    'assertion diagnostic wording is not a unittest policy outcome');
  }
  for (const status of ["skipped 'fixture reason'", 'expected failure', 'unexpected success']) {
    assert.throws(() => parseContentPython(
      'test_protected (__main__.InvariantTests.test_protected) ... ' + status + '\n' +
      block + 'Ran 1 test in 0.1s\nFAILED (failures=1)\n', python, true), /setup\/skip/);
  }
  for (const summary of ['OK (skipped=1)', 'OK (expected failures=1)',
    'FAILED (unexpected successes=1)', 'FAILED (failures=1, skipped=1)']) {
    for (const failed of [false, true]) {
      assert.throws(() => parseContentPython(block + 'Ran 1 test in 0.1s\n' + summary + '\n', python, failed));
    }
  }
  for (const invalid of [
    failure.replaceAll('/unit-data/oracle.py', '/suffix/unit-data/oracle.py'),
    failure.replaceAll('AssertionError:', 'TypeError:'),
    failure.replace('failures=11', 'failures=10'),
    failure.replace('Ran 1 test', 'Ran 0 tests'),
    block.replace('  File "/unit-data/oracle.py"', '  File "/unit-data/other.py"') +
      '  File "/unit-data/oracle.py", line 232, in test_protected\nRan 1 test in 0.1s\nFAILED (failures=1)\n',
  ]) assert.throws(() => parseContentPython(invalid, python, true));
});

/** @id TEST-RELQ-PH-001 @verifies REQ-RELQ-003, REQ-RELQ-005 */
test('TEST-RELQ-PH-001 binds all 14 cases to exact native assertions and policy witnesses', async t => {
  const directory = workspace(t);
  const catalogue = contentCaseCatalogue(contentReference, 'PLACEHOLDER-MUTATION');
  assert.equal(catalogue.length, 14, 'all placeholder mechanisms are mandatory');
  assert.deepEqual(catalogue.map(row => row.id), contentReference.placeholderCatalogue.map(row => row.proposedId));
  const context = contentContext(directory, 'PLACEHOLDER-MUTATION'), target = catalogue[0];
  const plan = buildContentCasePlan(context, target), row = await runContentCase(context, target);
  assert.equal(row.status, 'PASS');
  assert.doesNotThrow(() => validateContentCase({ row, target, plan, reference: contentReference }));
  for (const change of [
    error => { error.code = 'ERR_MODULE_NOT_FOUND'; },
    error => { error.name = 'TypeError'; },
    error => { error.stack = error.stack.replaceAll(plan.assertionSource, '/impersonator' + plan.assertionSource); },
    error => { error.stack = `AssertionError: ${plan.assertionSource}:151:1`; },
    error => { error.stack = 'AssertionError: production throw\n    at production (/unit/production.mjs:1:1)\n' + error.stack; },
    error => {
      error.message += `\n    at ${plan.assertionSource}:${plan.assertionLines[0]}:1`;
      error.stack = `AssertionError [ERR_ASSERTION]: ${error.message}\n    at production (/unit/production.mjs:1:1)`;
    },
    error => { error.message = '[["unrelated TODO",1]]'; },
    (error, events) => {
      events.find(event => event.type === 'test:fail').data.skip = 'required skip';
      for (const event of events) {
        if (event.type === 'test:diagnostic' && event.data.message === 'fail 1') event.data.message = 'fail 0';
        if (event.type === 'test:diagnostic' && event.data.message === 'skipped 0') event.data.message = 'skipped 1';
        if (event.type === 'test:summary' && !event.data.file) {
          event.data.counts.failed = 0; event.data.counts.skipped = 1; event.data.success = true;
        }
      }
    },
  ]) {
    const invalid = clone(row);
    const events = fs.readFileSync(invalid.mutant.stdout.path, 'utf8').trim().split('\n').map(JSON.parse);
    const failed = events.find(event => event.type === 'test:fail');
    let error = failed.data.details.error;
    while (error.cause && error.code !== 'ERR_ASSERTION') error = error.cause;
    change(error, events);
    invalid.mutant.stdout = retained(directory, `altered-${randomUUID()}.events`, events.map(event => JSON.stringify(event)).join('\n') + '\n');
    const record = { ...invalid.mutant }; delete record.receipt;
    invalid.mutant.receipt = retained(directory, `altered-${randomUUID()}.json`, JSON.stringify(record));
    assert.throws(() => validateContentCase({ row: invalid, target, plan, reference: contentReference }));
  }
  const wrong = clone(target); wrong.oracle.expectedAssertionLines = [0];
  assert.throws(() => validateContentCase({ row, target: wrong, plan, reference: contentReference }));
});

function scopeFixture(directory) {
  const source = path.join(directory, 'source');
  for (const relative of Object.keys(genuineLock.artifacts)) {
    write(path.join(source, relative), fs.readFileSync(path.join(root, relative), 'utf8'));
  }
  write(path.join(source, inheritedRelative), fs.readFileSync(path.join(root, inheritedRelative), 'utf8'));
  write(path.join(source, approvalsRelative), { 'release-qualification': clone(genuineLock) });
  return {
    root: source,
    planPath: path.join(source, planRelative),
    inheritedPath: path.join(source, inheritedRelative),
    approvalsPath: path.join(source, approvalsRelative),
  };
}

// Synthetic lock consistency tests do not attest a human identity or grant authorization.
function relockFixture(scope) {
  const approvals = read(scope.approvalsPath);
  for (const relative of Object.keys(approvals['release-qualification'].artifacts)) {
    approvals['release-qualification'].artifacts[relative] = fileDigest(path.join(scope.root, relative));
  }
  write(scope.approvalsPath, approvals);
}

async function pass(promise, message) {
  const result = await promise;
  assert.equal(result.status, 'PASS', message);
  return result;
}

async function reject(promise, message) {
  const result = await promise;
  assert.notEqual(result.status, 'PASS', message);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, `${message}: explain rejection`);
  return result;
}

function currentLiteralRegressionNames() {
  const directories = [path.join(root, 'scripts'), path.join(root, '.github/skills/lean-sdd-tdd/scripts')];
  return [...new Set(directories.flatMap(directory =>
    fs.readdirSync(directory).filter(name => name.endsWith('.test.mjs')).flatMap(name =>
      [...fs.readFileSync(path.join(directory, name), 'utf8')
        .matchAll(/(?:^|\n)test\('([^'\n]+)'/g)].map(match => match[1]))))];
}

function frozenCatalogues() {
  return {
    regressions: [...new Set([...inherited.catalogue, ...currentLiteralRegressionNames()])],
    oracles: clone(inherited.oracleCatalogue),
    mutations: clone(inherited.mutationCatalogue),
    diagnosticMutations: clone(inherited.diagnosticMutationCatalogue),
    hostMutations: clone(inherited.hostMutationCatalogue),
    watchdog: clone(inherited.watchdogCatalogue),
    scope: clone(inherited.scopeCatalogue),
    excludedTodos: clone(inherited.excludedTodoNames),
  };
}

function freezeFixture(directory) {
  const scope = scopeFixture(directory);
  const kinds = ['source', 'archive', 'package', 'helper', 'dependencies', 'configuration', 'environment'];
  const files = kinds.map(kind => ({
    kind, path: write(path.join(scope.root, 'inputs', `${kind}.fixture`), `fixture bytes: ${kind}\n`),
  }));
  const versions = { node20: 'v20.20.2', node22: 'v22.23.3', node24: 'v24.22.1' };
  const nativeIds = inherited.nativeEnvironment.tools.map(tool => tool.command);
  const tools = [...Object.keys(versions), ...nativeIds].map(id => ({
    id,
    executable: write(path.join(directory, 'tools', `${id.replaceAll('+', 'p')}.fixture`), `tool fixture ${id}\n`),
    versionArgs: ['--version'],
    expectedVersion: versions[id] || `${id} fixture-version`,
  }));
  // Only process execution is injected: file hashing, rechecks and manifest writes are real.
  const effects = {
    probeTool: async tool => ({
      command: [tool.executable, ...tool.versionArgs], exit: 0, signal: null,
      stdout: tool.expectedVersion + '\n', stderr: '', timedOut: false,
    }),
  };
  const request = {
    ...scope, files, tools,
    outputPath: path.join(directory, 'external', 'manifest.json'),
    catalogues: frozenCatalogues(),
    registeredNames: currentLiteralRegressionNames(),
    commands: required.map(cell => ({
      cellId: cell.id, argv: ['node', 'fixture-cell.mjs', cell.id], timeoutSeconds: cell.timeoutSeconds,
    })),
    environment: { platform: 'linux', arch: 'x64', canonicalPath: '/fixture/tools:/usr/bin:/bin' },
  };
  return { request, effects };
}

function tap(name, { failed = false, skip = false, todo = false, file = '/fixture/owned.test.mjs',
  assertion = 'owned expectation', line = 12 } = {}) {
  return `TAP version 13\n# Subtest: ${name}\n${failed ? 'not ok' : 'ok'} 1 - ${name}` +
    `${skip ? ' # SKIP selected' : todo ? ' # TODO selected' : ''}\n` +
    (failed ? `  ---\n  failureType: 'testCodeFailure'\n  error: '${assertion}'\n` +
      `  code: 'ERR_ASSERTION'\n  name: 'AssertionError'\n  stack: |-\n` +
      `    TestContext.<anonymous> (${file}:${line}:3)\n  ...\n` : '') +
    `1..1\n# tests 1\n# suites 0\n# pass ${failed || skip || todo ? 0 : 1}\n` +
    `# fail ${failed ? 1 : 0}\n# cancelled 0\n# skipped ${skip ? 1 : 0}\n# todo ${todo ? 1 : 0}\n`;
}

function retained(directory, name, text) {
  const file = write(path.join(directory, name), text);
  return { path: file, sha256: fileDigest(file) };
}

function cellFixture(directory) {
  const name = 'TEST-RELQ-FIXTURE named target';
  return {
    cell: { id: 'REGRESSION-24', runtime: '24', kind: 'suite', timeoutSeconds: 12000 },
    catalogue: [{ name }],
    evidence: {
      format: 'tap', command: ['node', '--test', '/fixture/owned.test.mjs'],
      exit: 0, signal: null, timedOut: false,
      stdout: retained(directory, 'stdout.tap', tap(name)),
      stderr: retained(directory, 'stderr.log', ''),
    },
  };
}

function hostFixture(directory) {
  const catalogue = inherited.hostMutationCatalogue.map((name, index) => ({
    name, test: `TEST-HOST-FIXTURE-${index}`, file: `/fixture/host-${index}.test.mjs`,
    expectedAssertion: `owned ${name}`, assertionLines: [12],
  }));
  const cases = catalogue.map(target => {
    const control = stage => {
      const failed = stage === 'mutant';
      const log = retained(directory, `${target.name}-${stage}.tap`,
        tap(target.test, { failed, file: target.file, assertion: target.expectedAssertion }));
      return {
        status: failed ? 1 : 0, assertion: failed, signal: null,
        counts: { tests: 1, pass: failed ? 0 : 1, fail: failed ? 1 : 0, cancelled: 0, skipped: 0, todo: 0 },
        log: log.path, logSha256: log.sha256,
      };
    };
    return { name: target.name, test: target.test, file: target.file,
      baseline: control('baseline'), mutant: control('mutant'), restored: control('restored') };
  });
  return {
    cell: required.find(cell => cell.id === 'HOST-MUTATION'), catalogue,
    evidence: {
      format: 'host-mutation', command: ['node', 'scripts/release-host-mutations.mjs'],
      exit: 0, signal: null, timedOut: false,
      stdout: retained(directory, 'host.json', JSON.stringify({ status: 'PASS', cases })),
      stderr: retained(directory, 'host-stderr.log', ''),
    },
  };
}

function rewriteHost(request, mutate) {
  const copy = clone(request);
  const data = read(copy.evidence.stdout.path);
  mutate(data);
  copy.evidence.stdout = retained(path.dirname(copy.evidence.stdout.path), `corrupt-${randomUUID()}.json`,
    JSON.stringify(data));
  return copy;
}

function runFixture(directory, index, status = 'PASS', manifestSha256 = digest('manifest-A')) {
  const binding = readinessBindings.get(directory);
  if (binding && manifestSha256 === digest('manifest-A')) manifestSha256 = binding.manifestSha256;
  const cells = required.map(cell => {
    const evidence = cellFixture(path.join(directory, `run-${index}`, cell.id));
    evidence.cell = cell;
    return { id: cell.id, ...evidence };
  });
  return {
    id: `run-${index}`, status, manifestSha256, candidateSha256: binding?.manifest.candidateSha256 || digest('candidate-A'),
    beforeInputsSha256: binding?.manifest.inputsSha256 || digest('inputs-A'),
    afterInputsSha256: binding?.manifest.inputsSha256 || digest('inputs-A'),
    cells,
    state: {
      sourceRoots: required.map(cell => path.join(directory, `run-${index}`, cell.id, 'source')),
      homeRoots: required.map(cell => path.join(directory, `run-${index}`, cell.id, 'home')),
      cacheRoots: required.map(cell => path.join(directory, `run-${index}`, cell.id, 'cache')),
    },
  };
}

const readinessBindings = new Map();
async function initializeReadiness(directory) {
  const fixture = freezeFixture(path.join(directory, 'readiness-lock'));
  fixture.request.cellCatalogues = Object.fromEntries(required.map(cell =>
    [cell.id, [{ name: 'TEST-RELQ-FIXTURE named target' }]]));
  const frozen = await pass(freezeCandidate(fixture.request, fixture.effects), 'frozen readiness fixture');
  readinessBindings.set(directory, { ...frozen, effects: fixture.effects });
}
async function evaluateReadiness(request) {
  const binding = [...readinessBindings.values()].find(row => row.manifestPath === request.manifestPath);
  assert.ok(binding, 'explicit test-only probe binding required');
  const { history, ...input } = request;
  return evaluateReadinessApi(input, { ...binding.effects,
    ...(history === undefined ? {} : { readHistory: () => history.map(run => ({ run })) }) });
}
function readinessFixture(directory, history = []) {
  const binding = readinessBindings.get(directory);
  assert.ok(binding, 'initialize the real retained manifest fixture before use');
  return {
    manifest: { ...binding.manifest, sha256: binding.manifestSha256 },
    manifestPath: binding.manifestPath, manifestSha256: binding.manifestSha256,
    history, findings: [],
    historyPath: path.join(directory, 'history.jsonl'),
  };
}

/** @id TEST-RELQ-001 @verifies REQ-RELQ-001 */
test('TEST-RELQ-001 admits the locked Linux plan and enumerates every cell-policy violation', async t => {
  const scope = scopeFixture(workspace(t));
  await pass(admitPlan(scope), 'the complete genuinely locked 24-cell Linux plan must be admitted');
  const baseline = read(scope.planPath);
  const changes = [];
  for (const cell of required) {
    changes.push([`missing ${cell.id}`, p => { p.requiredCells = p.requiredCells.filter(c => c.id !== cell.id); }]);
    changes.push([`duplicate ${cell.id}`, p => { p.requiredCells.push(clone(cell)); }]);
    for (const key of ['runtime', 'kind', ...(cell.mode ? ['mode'] : [])]) {
      changes.push([`changed ${cell.id}.${key}`, p => { p.requiredCells.find(c => c.id === cell.id)[key] = 'unknown'; }]);
    }
    for (const delta of [-1, 1]) {
      changes.push([`changed ${cell.id} budget ${delta}`, p => {
        p.requiredCells.find(c => c.id === cell.id).timeoutSeconds += delta;
      }]);
    }
  }
  changes.push(
    ['missing WSL exclusion', p => { p.excludedCells = []; }],
    ['WSL falsely passed', p => { p.excludedCells[0].status = 'PASS'; }],
    ['WSL made required', p => { p.requiredCells.push(clone(p.excludedCells[0])); }],
    ['unknown required cell', p => { p.requiredCells.push({ ...p.requiredCells[0], id: 'UNKNOWN' }); }],
    ['one clean run', p => { p.requiredCleanRuns = 1; }],
    ['old credit', p => { p.priorQualificationCredit = 1; }],
    ['skip accepted', p => { p.requiredMissingOrSkippedIsNotPass = false; }],
    ['publish flag', p => { p.publishingAuthorized = true; }],
  );
  for (const [label, change] of changes) {
    const plan = clone(baseline);
    change(plan);
    write(scope.planPath, plan);
    relockFixture(scope);
    await reject(admitPlan(scope), label);
  }
  write(scope.planPath, fs.readFileSync(path.join(root, planRelative), 'utf8'));
  write(scope.approvalsPath, { 'release-qualification': clone(genuineLock) });
  for (const relative of Object.keys(genuineLock.artifacts)) {
    const file = path.join(scope.root, relative);
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    await reject(admitPlan(scope), `stale approval for ${relative}`);
    fs.writeFileSync(file, bytes);
  }
  for (const lock of [undefined, { ...genuineLock, kind: 'ai' }, { ...genuineLock, artifacts: {} }]) {
    write(scope.approvalsPath, lock ? { 'release-qualification': lock } : {});
    await reject(admitPlan(scope), 'plan declarations are not current human artifact locks');
  }
  write(scope.approvalsPath, { 'release-qualification': clone(genuineLock) });
  await pass(admitPlan(scope), 'restored genuine approval remains valid');
});

/** @id TEST-RELQ-002 @verifies REQ-RELQ-002 */
test('TEST-RELQ-002 freezes external current inputs and detects bounded byte, probe and catalogue drift', async t => {
  const directory = workspace(t);
  const { request, effects } = freezeFixture(directory);
  const frozen = await pass(freezeCandidate(request, effects),
    'available stable inputs and all inherited named mechanisms must freeze externally');
  const manifestBytes = fs.readFileSync(request.outputPath);
  assert.equal(frozen.manifestSha256, digest(manifestBytes), 'report the actual retained manifest hash');
  const manifest = read(request.outputPath);
  assert.equal(manifest.planSha256, fileDigest(request.planPath));
  assert.deepEqual(manifest.catalogues, request.catalogues, 'preserve named intents and literal mutation contracts');
  assert.ok(!manifest.files.some(file => file.path === request.outputPath), 'no self-reference');
  const checkedInput = { manifestPath: request.outputPath, manifestSha256: frozen.manifestSha256 };
  await pass(checkFrozenCandidate(checkedInput, effects), 'identical input control');
  for (const file of [...request.files, ...request.tools.map(tool => ({ path: tool.executable }))]) {
    const bytes = fs.readFileSync(file.path);
    fs.appendFileSync(file.path, 'changed byte');
    await reject(checkFrozenCandidate(checkedInput, effects), `changed ${file.path}`);
    fs.writeFileSync(file.path, bytes);
    fs.renameSync(file.path, file.path + '.unavailable');
    await reject(checkFrozenCandidate(checkedInput, effects), `missing ${file.path}`);
    fs.renameSync(file.path + '.unavailable', file.path);
    await pass(checkFrozenCandidate(checkedInput, effects), 'restored exact bytes');
  }
  for (const failedProbe of [
    { exit: 17 }, { signal: 'SIGTERM' }, { timedOut: true }, { stdout: 'unparseable version' },
    { stdout: 'v18.0.0\n' },
  ]) {
    const changed = { probeTool: async tool => ({ ...await effects.probeTool(tool), ...failedProbe }) };
    await reject(checkFrozenCandidate(checkedInput, changed), 'changed or unavailable real probe');
  }
  const variants = [
    ['missing Node22', r => { r.tools = r.tools.filter(tool => tool.id !== 'node22'); }],
    ['internal output', r => { r.outputPath = path.join(r.root, 'manifest.json'); }],
    ['missing source kind', r => { r.files = r.files.filter(file => file.kind !== 'source'); }],
    ['missing regression', r => { r.catalogues.regressions.shift(); }],
    ['missing current test', r => { r.catalogues.regressions.pop(); }],
    ['missing oracle', r => { r.catalogues.oracles.shift(); }],
    ['weakened literal mutation', r => { r.catalogues.mutations.mutations[0].edits[0].after = 'different'; }],
    ['missing mandatory mutation', r => { r.catalogues.mutations.mandatoryIds.pop(); }],
    ['missing diagnostic mutant', r => { r.catalogues.diagnosticMutations.pop(); }],
    ['missing host mutant', r => { r.catalogues.hostMutations.pop(); }],
    ['missing watchdog case', r => { r.catalogues.watchdog.pop(); }],
    ['missing scope case', r => { r.catalogues.scope.pop(); }],
    ['invented TODO exclusion', r => { r.catalogues.excludedTodos.push('an undiscovered TODO'); }],
    ['missing command', r => { r.commands.pop(); }],
    ['weakened command budget', r => { r.commands[0].timeoutSeconds--; }],
  ];
  for (const [label, change] of variants) {
    const variant = clone(request);
    variant.outputPath = path.join(directory, 'external', `${randomUUID()}.json`);
    change(variant);
    await reject(freezeCandidate(variant, effects), label);
  }
  const revision = clone(request);
  revision.outputPath = path.join(directory, 'external', 'revision-2.json');
  revision.previousManifestPath = request.outputPath;
  revision.revisionReason = 'fixture helper bytes changed; previous validation credit resets';
  fs.appendFileSync(request.files.find(file => file.kind === 'helper').path, 'new revision');
  await pass(freezeCandidate(revision, effects), 'new revision is retained without modifying the previous manifest');
  assert.deepEqual(fs.readFileSync(request.outputPath), manifestBytes, 'failed/obsolete manifest history is immutable');
  assert.equal(read(revision.outputPath).previousManifestSha256, digest(manifestBytes));
  assert.equal(read(revision.outputPath).consecutiveCompleteCleanRuns, 0);
  const tree = clone(request);
  tree.outputPath = path.join(directory, 'external', 'tree-manifest.json');
  const source = path.join(directory, 'candidate-tree');
  write(path.join(source, 'a.mjs'), 'export const a = 1;\n');
  tree.files.find(file => file.kind === 'source').path = source;
  const frozenTree = await pass(freezeCandidate(tree, effects), 'real directory candidate can be frozen');
  assert.match(frozenTree.manifest.candidateSha256 || '', /^[a-f0-9]{64}$/,
    'a real source tree requires a concrete candidate digest');
  const alias = path.join(directory, 'source-alias');
  fs.symlinkSync(request.root, alias, 'dir');
  const { preflight, nativeToolProbes, preparationEnvironment } = await import('./release-qualification-cli.mjs');
  const probes = nativeToolProbes(inherited);
  assert.deepEqual(probes.find(probe => probe.command === 'bash').args, ['--version'],
    'excluded historical WSL source commands must never become native Linux probes');
  for (const probe of probes.filter(probe => probe.command !== 'bash')) {
    assert.deepEqual(probe.args, inherited.nativeEnvironment.tools.find(row => row.command === probe.command).args);
  }
  const runtime = { major: 20, executable: '/runtimes/20/bin/node' };
  const privateRoot = path.join(directory, 'preparation');
  const prepared = preparationEnvironment({ source: request.root, workRoot: privateRoot, runtimes: [runtime],
    basePath: ['/usr/bin'], environment: { HOME: path.join(directory, 'inherited-home'),
      npm_config_userconfig: '/inherited-credential-configuration' } }, runtime, 'probe');
  assert.equal(prepared.variables.HOME, path.join(privateRoot, 'probe-home'),
    'preparation probes must not inherit a credential-bearing user HOME');
  assert.equal(fs.readFileSync(prepared.variables.npm_config_userconfig, 'utf8'), '');
  assert.equal(fs.readFileSync(prepared.variables.GIT_CONFIG_GLOBAL, 'utf8'), '');
  assert.equal(prepared.variables.GIT_CONFIG_NOSYSTEM, '1');
  await reject(preflight({ source: request.root, workRoot: path.join(alias, 'side-effects'),
    runtimes: [], environment: {}, basePath: ['/usr/bin'], tools: {} }), 'source-aliased output must fail');
  assert.equal(fs.existsSync(path.join(request.root, 'side-effects')), false,
    'preflight must reject aliased source output before creating it');
});

async function legacyDiagnosticFixture(directory, quoted = false,
  message = 'Cannot find module child; SyntaxError: quoted; ERR_MODULE_NOT_FOUND; MODULE_NOT_FOUND; Traceback (most recent call last)') {
  const { assertionCatalogue } = await import('./release-qualification-cells.mjs');
  const source = path.join(directory, 'source'), title = 'native legacy diagnostic control';
  write(path.join(source, 'scripts/release-host-events.mjs'),
    fs.readFileSync(path.join(root, 'scripts/release-host-events.mjs'), 'utf8'));
  write(path.join(source, 'job.txt'), 'run: npm ci\n');
  const assertion = quoted
    ? `assert.equal(value, "run: npm ci\\n", ${JSON.stringify(message)})`
    : 'assert.match(value, /npm ci/)';
  write(path.join(source, 'owned.test.mjs'),
    "import assert from 'node:assert/strict';import fs from 'node:fs';import {test} from 'node:test';\n" +
    `test('${title}',()=>{const value=fs.readFileSync(new URL('./job.txt',import.meta.url),'utf8');${assertion};});\n`);
  const target = {
    name: 'legacy-diagnostic', targetName: title, suite: 'owned.test.mjs',
    files: ['job.txt'], edits: [{ file: 'job.txt', before: 'run: npm ci', after: 'run: npm --version', count: 1 }],
    expectedReason: quoted ? 'Cannot find module child' : inherited.mutationCatalogue.mutations
      .find(row => row.id === 'publish-restore').expectedReason,
    ...assertionCatalogue(source, 'owned.test.mjs', title, assertion, path.join(root, 'node_modules')),
  };
  return { source, output: path.join(directory, 'adapter'), node: process.execPath,
    cell: { id: 'MUTATION', kind: 'mutation', timeoutSeconds: 30 }, catalogue: [target],
    environment: { PATH: process.env.PATH, TMPDIR: directory, NO_COLOR: '1' } };
}

function mutationResultEvidence(directory, result) {
  const evidence = cellFixture(directory).evidence;
  evidence.stdout = retained(directory, `adapter-${randomUUID()}.json`, JSON.stringify(result));
  return evidence;
}

/** @id TEST-RELQ-DIAGNOSTIC-001 @verifies REQ-RELQ-003 */
test('TEST-RELQ-DIAGNOSTIC-001 binds generated match diagnostics to the frozen literal and owned frame', async t => {
  const directory = workspace(t);
  const context = await legacyDiagnosticFixture(directory);
  const target = context.catalogue[0];
  const prefix = 'The input did not match the regular expression /npm ci/. Input:\n';
  assert.deepEqual(target.assertionDiagnostics, [{ line: 2, kind: 'match', messagePrefix: prefix }],
    'freeze the native diagnostic from the independent regex literal, not the historical word heuristic');
  const { runAdapter, assertionCatalogue } = await import('./release-qualification-cells.mjs');
  const { validateMutationRows } = await import('./release-qualification-evidence.mjs');
  const result = await runAdapter(context);
  assert.equal(result.cases.length, 1);
  const input = { evidence: mutationResultEvidence(directory, result), catalogue: context.catalogue,
    adapterOutput: context.output };
  assert.doesNotThrow(() => validateMutationRows(input), 'valid native baseline/mutant/restored controls must pass');
  for (const change of [
    row => { row.assertionDiagnostics[0].messagePrefix = prefix.replace('/npm ci/', '/npm test/'); },
    row => { row.assertionDiagnostics[0].line++; },
    row => { delete row.assertionDiagnostics; },
  ]) {
    const catalogue = clone(context.catalogue);
    catalogue[0].expectedReason = 'The input';
    change(catalogue[0]);
    assert.throws(() => validateMutationRows({ ...input, catalogue }),
      'a broad legacy match cannot rescue incorrect or missing frozen diagnostic metadata');
  }
  const file = path.join(context.source, target.suite);
  const original = fs.readFileSync(file, 'utf8');
  for (const assertion of ['assert.match(value, /npm ci/, value)', 'assert.match(value, expected)']) {
    fs.writeFileSync(file, original.replace('assert.match(value, /npm ci/)', assertion));
    const catalogue = assertionCatalogue(context.source, target.suite, target.targetName, assertion,
      path.join(root, 'node_modules'));
    assert.deepEqual(catalogue.assertionDiagnostics, [{ line: 2, kind: 'legacy' }],
      'custom-message and nonliteral-regex assertions retain their existing diagnostic rule');
  }
  fs.writeFileSync(file, original.replace('/npm ci/', '/npm ci/mi'));
  const canonical = assertionCatalogue(context.source, target.suite, target.targetName, undefined,
    path.join(root, 'node_modules'));
  assert.deepEqual(canonical.assertionDiagnostics,
    [{ line: 2, kind: 'match', messagePrefix: prefix.replace('/npm ci/', '/npm ci/im') }],
    'native RegExp inspection uses canonical flag order rather than source spelling');
  fs.writeFileSync(file, original.replace('assert.match(value, /npm ci/)',
    'assert.equal(value, "a");assert.equal(value, "b")'));
  let shared;
  assert.doesNotThrow(() => { shared = assertionCatalogue(context.source, target.suite, target.targetName,
    'assert.equal(value, "a")', path.join(root, 'node_modules')); },
  'same-line assertions with the identical legacy diagnostic rule preserve the existing ownership boundary');
  assert.deepEqual(shared.assertionDiagnostics, [{ line: 2, kind: 'legacy' }]);
  fs.writeFileSync(file, original.replace('assert.match(value, /npm ci/)',
    'assert.match(value, /npm ci/);assert.match(value, /npm test/)'));
  assert.throws(() => assertionCatalogue(context.source, target.suite, target.targetName, undefined,
    path.join(root, 'node_modules')), 'different diagnostic rules at one throwing line are ambiguous');
});

/** @id TEST-RELQ-DIAGBOUNDARY-001 @verifies REQ-RELQ-003 */
test('TEST-RELQ-DIAGBOUNDARY-001 keeps diagnostic mutation ownership separate from legacy message policy', async t => {
  const { cellCatalogue, runAdapter } = await import('./release-qualification-cells.mjs');
  const { validateMutationRows, parseNative } = await import('./release-qualification-evidence.mjs');
  const directory = workspace(t);
  const source = path.join(directory, 'source');
  const scripts = '.github/skills/lean-sdd-tdd/scripts';
  const title = 'TEST-DIAG-BOUNDARY owned native argument type';
  write(path.join(source, 'scripts/release-host-events.mjs'),
    fs.readFileSync(path.join(root, 'scripts/release-host-events.mjs'), 'utf8'));
  write(path.join(source, scripts, 'diagnostics.test.mjs'),
    "import assert from 'node:assert/strict';import fs from 'node:fs';import {test} from 'node:test';\n" +
    `test('${title}',()=>{const value=JSON.parse(fs.readFileSync(new URL('./value.json',import.meta.url),'utf8'));assert.match(value, /good/);});\n`);
  write(path.join(source, scripts, 'diagnostics-profiles.test.mjs'), '');
  write(path.join(source, scripts, 'value.json'), '"good"');
  const manifest = { catalogues: { diagnosticMutations: [
    ['null-input', 'value.json', '"good"', 'null', 'TEST-DIAG-BOUNDARY'],
  ] }, execution: { nodeModules: path.join(root, 'node_modules') } };
  const cell = { id: 'DIAGNOSTIC-MUTATION', kind: 'diagnostic-mutation', timeoutSeconds: 30 };
  const catalogue = cellCatalogue(manifest, cell, source);
  assert.deepEqual(catalogue[0].assertionDiagnostics, [{ line: 2, kind: 'legacy' }],
    'the diagnostic catalogue freezes owned lines without importing the legacy-only mismatch prefix');
  const context = { source, output: path.join(directory, 'adapter'), node: process.execPath,
    cell, catalogue, environment: { PATH: process.env.PATH, TMPDIR: directory, NO_COLOR: '1' } };
  const result = await runAdapter(context);
  const native = parseNative(processIo.readRef(result.cases[0].mutant.stdout));
  assert.match(native.rows.find(row => row.name === title).error.message, /argument must be of type string/);
  const input = { evidence: mutationResultEvidence(directory, result), catalogue, adapterOutput: context.output };
  assert.doesNotThrow(() => validateMutationRows(input), 'owned null-input assertion and valid controls pass');
  const strict = clone(catalogue);
  strict[0].assertionDiagnostics = [{ line: 2, kind: 'match',
    messagePrefix: 'The input did not match the regular expression /good/. Input:\n' }];
  assert.throws(() => validateMutationRows({ ...input, catalogue: strict }),
    'the same native argument-type error cannot satisfy a legacy mismatch-prefix requirement');
  for (const change of [
    copy => { delete copy.cases[0].baseline; },
    copy => { delete copy.cases[0].restored; },
    copy => { copy.cases[0].mutant = copy.cases[0].baseline; },
  ]) {
    const invalid = clone(result);
    change(invalid);
    assert.throws(() => validateMutationRows({ ...input, evidence: mutationResultEvidence(directory, invalid) }),
      'missing controls and surviving mutants remain invalid');
  }
  const events = JSON.parse('[' + processIo.readRef(result.cases[0].mutant.stdout).trim().split('\n').join(',') + ']');
  for (const change of [
    error => { error.code = 'ERR_MODULE_NOT_FOUND'; error.name = 'Error'; },
    error => { error.stack = error.stack.replace(result.cases[0].sourceTest, '/foreign/diagnostics.test.mjs'); },
  ]) {
    const altered = clone(events);
    change(altered.find(row => row.type === 'test:fail').data.details.error.cause);
    const invalid = clone(result);
    invalid.cases[0].mutant.stdout = retained(directory, `foreign-${randomUUID()}.jsonl`,
      altered.map(row => JSON.stringify(row)).join('\n') + '\n');
    delete invalid.cases[0].mutant.receipt;
    assert.throws(() => validateMutationRows({ ...input, evidence: mutationResultEvidence(directory, invalid) }),
      'native loader failures and foreign throwing frames remain invalid');
  }
  const missing = clone(catalogue);
  delete missing[0].assertionDiagnostics;
  assert.throws(() => validateMutationRows({ ...input, catalogue: missing }), 'diagnostic metadata remains mandatory');
});

/** @id TEST-RELQ-SCANNER-001 @verifies REQ-RELQ-003 */
test('TEST-RELQ-SCANNER-001 binds only the two approved scanner prefixes and rejects invalid overrides', async t => {
  const { cellCatalogue, runAdapter } = await import('./release-qualification-cells.mjs');
  const { validateMutationRows } = await import('./release-qualification-evidence.mjs');
  const directory = workspace(t);
  const manifest = { catalogues: { mutations: inherited.mutationCatalogue },
    execution: { nodeModules: path.join(root, 'node_modules') } };
  const catalogue = cellCatalogue(manifest, { kind: 'mutation' }, root);
  const overrides = approvedPlan.legacyMutationDiagnosticPolicy.customMessageOverrides;
  for (const override of overrides) {
    const row = catalogue.find(row => row.name === override.id);
    assert.deepEqual(row.assertionDiagnostics, row.assertionLines.map(line =>
      ({ line, kind: 'prefix', messagePrefix: override.messagePrefix })));
    const context = await legacyDiagnosticFixture(path.join(directory, override.id), true, override.messagePrefix);
    context.catalogue[0].expectedReason = row.expectedReason;
    context.catalogue[0].assertionDiagnostics = [{ ...row.assertionDiagnostics[0], line: 2 }];
    const result = await runAdapter(context);
    const input = { evidence: mutationResultEvidence(directory, result), catalogue: context.catalogue,
      adapterOutput: context.output };
    assert.doesNotThrow(() => validateMutationRows(input), 'the exact scanner prefix and all native controls pass');
    const invalid = clone(context.catalogue);
    invalid[0].expectedReason = 'TRACE';
    invalid[0].assertionDiagnostics[0].messagePrefix = override.messagePrefix.replace('1 REQ', '2 REQ');
    assert.throws(() => validateMutationRows({ ...input, catalogue: invalid }),
      'wrong independent counts cannot be rescued by the historical regex');
  }
  const source = path.join(directory, 'scope');
  const suite = overrides[0].suite;
  write(path.join(source, suite), fs.readFileSync(path.join(root, suite), 'utf8'));
  const scopedManifest = clone(manifest);
  scopedManifest.catalogues.mutations.mutations = inherited.mutationCatalogue.mutations
    .filter(row => overrides.some(override => override.id === row.id));
  const scopePlan = clone(approvedPlan);
  write(path.join(source, planRelative), scopePlan);
  assert.equal(cellCatalogue(scopedManifest, { kind: 'mutation' }, source).length, 2);
  for (const change of [
    rows => rows.pop(),
    rows => rows.push(clone(rows[0])),
    rows => { rows[0].id = 'foreign-case'; },
    rows => { rows[0].suite = 'foreign.test.mjs'; },
    rows => { rows[0].expectedAssertion = 'assert.equal(valid.code, 9,'; },
  ]) {
    const plan = clone(scopePlan);
    change(plan.legacyMutationDiagnosticPolicy.customMessageOverrides);
    write(path.join(source, planRelative), plan);
    assert.throws(() => cellCatalogue(scopedManifest, { kind: 'mutation' }, source),
      'missing, duplicate, foreign or mismatched override must fail rather than fall back');
  }
});

/** @id TEST-RELQ-QUOTED-001 @verifies REQ-RELQ-003 */
test('TEST-RELQ-QUOTED-001 accepts owned quoted setup text but rejects actual setup and foreign failures', async t => {
  const directory = workspace(t);
  const context = await legacyDiagnosticFixture(directory, true);
  const { runAdapter } = await import('./release-qualification-cells.mjs');
  const { validateMutationRows, processControl, parseEvents } = await import('./release-qualification-evidence.mjs');
  let result;
  await assert.doesNotReject(async () => { result = await runAdapter(context); },
    'quoted loader/provider examples inside the expected owned native assertion are diagnostic data');
  const input = { evidence: mutationResultEvidence(directory, result), catalogue: context.catalogue,
    adapterOutput: context.output };
  assert.doesNotThrow(() => validateMutationRows(input));
  const receipt = result.cases[0].mutant;
  const target = { ...context.catalogue[0], sourceTest: result.cases[0].sourceTest };
  assert.doesNotThrow(() => processControl(receipt, 1, target));
  assert.throws(() => processControl(receipt, 1), 'no caller-controlled flag bypasses native ownership verification');
  const events = JSON.parse('[' + processIo.readRef(receipt.stdout).trim().split('\n').join(',') + ']');
  for (const change of [
    error => { error.cause.code = 'ERR_MODULE_NOT_FOUND'; error.cause.name = 'Error'; },
    error => { error.cause.stack = error.cause.stack.replace(target.sourceTest, '/foreign/owned.test.mjs'); },
    error => { error.cause = { name: 'TypeError', code: 'ERR_OTHER', message: 'Cannot find module child',
      stack: 'TypeError: Cannot find module child\n    at /foreign/loader.mjs:1:1', cause: error.cause }; },
  ]) {
    const altered = clone(events);
    const failure = altered.find(row => row.type === 'test:fail').data.details.error;
    change(failure);
    const copy = { ...receipt, stdout: retained(directory, `negative-${randomUUID()}.jsonl`,
      altered.map(row => JSON.stringify(row)).join('\n') + '\n') };
    delete copy.receipt;
    assert.throws(() => processControl(copy, 1, target), 'setup/foreign errors cannot borrow an owned assertion cause');
    const parsed = parseEvents(processIo.readRef(copy.stdout));
    assert.ok(parsed.rows[0].failed);
  }
  const stderr = { ...receipt, stderr: retained(directory, 'real-setup-stderr.log', 'SyntaxError: actual loader failure\n') };
  delete stderr.receipt;
  assert.throws(() => processControl(stderr, 1, target), 'real setup stderr is never exempted by quoted stdout');
  const incomplete = clone(result);
  delete incomplete.cases[0].restored;
  assert.throws(() => validateMutationRows({ ...input, evidence: mutationResultEvidence(directory, incomplete) }),
    'a killed mutant without restored controls is not a pass');
});

/** @id TEST-RELQ-003 @verifies REQ-RELQ-003 */
test('TEST-RELQ-003 requires named retained outcomes and all owned host mutation controls', async t => {
  const directory = workspace(t);
  const request = cellFixture(path.join(directory, 'tap'));
  await pass(validateCellEvidence(request), 'a named executed positive control with retained TAP must pass');
  const nativeCounts = { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  const events = [
    { type: 'test:pass', data: { name: request.catalogue[0].name, nesting: 0, details: {} } },
    { type: 'test:plan', data: { nesting: 0, count: 1 } },
    ...Object.entries(nativeCounts).map(([key, value]) => ({
      type: 'test:diagnostic', data: { nesting: 0, message: `${key} ${value}` },
    })),
  ];
  const native = clone(request);
  native.evidence.format = 'events';
  const nativeLog = rows => retained(directory, `native-${randomUUID()}.jsonl`,
    rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  native.evidence.stdout = nativeLog(events);
  await pass(validateCellEvidence(native), 'actual native event counts agree with the named rows');
  for (const key of Object.keys(nativeCounts)) {
    const selected = row => row.data.message?.startsWith(key + ' ');
    for (const corrupt of [
      events.filter(row => !selected(row)),
      [...events, clone(events.find(selected))],
      events.map(row => selected(row) ? { ...row, data: { ...row.data, message: `${key} 99` } } : row),
    ]) {
      native.evidence.stdout = nativeLog(corrupt);
      await reject(validateCellEvidence(native), `missing, duplicate or contradictory native ${key} count`);
    }
  }
  native.evidence.stdout = nativeLog([...events, { type: 'test:summary', data: {
    success: true, counts: { tests: 1, passed: 0, failed: 1, cancelled: 0, skipped: 0, todo: 0 },
  } }]);
  await reject(validateCellEvidence(native), 'Node24 native summary must independently agree');
  const { spawnSync } = await import('node:child_process');
  const todoFile = write(path.join(directory, 'known-todo.test.mjs'),
    'import {test} from "node:test";test.todo("known excluded TODO",()=>{throw new Error("intentional unvalidated TODO")});\n');
  for (const reporter of [path.join(root, 'scripts/release-host-events.mjs'), 'tap']) {
    const todoProcess = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, todoFile], {
      cwd: directory, encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, TMPDIR: directory, NO_COLOR: '1' },
    });
    assert.equal(todoProcess.status, 0);
    const todo = clone(native);
    todo.catalogue = [{ name: 'known excluded TODO' }];
    todo.excludedTodos = ['known excluded TODO'];
    todo.evidence.format = reporter === 'tap' ? 'tap' : 'events';
    todo.evidence.stdout = retained(directory, `native-todo-${randomUUID()}.log`, todoProcess.stdout);
    const todoResult = await pass(validateCellEvidence(todo), 'known excluded TODO retains true native counts, not pass credit');
    assert.equal(todoResult.counts.fail, 0);
    assert.equal(todoResult.counts.pass, 0);
    assert.equal(todoResult.counts.todo, 1);
  }
  const { parseTap, parseEvents, ownedAssertion } = await import('./release-qualification-evidence.mjs');
  for (const owner of ['owned', 'foreign']) {
    for (const diagnostic of ['ordinary', 'frame-like']) {
      const fixture = path.join(directory, `native-${owner}-${diagnostic}`), file = path.join(fixture, 'owned.test.mjs');
      const message = diagnostic === 'ordinary' ? 'ordinary diagnostic' : `literal diagnostic\n    at ${file}:2:1`;
      write(path.join(fixture, 'foreign.mjs'),
        `import assert from 'node:assert/strict';export function foreign(){assert.fail(${JSON.stringify(message)});}\n`);
      write(file, "import assert from 'node:assert/strict';import {test} from 'node:test';import {foreign} from './foreign.mjs';\n" +
        `test('native owned-frame control',()=>${owner === 'owned' ? `assert.fail(${JSON.stringify(message)})` : 'foreign()'});\n`);
      for (const format of ['tap', 'events']) {
        const result = spawnSync(process.execPath, ['--test',
          `--test-reporter=${format === 'tap' ? 'tap' : path.join(root, 'scripts/release-host-events.mjs')}`, file], {
          cwd: directory, encoding: 'utf8', timeout: 30000,
          env: { PATH: process.env.PATH, TMPDIR: directory, NO_COLOR: '1' },
        });
        assert.equal(result.status, 1, 'real native assertion, not a setup failure');
        assert.equal(result.signal, null);
        if (format === 'tap' && diagnostic === 'frame-like') {
          assert.throws(() => parseTap(result.stdout), /ambiguous native TAP assertion stack/);
        } else {
          const parsed = (format === 'tap' ? parseTap : parseEvents)(result.stdout);
          assert.equal(parsed.rows.length, 1);
          assert.equal(ownedAssertion(parsed.rows[0].error, file, [2]), owner === 'owned',
            `${owner}/${diagnostic}/${format}: ownership must come from the throwing frame`);
        }
      }
    }
  }
  const gate = clone(request);
  gate.evidence.format = 'gate';
  gate.evidence.stdout = retained(directory, 'gate-pass.log', 'SDD GATE PASS\n✓ trace: 5 REQ, 0 errors\n');
  await pass(validateCellEvidence(gate), 'the genuine SDD full-gate header must be accepted');
  for (const output of ['GATE PASS\n', 'SDD GATE PASS\nINCOMPLETE\n', 'SDD GATE PASS\n✗ test\n',
    'SDD GATE PASS\nSKIPPED\n', 'SDD GATE FAIL\n']) {
    gate.evidence.stdout = retained(directory, `gate-${randomUUID()}.log`, output);
    await reject(validateCellEvidence(gate), 'unknown, failed or incomplete gate output must be rejected');
  }
  const nonselected = clone(request);
  nonselected.evidence.stdout = retained(directory, 'nonselected.tap',
    `TAP version 13\n# Subtest: ${request.catalogue[0].name}\nok 1 - ${request.catalogue[0].name}\n` +
    '# Subtest: nonselected sibling\nok 2 - nonselected sibling # SKIP test name does not match pattern\n' +
    '1..2\n# tests 2\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n');
  await pass(validateCellEvidence(nonselected), 'explicitly nonselected sibling skips do not erase a selected pass');
  for (const [label, mutate] of [
    ['exit unknown', e => { e.exit = null; }], ['nonzero exit', e => { e.exit = 1; }],
    ['timeout', e => { e.timedOut = true; }], ['signal', e => { e.signal = 'SIGTERM'; }],
    ['no command', e => { e.command = []; }], ['forged log digest', e => { e.stdout.sha256 = digest('forged'); }],
  ]) {
    const copy = clone(request);
    mutate(copy.evidence);
    await reject(validateCellEvidence(copy), label);
  }
  const name = request.catalogue[0].name;
  const invalidLogs = [
    ['file-only pass', 'TAP version 13\nok 1 - /fixture/owned.test.mjs\n1..1\n# tests 1\n# pass 1\n# fail 0\n'],
    ['missing name', tap('unrelated sibling')],
    ['selected skip', tap(name, { skip: true })], ['selected TODO', tap(name, { todo: true })],
    ['zero tests', 'TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0\n'],
    ['missing summaries', `TAP version 13\nok 1 - ${name}\n`],
    ['duplicate target', tap(name) + tap(name)],
    ['unparseable', '{"status":"PASS"}'],
    ['setup failure', `Error [ERR_MODULE_NOT_FOUND]: missing fixture\n${tap(name, { failed: true })}`],
  ];
  for (const [label, log] of invalidLogs) {
    const copy = clone(request);
    copy.evidence.stdout = retained(directory, `${randomUUID()}.tap`, log);
    await reject(validateCellEvidence(copy), label);
  }
  const host = hostFixture(path.join(directory, 'host'));
  await pass(validateCellEvidence(host), 'all 28 host mechanisms with owned baseline/mutant/restored controls');
  const hostChanges = [
    ['missing mechanism', d => { d.cases.pop(); }],
    ['duplicate mechanism', d => { d.cases.push(clone(d.cases[0])); }],
    ['unknown mechanism', d => { d.cases[0].name = 'unknown'; }],
    ['surviving mutant', d => { d.cases[0].mutant = clone(d.cases[0].baseline); }],
    ['no restoration', d => { delete d.cases[0].restored; }],
    ['failed restoration', d => { d.cases[0].restored.status = 1; }],
    ['false baseline', d => { d.cases[0].baseline.counts.tests = 0; }],
    ['forged assertion boolean', d => { d.cases[0].mutant.log = d.cases[0].baseline.log;
      d.cases[0].mutant.logSha256 = d.cases[0].baseline.logSha256; }],
    ['forged log hash', d => { d.cases[0].mutant.logSha256 = digest('forged'); }],
    ['skipped control', d => { d.cases[0].restored.counts.skipped = 1; }],
  ];
  for (const [label, mutate] of hostChanges) await reject(validateCellEvidence(rewriteHost(host, mutate)), label);
  for (const [label, edit] of [
    ['path-suffix impersonation', text => text.replace('/fixture/host-0.test.mjs:12:3', '/other/fixture/host-0.test.mjs:12:3')],
    ['header-only owned location', text => text.replace(
      'TestContext.<anonymous> (/fixture/host-0.test.mjs:12:3)', 'AssertionError at /fixture/host-0.test.mjs:12:3')],
    ['error code/setup mismatch', text => text.replace("name: 'AssertionError'", "name: 'TypeError'")],
  ]) {
    const corrupt = rewriteHost(host, data => {
      const log = retained(directory, `frame-${randomUUID()}.tap`,
        edit(fs.readFileSync(data.cases[0].mutant.log, 'utf8')));
      data.cases[0].mutant.log = log.path;
      data.cases[0].mutant.logSha256 = log.sha256;
    });
    await reject(validateCellEvidence(corrupt), label);
  }
  for (const lines of [[], [0], [-1], [12.5], ['12'], [Number.MAX_SAFE_INTEGER + 1]]) {
    const corrupt = clone(host);
    corrupt.catalogue[0].assertionLines = lines;
    await reject(validateCellEvidence(corrupt), 'malformed independent assertion lines');
  }
  for (const [label, change] of [
    ['wrong target', { name: 'a sibling test' }],
    ['wrong reason', { assertion: 'unrelated assertion' }],
    ['wrong owner', { file: '/fixture/unowned.test.mjs' }],
    ['wrong line', { line: 99 }],
    ['setup exception', { setup: true }],
  ]) {
    const corrupt = rewriteHost(host, data => {
      const target = host.catalogue[0];
      const log = retained(directory, `${randomUUID()}.tap`, change.setup ?
        'Error [ERR_MODULE_NOT_FOUND]: missing dependency\n' :
        tap(change.name || target.test, {
          failed: true, file: target.file, assertion: target.expectedAssertion, ...change,
        }));
      data.cases[0].mutant.log = log.path;
      data.cases[0].mutant.logSha256 = log.sha256;
    });
    await reject(validateCellEvidence(corrupt), label);
  }
  await pass(validateCellEvidence(host), 'unchanged full host positive control remains accepted');
});

/** @id TEST-RELQ-004 @verifies REQ-RELQ-004 */
test('TEST-RELQ-004 enumerates streak resets, fresh per-cell state and immutable failed history', async t => {
  const directory = workspace(t);
  await initializeReadiness(directory);
  const first = runFixture(directory, 1);
  const second = runFixture(directory, 2);
  const clean = readinessFixture(directory, [first, second]);
  const ready = await pass(evaluateReadiness(clean), 'two identical complete fresh runs establish technical readiness');
  assert.equal(ready.streak, 2);
  assert.equal(ready.technicalReady, true);
  assert.equal(ready.publishingAuthorized, false);
  assert.equal(ready.humanReleaseApproved, false);
  const outcomes = ['PASS', 'FAIL', 'INCOMPLETE', 'MISSING', 'SKIPPED', 'TIMEOUT', 'UNKNOWN', 'SETUP_ERROR', 'UNPARSEABLE'];
  for (const previous of [0, 1, 2]) {
    for (const outcome of outcomes) {
      const prefix = [first, second].slice(0, previous);
      const next = runFixture(directory, 3, outcome);
      const result = await evaluateReadiness(readinessFixture(directory, [...prefix, next]));
      assert.equal(result.streak, outcome === 'PASS' ? Math.min(2, previous + 1) : 0,
        `state ${previous} plus ${outcome}`);
      assert.equal(result.technicalReady, outcome === 'PASS' && previous >= 1);
      assert.equal(result.publishingAuthorized, false);
    }
  }
  const empty = await evaluateReadiness(readinessFixture(directory));
  assert.equal(empty.streak, 0);
  assert.equal(empty.technicalReady, false);
  const failed = runFixture(directory, 3, 'FAIL');
  const afterFailure = await evaluateReadiness(readinessFixture(directory, [first, failed, second]));
  assert.equal(afterFailure.streak, 1, 'PASS FAIL PASS is not two consecutive passes');
  const changes = [
    ['candidate change', r => { r.candidateSha256 = digest('candidate-B'); }],
    ['manifest change', r => { r.manifestSha256 = digest('manifest-B'); }],
    ['input changed during run', r => { r.afterInputsSha256 = digest('inputs-B'); }],
    ['missing cell', r => { r.cells.pop(); }],
    ['duplicate cell', r => { r.cells.push(clone(r.cells[0])); }],
    ['reused source across runs', r => { r.state.sourceRoots[0] = first.state.sourceRoots[0]; }],
    ['per-runtime instead of per-cell source', r => { r.state.sourceRoots[1] = r.state.sourceRoots[0]; }],
    ['reused HOME', r => { r.state.homeRoots[0] = first.state.homeRoots[0]; }],
    ['reused cache', r => { r.state.cacheRoots[0] = first.state.cacheRoots[0]; }],
    ['absent isolation', r => { delete r.state; }],
    ['required skip hidden by PASS', r => { r.cells[0].evidence.timedOut = true; }],
  ];
  for (const [label, change] of changes) {
    const corrupt = clone(second);
    change(corrupt);
    const result = await reject(evaluateReadiness(readinessFixture(directory, [first, corrupt])), label);
    assert.equal(result.streak, 0, label);
  }
  for (const severity of ['S1', 'S2', 'UNKNOWN']) {
    await reject(evaluateReadiness({ ...clean, findings: [{ severity, scope: 'in-scope', state: 'open' }] }),
      `new ${severity} blocks readiness outside the fixed matrix too`);
  }
  for (const severity of ['S1', 'S2', 'S3']) {
    for (const scope of ['in-scope', 'out-of-scope']) {
      for (const state of ['open', 'resolved']) {
        for (const workaround of ['', 'disclosed workaround']) {
          const blocked = state === 'open' &&
            (scope === 'in-scope' && severity !== 'S3' || severity === 'S3' && !workaround);
          const result = await evaluateReadiness({ ...clean, findings: [{ severity, scope, state, workaround }] });
          assert.equal(result.status, blocked ? 'FAIL' : 'PASS', `${severity}/${scope}/${state}/${!!workaround}`);
        }
      }
      for (const workaround of [undefined, null, '', ' \n\t', true, 1, {}]) {
        await reject(evaluateReadiness({ ...clean,
          findings: [{ severity: 'S3', scope: 'in-scope', state: 'open', workaround }] }),
        'S3 requires a nonempty textual workaround, not a truthy placeholder');
      }
    }
    for (const scope of [undefined, null, '', 'UNKNOWN', 'in_scope', 1, {}]) {
      await reject(evaluateReadiness({ ...clean, findings: [{ severity, scope, state: 'open',
        workaround: 'a workaround cannot classify an unknown scope' }] }), 'unclassified finding scope cannot retain readiness');
    }
  }
  await pass(evaluateReadiness({ ...clean,
    findings: [{ severity: 'S3', scope: 'in-scope', state: 'open', workaround: 'documented fixture workaround' }] }),
  'disclosed S3 does not silently become an S1/S2');
  const historyPath = path.join(directory, 'immutable', 'history.jsonl');
  await pass(recordRun({ historyPath, run: first }), 'retain first completed run');
  await pass(recordRun({ historyPath, run: failed }), 'failed runs must also be retained');
  const recorded = fs.readFileSync(historyPath);
  await reject(recordRun({ historyPath, run: { ...failed, status: 'PASS' } }), 'cannot overwrite a failed run ID');
  assert.deepEqual(fs.readFileSync(historyPath), recorded);
  fs.writeFileSync(historyPath, recorded.toString('utf8').split('\n')[0] + '\n');
  const truncated = await evaluateReadiness({
    ...readinessFixture(directory), history: undefined, historyPath,
  });
  assert.equal(truncated.streak, 0, 'truncating failed history must not retain validation credit');
  fs.writeFileSync(historyPath, recorded);
  await pass(recordRun({ historyPath, run: second }), 'append fresh run without deleting failure');
  const history = fs.readFileSync(historyPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(history.map(entry => entry.run.id), [first.id, failed.id, second.id]);
  assert.equal(history[1].previousSha256, digest(fs.readFileSync(historyPath, 'utf8').split('\n')[0]));
  const observed = freezeFixture(path.join(directory, 'observed'));
  const frozen = await pass(freezeCandidate(observed.request, observed.effects), 'observation manifest baseline');
  const observedHistory = path.join(directory, 'observations', 'history.jsonl');
  await pass(recordRun({ historyPath: observedHistory, run: first }), 'retain observation control one');
  await pass(recordRun({ historyPath: observedHistory, run: second }), 'retain observation control two');
  const input = { manifestPath: frozen.manifestPath, manifestSha256: frozen.manifestSha256,
    historyPath: observedHistory };
  const { observeFrozenCandidate } = await import('./release-qualification-cli.mjs');
  await pass(observeFrozenCandidate(input, observed.effects), 'unchanged observation is accepted');
  const helper = observed.request.files.find(file => file.kind === 'helper').path;
  const original = fs.readFileSync(helper);
  fs.appendFileSync(helper, 'observed relevant change');
  await reject(observeFrozenCandidate(input, observed.effects), 'changed-input observation must be retained');
  fs.writeFileSync(helper, original);
  await pass(observeFrozenCandidate(input, observed.effects), 'exact restoration is accepted without deleting failure');
  const observedRows = fs.readFileSync(observedHistory, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(observedRows.at(-1).run.status, 'FAIL',
    'restoring observed changed inputs must not resurrect the previous clean streak');
  assert.deepEqual(observedRows.slice(0, 2).map(row => row.run.id), [first.id, second.id]);
  const launches = [];
  const sourceRoot = path.join(directory, 'candidate');
  write(path.join(sourceRoot, 'candidate.txt'), 'stable');
  const cargoSeed = path.join(directory, 'cargo-seed'), juliaSeed = path.join(directory, 'julia-seed');
  const juliaSecond = path.join(directory, 'julia-second-seed');
  write(path.join(cargoSeed, 'dependency'), 'frozen cargo dependency');
  fs.symlinkSync('dependency', path.join(cargoSeed, 'dependency-link'));
  write(path.join(juliaSeed, 'dependency'), 'frozen Julia dependency');
  write(path.join(juliaSecond, 'dependency'), 'second frozen Julia dependency');
  const environment = { CARGO_HOME: cargoSeed, JULIA_DEPOT_PATH: [juliaSeed, juliaSecond].join(path.delimiter) };
  const inheritedPath = process.env.PATH;
  t.after(() => {
    if (inheritedPath === undefined) delete process.env.PATH;
    else process.env.PATH = inheritedPath;
  });
  for (const [index, cell] of required.slice(0, 3).entries()) {
    process.env.PATH = `/untrusted/inherited/node${index}`;
    await pass(runQualificationCell({
      cell, sourceRoot, workRoot: path.join(directory, 'launches'),
      catalogue: [{ name: 'TEST-RELQ-FIXTURE named target' }],
      runtime: { executable: process.execPath, canonicalPath: '/canonical/node:/usr/bin:/bin' },
      environment,
      command: [process.execPath, '-e', 'process.stdout.write("fixture")'],
    }, {
      materializeSource: async ({ destination }) => { write(path.join(destination, 'candidate.txt'), 'stable'); },
      execute: async invocation => {
        launches.push(invocation);
        return { exit: 0, signal: null, timedOut: false,
          stdout: tap('TEST-RELQ-FIXTURE named target'), stderr: '' };
      },
    }), 'fresh per-cell launch receipt');
  }
  assert.equal(new Set(launches.map(item => item.cwd)).size, 3, 'same runtime must not imply shared source');
  assert.equal(new Set(launches.map(item => item.env.HOME)).size, 3, 'private HOME per cell');
  assert.equal(new Set(launches.map(item => item.env.npm_config_userconfig)).size, 3, 'private npm config per cell');
  for (const invocation of launches) assert.equal(invocation.env.PATH, '/canonical/node:/usr/bin:/bin');
  for (const [index, invocation] of launches.entries()) {
    assert.notEqual(invocation.env.CARGO_HOME, cargoSeed, 'dependency seeds must not be writable execution caches');
    assert.ok(processIo.inside(invocation.env.HOME, invocation.env.CARGO_HOME));
    assert.equal(fs.readFileSync(path.join(invocation.env.CARGO_HOME, 'dependency-link'), 'utf8'), 'frozen cargo dependency');
    fs.writeFileSync(path.join(invocation.env.CARGO_HOME, 'dependency-link'), `private cargo write ${index}`);
    const depots = invocation.env.JULIA_DEPOT_PATH.split(path.delimiter);
    assert.equal(depots.length, 2);
    for (const [part, depot] of depots.entries()) {
      assert.ok(processIo.inside(invocation.env.HOME, depot));
      assert.equal(fs.readFileSync(path.join(depot, 'dependency'), 'utf8'),
        part === 0 ? 'frozen Julia dependency' : 'second frozen Julia dependency');
      fs.writeFileSync(path.join(depot, 'dependency'), `private Julia write ${index}`);
    }
  }
  assert.equal(new Set(launches.map(item => item.env.CARGO_HOME)).size, 3);
  assert.equal(fs.readFileSync(path.join(cargoSeed, 'dependency'), 'utf8'), 'frozen cargo dependency');
  assert.equal(fs.readFileSync(path.join(juliaSeed, 'dependency'), 'utf8'), 'frozen Julia dependency');
  assert.equal(fs.readFileSync(path.join(juliaSecond, 'dependency'), 'utf8'), 'second frozen Julia dependency');
});

/** @id TEST-RELQ-005 @verifies REQ-RELQ-005 */
test('TEST-RELQ-005 binds durable helpers and exact package-entry receipts without release authorization', async t => {
  const directory = workspace(t);
  const { spawnSync } = await import('node:child_process');
  const cli = spawnSync(process.execPath, [path.join(root, 'scripts/release-qualification.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, TMPDIR: directory, NO_COLOR: '1' },
  });
  assert.equal(cli.status, 1, 'real durable CLI must refuse malformed input without a cyclic-module exit');
  assert.equal(JSON.parse(cli.stderr.trim()).status, 'FAIL');
  assert.equal(cli.signal, null);
  const tgz = write(path.join(directory, 'musubix6-0.2.4.tgz'), 'synthetic package bytes for verifier fixtures');
  const helpers = ['release-qualification.mjs', 'release-qualification.test.mjs',
    'release-host-mutations.mjs', 'release-host-mutations.test.mjs'].map(name => {
    const file = write(path.join(directory, 'source', 'scripts', name), `export const fixture = '${name}';\n`);
    return { path: file, sha256: fileDigest(file) };
  });
  const packageCommands = major => [
    { command: [`/fixture/node${major}`, '/fixture/npm-cli.js', 'install', '--offline', tgz], output: 'installed' },
    { command: [`/fixture/node${major}`, '/fixture/node_modules/.bin/musubix6', '--version'], output: '0.2.4\n' },
    { command: [`/fixture/node${major}`, '/fixture/node_modules/.bin/musubix6', 'init', '--host', 'both'], output: 'copied both hosts' },
  ].map((row, index) => ({
    command: row.command, exit: 0, signal: null, timedOut: false,
    stdout: retained(directory, `package-${major}-command-${index}.stdout`, row.output),
    stderr: retained(directory, `package-${major}-command-${index}.stderr`, ''),
  }));
  const packageReceipts = [20, 22, 24].map(major => ({
    runtimeMajor: major, tgzPath: tgz, tgzSha256: fileDigest(tgz), installedVersion: '0.2.4',
    offline: true, entrypoint: 'node_modules/.bin/musubix6', host: 'both',
    command: ['npm', 'exec', '--offline', '--', 'musubix6', 'init', '--host', 'both'],
    exit: 0, signal: null, timedOut: false,
    log: retained(directory, `package-${major}.json`, JSON.stringify({
      runtimeMajor: major, version: '0.2.4', host: 'both',
      copiedHosts: ['.github/skills', '.claude/skills'], status: 'PASS',
      commands: packageCommands(major),
    })),
    inventories: {
      '.github/skills': [{ path: 'lean-sdd-tdd/SKILL.md', sha256: digest('same skill') }],
      '.claude/skills': [{ path: 'lean-sdd-tdd/SKILL.md', sha256: digest('same skill') }],
    },
  }));
  const request = {
    targetVersion: '0.2.4', packagePath: tgz, packageSha256: fileDigest(tgz), helpers, packageReceipts,
    readiness: { status: 'PASS', technicalReady: true, streak: 2, publishingAuthorized: false },
    artifacts: [{ path: tgz, sha256: fileDigest(tgz) }],
    exclusions: clone(approvedPlan.excludedCells),
    residualRisks: ['Windows, macOS, actual WSL containers and live Claude interactions remain unverified'],
    outputPath: path.join(directory, 'release-report.json'),
    humanReleaseApproved: false, publishingAuthorized: false,
  };
  const report = await pass(prepareReleaseReport(request),
    'complete exact package receipts produce only a technical report, never publication authority');
  assert.equal(report.publishingAuthorized, false);
  assert.equal(report.humanReleaseApproved, false);
  assert.equal(report.reportSha256, fileDigest(request.outputPath), 'hash the actual persisted report');
  assert.deepEqual(read(request.outputPath).exclusions, request.exclusions);
  assert.deepEqual(read(request.outputPath).residualRisks, request.residualRisks);
  for (const [label, mutate] of [
    ['missing Node22 package check', r => { r.packageReceipts.splice(1, 1); }],
    ['duplicate runtime', r => { r.packageReceipts.push(clone(r.packageReceipts[0])); }],
    ['stale packed CLI', r => { r.packageReceipts[0].installedVersion = '0.2.0'; }],
    ['different tgz', r => { r.packageReceipts[1].tgzSha256 = digest('other package'); }],
    ['not actual package entry', r => { r.packageReceipts[0].entrypoint = 'bin/musubix6.mjs'; }],
    ['not offline', r => { r.packageReceipts[0].offline = false; }],
    ['missing host inventory', r => { delete r.packageReceipts[0].inventories['.claude/skills']; }],
    ['different copied skill', r => { r.packageReceipts[0].inventories['.claude/skills'][0].sha256 = digest('stale'); }],
    ['forged retained log', r => { r.packageReceipts[0].log.sha256 = digest('forged'); }],
    ['unproven command summary', r => {
      const summary = read(r.packageReceipts[0].log.path);
      delete summary.commands;
      r.packageReceipts[0].log = retained(directory, `unproven-${randomUUID()}.json`, JSON.stringify(summary));
    }],
    ['missing helper', r => { r.helpers.pop(); }],
    ['human approval claimed', r => { r.humanReleaseApproved = true; }],
    ['publish claimed', r => { r.publishingAuthorized = true; }],
    ['no exclusion', r => { r.exclusions = []; }],
    ['no residual risks', r => { r.residualRisks = []; }],
  ]) {
    const corrupt = clone(request);
    corrupt.outputPath = path.join(directory, `rejected-report-${randomUUID()}.json`);
    mutate(corrupt);
    await reject(prepareReleaseReport(corrupt), label);
  }
  fs.appendFileSync(helpers[0].path, 'changed helper');
  await reject(prepareReleaseReport(request), 'durable helper bytes no longer match their receipt');
  const calls = [];
  const runtimes = [20, 22, 24].map(major => ({ major, executable: `/fixture/node${major}/bin/node` }));
  await pass(verifyPackageEntrypoints({
    packagePath: tgz, packageSha256: fileDigest(tgz), targetVersion: '0.2.4',
    runtimes, workRoot: path.join(directory, 'package-work'),
  }, {
    installAndInvoke: async invocation => {
      calls.push(invocation);
      return packageReceipts.find(receipt => receipt.runtimeMajor === invocation.runtime.major);
    },
  }), 'package launcher runs the pinned artifact on every required runtime');
  assert.deepEqual(calls.map(call => call.runtime.major).sort(), [20, 22, 24]);
  assert.equal(new Set(calls.map(call => call.workRoot)).size, 3, 'private install state per runtime');
  for (const call of calls) {
    assert.equal(call.packagePath, tgz);
    assert.equal(call.packageSha256, fileDigest(tgz));
    assert.equal(call.offline, true);
    assert.equal(call.host, 'both');
  }
});
