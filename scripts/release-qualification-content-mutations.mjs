import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sha, fileSha, json, equal, ensure, mkdir, save, execute, retainProcess, cleanEnvironment, externalOutput } from './release-qualification-io.mjs';
import { validateContentNative } from './release-qualification-evidence.mjs';

export const contentRelative = '.sdd/release-content-mutations.v0.2.3.json';
const nativeTest = '.github/skills/japanese-prose/scripts/test_engine.py';
const nodeTest = 'scripts/kotonoha-skills.test.mjs';
const self = fileURLToPath(import.meta.url);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phases = ['baseline', 'mutant', 'restored'];

/** @id CODE-RELQ-CONTENT-001 @implements REQ-RELQ-003, REQ-RELQ-005 */
export function contentCaseCatalogue(reference, cellId) {
  equal(reference.exactRequiredCaseCounts, {
    skillMechanisms: 13, sourceVendorChallenges: 1090, originSensitivityChallenges: 60,
    vendorChallenges: 1150, skillCellTotal: 1163, placeholderMechanisms: 14,
  });
  equal(reference.skillCatalogue.length, 13);
  equal(reference.placeholderCatalogue.length, 14);
  equal(reference.vendorReference.referenceFiles.length, 109);
  equal(reference.vendorReference.originSensitivityCases.length, 60);
  const semantic = rows => rows.map(row => ({ ...row, id: row.proposedId, kind: 'semantic' }));
  let result;
  if (cellId === 'PLACEHOLDER-MUTATION') result = semantic(reference.placeholderCatalogue);
  else {
    equal(cellId, 'SKILL-MUTATION');
    const policies = ['unauthorized-byte', ...reference.vendorReference.modePolicy.map(row => row.name)];
    equal(new Set(policies).size, 10);
    result = [...semantic(reference.skillCatalogue),
      ...reference.vendorReference.referenceFiles.flatMap(file => policies.map(policy => ({
        id: `vendor:${policy}:${file.path}`, kind: 'vendor', file: file.path, policy, origin: 'source', host: 'copilot',
      }))),
      ...reference.vendorReference.originSensitivityCases.map(row => ({ ...row, kind: 'vendor' }))];
  }
  equal(new Set(result.map(row => row.id)).size, result.length);
  return result;
}

export function applyContentEdit(text, mutation) {
  ensure(typeof mutation.before === 'string' && mutation.before && mutation.before !== mutation.after, 'nonempty effective edit required');
  let start = 0, end = text.length;
  if (mutation.scope !== null) {
    ensure(/^def [A-Za-z_]\w*\(/.test(mutation.scope), 'named top-level Python function required');
    const starts = [...text.matchAll(new RegExp(`^${escape(mutation.scope)}`, 'gm'))];
    equal(starts.length, 1);
    start = starts[0].index;
    const next = /^(?:def |class )/gm;
    next.lastIndex = start + mutation.scope.length;
    end = next.exec(text)?.index ?? text.length;
  }
  const selected = text.slice(start, end);
  equal(selected.split(mutation.before).length - 1, 1);
  return text.slice(0, start) + selected.replace(mutation.before, mutation.after) + text.slice(end);
}

function referenceAt(source) { return json(path.join(source, contentRelative)); }

function nodeNames(source, prefixes) {
  const titles = [...fs.readFileSync(path.join(source, nodeTest), 'utf8').matchAll(/^test\('([^']+)'/gm)].map(match => match[1]);
  return prefixes.map(prefix => {
    const matches = titles.filter(title => title.startsWith(prefix + ' '));
    equal(matches.length, 1);
    return matches[0];
  });
}

export function buildContentCasePlan(context, target) {
  const directory = path.join(context.output, 'cases', sha(target.id));
  const source = path.join(directory, 'source');
  const helper = path.join(context.source, 'scripts/release-qualification-content-mutations.mjs');
  const plan = { id: target.id, directory, source, node: context.node, helper,
    helperSha256: fileSha(helper), referencePath: path.join(context.source, contentRelative),
    referenceSha256: fileSha(path.join(context.source, contentRelative)) };
  if (target.kind === 'vendor') {
    plan.inventoryHost = target.host || (target.origin === 'package' ? 'copilot' : null);
    ensure(plan.inventoryHost, 'explicit initialized-origin host required');
    plan.family = 'Node ERR_ASSERTION';
    plan.targetNames = ['content inventory oracle'];
    plan.assertionSource = helper;
    plan.assertionLines = inventoryAssertionLines(helper, target.policy === 'unauthorized-byte' ? 'bytes' : 'mode');
    plan.command = [context.node, '--test-reporter=tap', helper, '--inventory', path.join(directory, 'inventory.json')];
    plan.originRoot = target.origin === 'source' ? source : target.origin === 'package' ?
      path.join(directory, 'extracted/package') : path.join(directory, 'installed');
    plan.prefix = '.github/skills';
    if (target.host === 'claude') plan.prefix = '.claude/skills';
  } else {
    plan.family = target.oracle.errorFamily;
    plan.assertionLines = target.oracle.expectedAssertionLines;
    const witnesses = Array.isArray(target.oracle.evidence) ? target.oracle.evidence : [target.oracle.evidence];
    const oracle = witnesses.find(row => row.path === (plan.family === 'Python AssertionError' ? nativeTest : nodeTest));
    ensure(oracle, 'independent oracle hash required');
    equal(fileSha(path.join(context.source, oracle.path)), oracle.sha256);
    plan.oracleSha256 = oracle.sha256;
    if (plan.family === 'Python AssertionError') {
      ensure(context.configuration.prosePython && path.isAbsolute(context.configuration.prosePython), 'pinned GiNZA interpreter required');
      plan.python = context.configuration.prosePython;
      plan.targetNames = [target.oracle.test.split('::')[1]];
      plan.assertionSource = path.join(source, nativeTest);
      plan.command = [plan.python, '-B', plan.assertionSource, '-v', ...plan.targetNames];
    } else {
      const prefix = target.oracle.test.split(' ')[0];
      plan.targetNames = nodeNames(context.source, [prefix]);
      plan.assertionSource = path.join(source, nodeTest);
      plan.command = [context.node, '--test', `--test-reporter=${path.join(context.source, 'scripts/release-host-events.mjs')}`,
        '--test-name-pattern', `^${escape(plan.targetNames[0])}$`, plan.assertionSource];
    }
  }
  ensure(plan.assertionLines.length > 0 && plan.assertionLines.every(line => Number.isSafeInteger(line) && line > 0),
    'exact positive independent assertion lines required');
  if (target.kind === 'semantic' && plan.family === 'Python AssertionError') {
    const index = Number(target.id.split('-').at(-1));
    const positive = index <= 3 ? 'DiagnosticTests.test_proofreading_preserves_names_code_and_deliberate_styles' :
      index <= 5 ? 'DiagnosticTests.test_unnatural_fixture_scores_below_natural_fixture' :
      index === 6 ? 'DiagnosticTests.test_proofreading_detects_adjacent_duplicates' :
      'InvariantTests.test_review_must_cover_exact_edits_and_all_semantic_checks';
    plan.positive = { ...plan, targetNames: [positive], command: [...plan.command.slice(0, -1), positive] };
  }
  const setupCommands = [];
  if (target.origin === 'package' || target.origin === 'packageInit') {
    const runtime = context.configuration.runtimes?.find(row => String(row.major) === '24');
    const npm = runtime?.npm || path.resolve(path.dirname(context.node), '../lib/node_modules/npm/bin/npm-cli.js');
    const pack = path.join(directory, 'tarball');
    let tgz;
    if (context.configuration.qualifying || context.configuration.packagePath || context.configuration.packageSha256) {
      ensure(path.isAbsolute(context.configuration.packagePath || '') &&
        /^[a-f0-9]{64}$/.test(context.configuration.packageSha256 || ''), 'exact frozen package path/hash required');
      equal(fileSha(context.configuration.packagePath), context.configuration.packageSha256);
      tgz = context.configuration.packagePath;
      plan.packageInput = { path: tgz, sha256: context.configuration.packageSha256 };
    } else {
      tgz = path.join(pack, 'musubix6-0.2.3.tgz');
      plan.developmentRepack = true;
      setupCommands.push([context.node, npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', pack]);
    }
    setupCommands.push(['tar', '-tzf', tgz],
      ['tar', '--extract', '--gzip', '--same-permissions', '--file', tgz, '--directory', path.join(directory, 'extracted')]);
  }
  if (target.origin === 'sourceInit' || target.origin === 'packageInit') {
    const originSource = target.origin === 'sourceInit' ? source : path.join(directory, 'extracted/package');
    setupCommands.push([context.node, path.join(originSource, 'bin/musubix6.mjs'), 'init', plan.originRoot, '--host', target.host]);
  }
  plan.setupCommands = setupCommands;
  return plan;
}

function inventoryAssertionLines(helper, kind) {
  const lines = fs.readFileSync(helper, 'utf8').split('\n');
  return lines.flatMap((line, index) => line.includes(`'owned inventory ${kind}'`) ? [index + 1] : []);
}

function expectedInventory(reference, host, origin) {
  const supported = reference.vendorReference.hostInventories[host];
  ensure(supported, 'known host inventory required');
  const files = reference.vendorReference.referenceFiles.filter(file =>
    supported.skillNames.includes(file.path.split('/')[2]));
  equal(files.length, supported.fileCount);
  equal(new Set(files.map(file => file.path)).size, files.length);
  return files.map(file => ({ ...file, mode: origin.startsWith('package') ? file.packageMode : file.mode }));
}

function observedInventory(root, prefix, directories) {
  const files = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), 'owned inventory external symlink');
      assert.ok(name !== '__pycache__' && !/\.py[co]$/.test(name), 'owned inventory cache');
      if (stat.isDirectory()) {
        assert.ok(directories.has(path.relative(root, file)), 'owned inventory paths');
        walk(file);
      }
      else { assert.ok(stat.isFile(), 'owned inventory regular file'); files.push(path.relative(root, file)); }
    }
  }
  walk(path.join(root, prefix));
  return files;
}

export function assertContentInventory(input) {
  equal(fileSha(input.referencePath), input.referenceSha256);
  const reference = json(input.referencePath), expected = expectedInventory(reference, input.host, input.origin);
  const prefix = input.prefix || '.github/skills';
  const names = fs.readdirSync(path.join(input.originRoot, prefix)).sort();
  assert.deepEqual(names, [...reference.vendorReference.hostInventories[input.host].skillNames].sort(), 'owned inventory names');
  const directories = new Set();
  for (const file of expected) {
    let directory = path.dirname(path.join(prefix, file.path.slice('.github/skills/'.length)));
    while (directory !== prefix) {
      directories.add(directory);
      directory = path.dirname(directory);
    }
  }
  const observed = observedInventory(input.originRoot, prefix, directories);
  if (input.duplicateProbe) observed.push(observed[0]);
  assert.equal(new Set(observed).size, observed.length, 'owned inventory duplicate paths');
  const canonical = observed.map(file => '.github/skills/' + file.slice(prefix.length + 1));
  assert.deepEqual(canonical.sort(), expected.map(file => file.path).sort(), 'owned inventory paths');
  for (const file of expected) {
    const actual = path.join(input.originRoot, prefix, file.path.slice('.github/skills/'.length));
    assert.equal(fs.lstatSync(actual).mode & 0o777, file.mode, 'owned inventory mode');
    assert.equal(fileSha(actual), file.sha256, 'owned inventory bytes');
  }
}

function copySource(source, destination) {
  mkdir(destination);
  for (const relative of ['.github', 'bin', 'package.json', 'README.md', 'README-ja.md', 'CLANGELOG.md', 'LICENSE', nodeTest]) {
    const file = path.join(source, relative);
    if (!fs.existsSync(file)) continue;
    mkdir(path.dirname(path.join(destination, relative)));
    fs.cpSync(file, path.join(destination, relative), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  }
}

function caseEnvironment(context, directory) {
  const environment = cleanEnvironment(context.environment, context.environment.PATH, path.join(directory, 'home'));
  environment.TMPDIR = path.join(directory, 'native-work');
  environment.PYTHONDONTWRITEBYTECODE = '1';
  mkdir(environment.TMPDIR);
  return environment;
}

async function recorded(context, directory, command, env, cwd, exit = 0) {
  ensure(Date.now() < (context.deadline || Infinity), 'content cell deadline exceeded');
  const result = await execute({ command, cwd, env,
    timeoutMs: Math.max(1, Math.min(180000, (context.deadline || Date.now() + 180000) - Date.now())) });
  const receipt = retainProcess(directory, result);
  ensure(!result.error && !result.timedOut && !result.signal && !result.outputLimit && result.exit === exit,
    `native command failed: ${command[0]} expected ${exit}, got ${result.exit}; ${receipt.stderr.path}`);
  return receipt;
}

async function packageSource(context, plan, environment, receipts) {
  let tgz;
  if (plan.packageInput) {
    equal(fileSha(plan.packageInput.path), plan.packageInput.sha256);
    tgz = plan.packageInput.path;
  } else {
    ensure(plan.developmentRepack === true, 'explicit development repack required');
    const directory = path.join(plan.directory, 'tarball'); mkdir(directory);
    const packed = await recorded(context, path.join(plan.directory, 'pack'), plan.setupCommands[0], environment, plan.source);
    receipts.push(packed);
    let value = JSON.parse(fs.readFileSync(packed.stdout.path, 'utf8'));
    if (!Array.isArray(value)) value = Object.values(value);
    ensure(value.length === 1 && path.basename(value[0].filename) === value[0].filename, 'one genuine package required');
    tgz = path.join(directory, value[0].filename);
  }
  const extracted = path.join(plan.directory, 'extracted');
  mkdir(extracted);
  const listing = await recorded(context, path.join(plan.directory, 'tar-list'), ['tar', '-tzf', tgz], environment, plan.directory);
  ensure(fs.readFileSync(listing.stdout.path, 'utf8').trim().split('\n').every(name =>
    name.startsWith('package/') && !name.split('/').includes('..')), 'unsafe archive path');
  receipts.push(listing);
  receipts.push(await recorded(context, path.join(plan.directory, 'tar-extract'),
    ['tar', '--extract', '--gzip', '--same-permissions', '--file', tgz, '--directory', extracted], environment, plan.directory));
  if (plan.packageInput) equal(fileSha(plan.packageInput.path), plan.packageInput.sha256);
  return path.join(extracted, 'package');
}

async function prepareOrigin(context, plan, target, environment, receipts) {
  copySource(context.source, plan.source);
  let source = plan.source;
  if (target.origin === 'package' || target.origin === 'packageInit') source = await packageSource(context, plan, environment, receipts);
  if (target.origin === 'sourceInit' || target.origin === 'packageInit') {
    receipts.push(await recorded(context, path.join(plan.directory, 'init'),
      [context.node, path.join(source, 'bin/musubix6.mjs'), 'init', plan.originRoot, '--host', target.host],
      environment, plan.directory));
  }
  if (target.kind === 'vendor') save(path.join(plan.directory, 'inventory.json'), {
    referencePath: plan.referencePath, referenceSha256: plan.referenceSha256,
    originRoot: plan.originRoot, prefix: plan.prefix, host: plan.inventoryHost, origin: target.origin,
  });
}

/** @id CODE-RELQ-CONTENT-002 @implements REQ-RELQ-003, REQ-RELQ-005 */
export async function runContentCase(context, target) {
  externalOutput(context.source, context.output);
  const plan = buildContentCasePlan(context, target);
  ensure(!fs.existsSync(plan.directory), 'fresh content case origin required');
  mkdir(plan.directory);
  const environment = caseEnvironment(context, plan.directory), setup = [];
  save(path.join(plan.directory, 'plan.json'), plan);
  await prepareOrigin(context, plan, target, environment, setup);
  const reference = referenceAt(context.source);
  const row = { id: target.id, status: 'PASS', plan, setup, nativeCounts: {} };
  const file = target.kind === 'vendor' ?
    path.join(plan.originRoot, target.file) : path.join(plan.source, target.mutation.file);
  const added = target.kind === 'semantic' && target.mutation.operation;
  if (added) ensure(!fs.existsSync(file) && !fs.existsSync(path.dirname(file)), 'addition file and directory must be absent');
  const original = added ? null : fs.readFileSync(file), originalMode = added ? null : fs.statSync(file).mode & 0o777;
  row.beforeSha256 = added ? null : sha(original);
  const run = async phase => {
    row[phase] = await recorded(context, path.join(plan.directory, phase), plan.command, environment, plan.source, phase === 'mutant' ? 1 : 0);
    row.nativeCounts[phase] = validateContentNative({ receipt: row[phase], phase, target, plan, reference });
  };
  await run('baseline');
  if (plan.positive) {
    row.positiveBaseline = await recorded(context, path.join(plan.directory, 'positive-baseline'),
      plan.positive.command, environment, plan.source);
    validateContentNative({ receipt: row.positiveBaseline, phase: 'baseline', target, plan: plan.positive });
  }
  try {
    if (target.kind === 'vendor') {
      if (target.policy === 'unauthorized-byte') fs.appendFileSync(file, '\n');
      else fs.chmodSync(file, originalMode ^ parseInt(target.policy.slice('unauthorized-mode-'.length), 8));
    } else if (added) { mkdir(path.dirname(file)); fs.writeFileSync(file, target.mutation.content); }
    else fs.writeFileSync(file, applyContentEdit(original.toString('utf8'), target.mutation));
    await run('mutant');
  } finally {
    if (added) fs.rmSync(path.dirname(file), { recursive: true });
    else { fs.chmodSync(file, originalMode | 0o600); fs.writeFileSync(file, original); fs.chmodSync(file, originalMode); }
    await run('restored');
  }
  if (plan.positive) {
    row.positiveRestored = await recorded(context, path.join(plan.directory, 'positive-restored'),
      plan.positive.command, environment, plan.source);
    validateContentNative({ receipt: row.positiveRestored, phase: 'restored', target, plan: plan.positive });
  }
  row.afterSha256 = added ? null : fileSha(file);
  equal(row.beforeSha256, row.afterSha256);
  validateContentCase({ row, target, plan, reference });
  save(path.join(plan.directory, 'result.json'), row);
  return row;
}

export function validateContentCase({ row, target, plan, reference }) {
  equal(row.id, target.id); equal(row.status, 'PASS'); equal(row.plan, plan);
  equal(fileSha(plan.helper), plan.helperSha256);
  equal(fileSha(plan.referencePath), plan.referenceSha256);
  if (plan.packageInput) equal(fileSha(plan.packageInput.path), plan.packageInput.sha256);
  ensure(target.oracle?.expectedAssertionLines?.every(line => Number.isSafeInteger(line) && line > 0) ?? target.kind === 'vendor',
    'invalid assertion lines');
  if (target.kind === 'semantic') {
    equal(plan.assertionLines, target.oracle.expectedAssertionLines);
    equal(plan.family, target.oracle.errorFamily);
  }
  for (const phase of phases) equal(row.nativeCounts[phase],
    validateContentNative({ receipt: row[phase], phase, target, plan, reference }));
  if (plan.positive) {
    for (const [phase, receipt] of [['baseline', row.positiveBaseline], ['restored', row.positiveRestored]]) {
      validateContentNative({ receipt, phase, target, plan: plan.positive });
    }
  }
  equal(row.setup.map(receipt => receipt.command), plan.setupCommands);
  for (const receipt of row.setup) {
    ensure(receipt.receipt && receipt.exit === 0 && !receipt.signal && !receipt.timedOut && !receipt.error, 'setup incomplete');
    equal(json(receipt.receipt.path), Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receipt')));
    equal(fileSha(receipt.receipt.path), receipt.receipt.sha256);
    equal(fileSha(receipt.stdout.path), receipt.stdout.sha256); equal(fileSha(receipt.stderr.path), receipt.stderr.sha256);
  }
  equal(row.beforeSha256, row.afterSha256);
}

const negativeKinds = ['missing', 'extra', 'empty-directory', 'duplicate', 'cache', 'obsidian', 'external-symlink'];

function controlDefinitions(context) {
  const file = referenceAt(context.source).vendorReference.referenceFiles[0].path;
  const origins = [['source', 'copilot'], ['package', 'copilot'], ['sourceInit', 'copilot'],
    ['sourceInit', 'claude'], ['packageInit', 'copilot'], ['packageInit', 'claude']];
  const positive = origins.map(([origin, host]) => {
    const target = { id: `positive:${origin}:${host}`, kind: 'vendor', file, policy: 'unauthorized-byte', origin, host };
    return { type: 'positive', target, plan: buildContentCasePlan(context, target) };
  });
  const negative = negativeKinds.map(kind => {
    const target = { id: `negative:${kind}`, kind: 'vendor', file, policy: kind, origin: 'source', host: 'copilot' };
    const plan = buildContentCasePlan(context, { ...target, policy: 'unauthorized-byte' });
    const assertion = ['missing', 'extra', 'empty-directory'].includes(kind) ? 'paths' : kind === 'duplicate' ? 'duplicate paths' :
      kind === 'obsidian' ? 'names' : kind === 'external-symlink' ? 'external symlink' : 'cache';
    plan.assertionLines = inventoryAssertionLines(plan.helper, assertion);
    return { type: 'negative', target, plan };
  });
  return [...positive, ...negative];
}

async function runContentControls(context, definitions) {
  const controls = [];
  for (const definition of definitions) {
    const { target, plan } = definition;
    mkdir(plan.directory);
    const environment = caseEnvironment(context, plan.directory), setup = [];
    save(path.join(plan.directory, 'plan.json'), plan);
    await prepareOrigin(context, plan, target, environment, setup);
    const control = { ...definition, setup };
    const run = async phase => {
      control[phase] = await recorded(context, path.join(plan.directory, phase), plan.command,
        environment, plan.source, phase === 'mutant' ? 1 : 0);
      validateContentNative({ receipt: control[phase], phase, target, plan });
    };
    await run('baseline');
    if (definition.type === 'negative') {
      const base = path.join(plan.originRoot, '.github/skills');
      const originalFile = path.join(plan.originRoot, target.file), original = fs.readFileSync(originalFile),
        mode = fs.statSync(originalFile).mode & 0o777;
      const extra = path.join(base, 'tech-writer', 'scripts', 'unapproved-extra');
      const empty = path.join(base, 'tech-writer', 'scripts', 'unapproved-empty');
      const cache = path.join(base, 'tech-writer', 'scripts', '__pycache__');
      const obsidian = path.join(base, 'obsidian-unapproved');
      const inputPath = path.join(plan.directory, 'inventory.json'), input = json(inputPath);
      try {
        if (target.policy === 'missing') fs.rmSync(originalFile);
        else if (target.policy === 'empty-directory') mkdir(empty);
        else if (target.policy === 'duplicate') save(inputPath, { ...input, duplicateProbe: true }, false);
        else if (target.policy === 'cache') { mkdir(cache); fs.writeFileSync(path.join(cache, 'probe.pyc'), 'fixture'); }
        else if (target.policy === 'obsidian') { mkdir(obsidian); fs.writeFileSync(path.join(obsidian, 'SKILL.md'), '# Forbidden'); }
        else if (target.policy === 'external-symlink') {
          const external = path.join(plan.directory, 'external-file');
          fs.writeFileSync(external, 'external fixture'); fs.symlinkSync(external, extra);
        } else fs.writeFileSync(extra, 'extra fixture');
        await run('mutant');
      } finally {
        if (target.policy === 'missing') { fs.writeFileSync(originalFile, original); fs.chmodSync(originalFile, mode); }
        else if (target.policy === 'empty-directory') fs.rmdirSync(empty);
        else if (target.policy === 'duplicate') save(inputPath, input, false);
        else if (target.policy === 'cache') fs.rmSync(cache, { recursive: true });
        else if (target.policy === 'obsidian') fs.rmSync(obsidian, { recursive: true });
        else fs.rmSync(extra);
        await run('restored');
      }
    } else await run('restored');
    controls.push(control);
  }
  return controls;
}

async function lexicalControls(context, controls) {
  const titles = nodeNames(context.source, ['TEST-TW-PH-001', 'TEST-TW-PH-002', 'TEST-TW-PH-003']);
  const result = [];
  for (const origin of ['source', 'package']) {
    const parent = controls.find(control => control.target.origin === origin && control.target.host === 'copilot');
    const script = path.join(parent.plan.originRoot, nodeTest);
    const plan = { family: 'Node ERR_ASSERTION', source: parent.plan.source, targetNames: titles,
      assertionSource: script, assertionLines: [139, 151, 224],
      command: [context.node, '--test', `--test-reporter=${path.join(context.source, 'scripts/release-host-events.mjs')}`,
        '--test-name-pattern', `^(?:${titles.map(escape).join('|')})$`, script] };
    const receipt = await recorded(context, path.join(context.output, `lexical-${origin}`), plan.command,
      caseEnvironment(context, path.join(context.output, `lexical-home-${origin}`)), plan.source);
    validateContentNative({ receipt, phase: 'baseline', target: {}, plan });
    result.push({ origin, plan, receipt });
  }
  return result;
}

export async function runContentCell(context) {
  externalOutput(context.source, context.output);
  equal(String(context.cell.runtime), '24'); equal(context.cell.timeoutSeconds, 3600);
  const reference = referenceAt(context.source), catalogue = contentCaseCatalogue(reference, context.cell.id);
  equal(context.catalogue || catalogue, catalogue);
  mkdir(context.output);
  context = { ...context, deadline: Date.now() + 3600000 };
  const plans = catalogue.map(target => buildContentCasePlan(context, target));
  const planRef = save(path.join(context.output, 'selected-commands.json'), plans);
  const definitions = controlDefinitions(context);
  const controlPlanRef = save(path.join(context.output, 'selected-controls.json'), definitions);
  const callerPath = process.env.QUALIFY_CONTEXT;
  ensure(callerPath && path.isAbsolute(callerPath), 'actual retained caller context required');
  const callerContext = { path: callerPath, sha256: fileSha(callerPath) };
  const controls = await runContentControls(context, definitions);
  const lexical = await lexicalControls(context, controls);
  const cases = [];
  for (const target of catalogue) {
    cases.push(await runContentCase(context, target));
    save(path.join(context.output, 'progress.json'), { completed: cases.length, required: catalogue.length, last: target.id }, false);
  }

  return { status: 'PASS', cases, planRef, controlPlanRef, controls, lexical, callerContext, source: context.source, node: context.node,
    reference: { path: path.join(context.source, contentRelative), sha256: fileSha(path.join(context.source, contentRelative)) } };
}

export function validateContentRun({ cell, catalogue, evidence, data }) {
  equal(data.source, evidence.cwd); equal(data.node, evidence.command[0]);
  equal(data.callerContext.path, evidence.command.at(-1));
  equal(fileSha(data.callerContext.path), data.callerContext.sha256);
  const context = json(data.callerContext.path);
  equal(context.source, data.source); equal(context.node, data.node); equal(context.cell, cell);
  equal(data.reference.path, path.join(context.source, contentRelative));
  const reference = json(data.reference.path);
  equal(fileSha(data.reference.path), data.reference.sha256);
  equal(catalogue, contentCaseCatalogue(reference, cell.id));
  equal(data.cases.map(row => row.id), catalogue.map(row => row.id));
  const plans = json(data.planRef.path);
  equal(fileSha(data.planRef.path), data.planRef.sha256);
  equal(plans.length, catalogue.length);
  equal(plans, catalogue.map(target => buildContentCasePlan(context, target)));
  for (let index = 0; index < catalogue.length; index++) {
    validateContentCase({ row: data.cases[index], target: catalogue[index], plan: plans[index], reference });
  }
  const definitions = controlDefinitions(context);
  equal(fileSha(data.controlPlanRef.path), data.controlPlanRef.sha256);
  equal(json(data.controlPlanRef.path), definitions);
  equal(data.controls.length, definitions.length);
  for (let index = 0; index < definitions.length; index++) {
    const expected = definitions[index], control = data.controls[index];
    equal(control.target, expected.target); equal(control.plan, expected.plan); equal(control.type, expected.type);
    equal(control.setup.map(receipt => receipt.command), expected.plan.setupCommands);
    for (const phase of expected.type === 'negative' ? phases : ['baseline', 'restored']) {
      validateContentNative({ receipt: control[phase], phase, target: expected.target, plan: expected.plan });
    }
  }
  equal(data.lexical.map(control => control.origin), ['source', 'package']);
  for (const control of data.lexical) {
    const parent = data.controls.find(row => row.target.origin === control.origin && row.target.host === 'copilot');
    const titles = nodeNames(context.source, ['TEST-TW-PH-001', 'TEST-TW-PH-002', 'TEST-TW-PH-003']);
    equal(control.plan.command, [context.node, '--test', `--test-reporter=${path.join(context.source, 'scripts/release-host-events.mjs')}`,
      '--test-name-pattern', `^(?:${titles.map(escape).join('|')})$`, path.join(parent.plan.originRoot, nodeTest)]);
    equal(control.plan.source, parent.plan.source); equal(control.plan.targetNames, titles);
    validateContentNative({ receipt: control.receipt, phase: 'baseline', target: {}, plan: control.plan });
  }
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === self && process.argv[2] === '--inventory') {
  const input = json(process.argv[3]);
  test('content inventory oracle', () => assertContentInventory(input));
}
