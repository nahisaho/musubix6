import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ensure, equal, fileSha, json, mkdir, save, execute, retainProcess, readRef, waitForProcessExit } from './release-qualification-io.mjs';
import { parseEvents, namedControl, processControl, ownedAssertion } from './release-qualification-evidence.mjs';
import { contentCaseCatalogue, runContentCell, validateContentRun } from './release-qualification-content-mutations.mjs';

const skillScripts = '.github/skills/lean-sdd-tdd/scripts';
export const unresolvedMechanisms = Object.freeze({});

export function applyLiteralEdit(text, { before, after, count }) {
  ensure(before && before !== after, 'empty or no-op mutation');
  equal(text.split(before).length - 1, count);
  ensure(Number.isSafeInteger(count) && count > 0, 'positive exact mutation count required');
  return text.split(before).join(after);
}

export function validateCandidateTree(source) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    ensure(entry.name !== '.git', 'unexpected Git metadata in candidate tree');
    if (entry.isDirectory()) validateCandidateTree(path.join(source, entry.name));
  }
}

function testFiles(source) {
  const command = json(path.join(source, 'package.json')).scripts.test;
  ensure(command.startsWith('node --test '), 'unsupported root test command');
  const files = command.split(/\s+/).filter(arg => arg.endsWith('.test.mjs'));
  ensure(files.length > 0 && files.every(file => !file.includes('..') && fs.existsSync(path.join(source, file))),
    'root test registration files unavailable');
  return files;
}

export async function discoverCurrentCatalogue({ source, node20, output, environment }) {
  mkdir(output);
  const reporter = path.join(source, 'scripts/release-host-events.mjs');
  const command = [node20, '--test', `--test-reporter=${reporter}`, '--test-name-pattern', '(?!)',
    ...testFiles(source).map(file => path.join(source, file))];
  const result = await execute({ command, cwd: source, env: environment, timeoutMs: 120000 });
  const evidence = retainProcess(output, result);
  ensure(result.exit === 0 && !result.error && !result.signal && !result.timedOut, 'current registration discovery failed');
  const parsed = parseEvents(result.stdout);
  ensure(parsed.rows.every(row => row.filtered && !row.todo && !row.failed), 'discovery must execute no test body');
  ensure(parsed.rows.every(row => !row.name.endsWith('.test.mjs')), 'runtime did not disclose registered names; use genuine Node20 discovery');
  return { names: parsed.rows.map(row => row.name), files: testFiles(source), evidence };
}

export function assertionCatalogue(source, suite, title, expectedNeedle, nodeModules) {
  const require = createRequire(path.join(source, 'package.json'));
  const ts = require(nodeModules ? path.join(nodeModules, 'typescript') : 'typescript');
  const filename = path.join(source, suite), text = fs.readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = new Map(), tests = [];
  function collect(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.set(node.name.text, node.initializer);
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'test' &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === title) tests.push(node);
    ts.forEachChild(node, collect);
  }
  collect(tree);
  ensure(tests.length === 1, `independent test ownership unresolved: ${title}`);
  const assertions = new Map(), visited = new Set();
  function visit(node) {
    if (ts.isIdentifier(node) && functions.has(node.text) && ts.isCallExpression(node.parent) &&
      node.parent.arguments.includes(node) && !visited.has(node.text)) {
      visited.add(node.text);
      visit(functions.get(node.text));
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(tree);
      if (callee.startsWith('assert.')) assertions.set(
        tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, node.getText(tree));
      if (functions.has(callee) && !visited.has(callee)) {
        visited.add(callee);
        visit(functions.get(callee));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tests[0]);
  let lines = [...assertions.keys()].sort((a, b) => a - b);
  if (expectedNeedle) {
    const needles = Array.isArray(expectedNeedle) ? expectedNeedle : [expectedNeedle];
    const sourceLines = text.split('\n');
    const matched = needles.map(needle => lines.filter(line =>
      assertions.get(line).includes(needle) || sourceLines[line - 1].includes(needle)));
    ensure(matched.every(matches => matches.length > 0), `exact expected assertion anchor unresolved: ${title}/${expectedNeedle}`);
    lines = [...new Set(matched.flat())].sort((a, b) => a - b);
  }
  ensure(lines.length > 0, `no independently owned assertion: ${title}`);
  return { sourceTest: filename, assertionLines: lines };
}

export function cellCatalogue(manifest, cell, source) {
  if (['skill-mutation', 'placeholder-mutation'].includes(cell.kind)) {
    return contentCaseCatalogue(json(path.join(source, '.sdd/release-content-mutations.v0.2.3.json')), cell.id);
  }
  if (cell.mode === 'package') return [{ name: cell.id, runtimeMajor: Number(cell.runtime),
    packagePath: manifest.execution.packagePath, packageSha256: manifest.execution.packageSha256 }];
  if (cell.kind === 'suite') return manifest.catalogues.regressions.map(name => ({ name }));
  if (cell.kind === 'watchdog') return manifest.catalogues.watchdog.map(name => ({ name }));
  if (cell.kind === 'scope') return manifest.catalogues.scope.map(name => ({ name }));
  if (cell.kind === 'oracle') return manifest.catalogues.oracles.map(name => ({ name }));
  if (cell.kind === 'process') return ['exit0', 'exit17', 'timeout', 'output-budget', 'descendant-cleanup'].map(name => ({ name }));
  if (cell.kind === 'mutation') return manifest.catalogues.mutations.mutations.map(row => ({
    ...row, name: row.id, targetName: row.name,
    ...assertionCatalogue(source, row.suite, row.name, row.expectedAssertion, manifest.execution?.nodeModules),
  }));
  if (cell.kind === 'diagnostic-mutation') {
    const suites = ['diagnostics.test.mjs', 'diagnostics-profiles.test.mjs'].map(file => `${skillScripts}/${file}`);
    return manifest.catalogues.diagnosticMutations.map(([name, file, before, after, id]) => {
      const targets = suites.flatMap(suite =>
        [...fs.readFileSync(path.join(source, suite), 'utf8').matchAll(/^test\('([^']+)'/gm)]
          .filter(match => match[1].startsWith(id + ' ')).map(match => ({ suite, title: match[1] })));
      ensure(targets.length === 1, `diagnostic target unavailable: ${id}`);
      const { suite, title } = targets[0];
      return { id: name, name, targetName: title, suite, files: [`${skillScripts}/${file}`],
        edits: [{ file: `${skillScripts}/${file}`, before, after, count: 1 }],
        ...assertionCatalogue(source, suite, title, undefined, manifest.execution?.nodeModules) };
    });
  }
  if (cell.kind === 'host-mutation') {
    // Resolved in the orchestration module from the retained parent's executable catalogue.
    return manifest.execution.hostCatalogue.map(row => ({ ...row,
      sourceTest: path.join(source, 'scripts/host-compatibility.test.mjs') }));
  }
  return [{ name: cell.id }];
}

export function commandForCell(cell, files) {
  if (cell.kind === 'suite') return ['{node}', '--test', '--test-reporter={source}/scripts/release-host-events.mjs',
    ...files.map(file => `{source}/${file}`)];
  if (cell.kind === 'watchdog') return ['{node}', '--test', '--test-reporter={source}/scripts/release-host-events.mjs',
    '{source}/.github/skills/agent-watchdog/scripts/watchdog.test.mjs'];
  if (cell.kind === 'scope') return ['{node}', '--test', '--test-reporter={source}/scripts/release-host-events.mjs',
    '--test-name-pattern', '^r24d scope differential ', `{source}/${skillScripts}/sdd.test.mjs`];
  if (cell.kind === 'oracle') return ['{node}', '--test', '--test-reporter={source}/scripts/release-host-events.mjs',
    '{source}/scripts/release-qualification-oracles.test.mjs'];
  if (cell.kind === 'process') return ['{node}', '--test', '--test-reporter={source}/scripts/release-host-events.mjs',
    '{source}/scripts/release-qualification-process.test.mjs'];
  if (cell.kind === 'host-mutation') return ['{node}', '{source}/scripts/release-host-mutations.mjs'];
  if (cell.kind === 'gate') return ['{node}', `{source}/${skillScripts}/sdd.mjs`, 'gate'];
  return ['{node}', '{source}/scripts/release-qualification-cells.mjs', '--cell', cell.id, '--context', '{context}'];
}

async function runRecorded(context, name, command, expectedExit = 0, cwd = context.source) {
  const result = await execute({ command, cwd, env: context.environment, timeoutMs: context.cell.timeoutSeconds * 1000 });
  const evidence = retainProcess(path.join(context.output, name), result);
  processControl(evidence, expectedExit);
  return evidence;
}

async function mutations(context) {
  const cases = [];
  for (const target of context.catalogue) {
    const source = path.join(context.output, 'mutations', target.name, 'source');
    mkdir(path.dirname(source));
    fs.cpSync(context.source, source, { recursive: true, dereference: false, filter: file => {
      const relative = path.relative(context.source, file);
      return !relative.split(path.sep).some(part => ['.git', 'node_modules'].includes(part));
    } });
    if (fs.existsSync(path.join(context.source, 'node_modules'))) {
      fs.symlinkSync(fs.realpathSync(path.join(context.source, 'node_modules')), path.join(source, 'node_modules'), 'dir');
    }
    const reporter = path.join(source, 'scripts/release-host-events.mjs');
    const command = [context.node, '--test', `--test-reporter=${reporter}`, '--test-name-pattern',
      '^' + target.targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', path.join(source, target.suite)];
    const owned = { ...target, sourceTest: path.join(source, target.suite) };
    const one = async (phase, exit) => {
      const evidence = await runRecorded(context, `${target.name}-${phase}`, command, exit, source);
      const parsed = parseEvents(readRef(evidence.stdout));
      const selected = namedControl(parsed, [target.targetName], { failedTarget: exit === 1 ? target.targetName : null })[0];
      if (exit === 1) {
        ensure(ownedAssertion(selected.error, owned.sourceTest, target.assertionLines), `mutant missed its owned assertion: ${target.name}`);
        if (target.expectedReason) ensure(new RegExp(target.expectedReason).test(selected.error.message), 'mutant failed wrong expected reason');
      }
      return { ...evidence, sourceTest: owned.sourceTest };
    };
    const originals = new Map(target.files.map(file => [file, fs.readFileSync(path.join(source, file))]));
    const originalSha256 = fileSha(path.join(source, target.files[0]));
    const baseline = await one('baseline', 0);
    let mutant;
    try {
      for (const edit of target.edits) {
        const file = path.join(source, edit.file), text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, applyLiteralEdit(text, edit));
      }
      mutant = await one('mutant', 1);
    } finally { for (const [file, bytes] of originals) fs.writeFileSync(path.join(source, file), bytes); }
    const restored = await one('restored', 0);
    for (const [file, bytes] of originals) equal(fs.readFileSync(path.join(source, file)), bytes);
    cases.push({ name: target.name, sourceTest: owned.sourceTest, baseline, mutant, restored,
      originalSha256, restoredSha256: fileSha(path.join(source, target.files[0])) });
    fs.rmSync(source, { recursive: true, force: true });
  }
  return { status: 'PASS', cases };
}

async function nativeR(context) {
  const work = path.join(context.output, 'r-native');
  mkdir(work);
  save(path.join(work, 'test-native.R'),
    'testthat::test_that("native addition", { testthat::expect_equal(add(1, 2), 3) })\n');
  save(path.join(work, 'recorder.R'),
    'args <- commandArgs(TRUE)\nsource(args[1])\nr <- as.data.frame(testthat::test_file(args[2], reporter="silent"))\n' +
    'cat(sprintf("RELQ_R_JSON {\\"tests\\":%d,\\"pass\\":%d,\\"fail\\":%d,\\"skipped\\":%d,\\"errors\\":%d}\\n",' +
    'nrow(r),sum(r$passed),sum(r$failed),sum(r$skipped),sum(r$error)))\n' +
    'quit(status=if(sum(r$failed)+sum(r$error)>0) 1 else 0)\n');
  const controls = [];
  for (const phase of ['baseline', 'mutant', 'restored']) {
    save(path.join(work, 'add.R'), `add <- function(a,b) ${phase === 'mutant' ? 'a-b' : 'a+b'}\n`, false);
    const evidence = await runRecorded(context, `r-${phase}`,
      [context.tools.Rscript, path.join(work, 'recorder.R'), path.join(work, 'add.R'), path.join(work, 'test-native.R')],
      phase === 'mutant' ? 1 : 0, work);
    controls.push({ phase, evidence });
  }
  return { status: 'PASS', controls };
}

async function nativeGradle(context) {
  const jars = context.configuration.gradleJars;
  ensure(Array.isArray(jars) && jars.length > 0 && jars.every(file => fs.existsSync(file)), 'pinned offline Gradle JUnit dependencies required');
  const work = path.join(context.output, 'gradle-native');
  mkdir(work);
  save(path.join(work, 'settings.gradle'), 'rootProject.name = "release-native-control"\n');
  save(path.join(work, 'build.gradle'), `plugins { id 'java' }\ndependencies { testImplementation files(${jars.map(file => JSON.stringify(file)).join(',')}) }\n`);
  const target = path.join(work, 'src/test/java/NativeTest.java');
  const controls = [];
  for (const phase of ['baseline', 'mutant', 'restored']) {
    save(target, `import org.junit.Test; import static org.junit.Assert.*; public class NativeTest {\n` +
      `@Test public void addition() { assertEquals(3, ${phase === 'mutant' ? '1-2' : '1+2'}); }\n}\n`, false);
    const evidence = await runRecorded(context, `gradle-${phase}`, [context.tools.gradle, '--offline', '--no-daemon',
      '--gradle-user-home', path.join(context.output, 'gradle-home'), 'cleanTest', 'test', '--rerun-tasks'],
    phase === 'mutant' ? 1 : 0, work);
    const results = path.join(work, 'build/test-results/test');
    ensure(fs.existsSync(results), 'Gradle did not produce native test reports');
    const reports = fs.readdirSync(results).filter(file => /^TEST-.*\.xml$/.test(file))
      .map(file => save(path.join(context.output, `gradle-${phase}`, file), fs.readFileSync(path.join(results, file))));
    ensure(reports.length > 0, 'Gradle NO-SOURCE/zero-test outcome');
    controls.push({ phase, evidence, reports });
  }
  return { status: 'PASS', controls };
}

async function nativeProse(context) {
  const python = context.configuration.prosePython;
  ensure(python && fs.existsSync(python), 'pinned GiNZA 5.3 Python environment required');
  const evidence = await runRecorded(context, 'prose',
    [python, path.join(context.source, '.github/skills/japanese-prose/scripts/test_engine.py'), '-v']);
  return { status: 'PASS', evidence };
}

async function noChange(context) {
  const work = path.join(context.output, 'unchanged');
  mkdir(work);
  save(path.join(work, 'package.json'), '{"type":"module"}\n');
  save(path.join(work, 'app/package.json'), '{"type":"module","scripts":{"test":"node --test a.test.mjs"}}\n');
  save(path.join(work, 'app/data.json'), '{}\n');
  save(path.join(work, 'app/a.mjs'), '/** @id CODE-A-001 @implements REQ-A-001 */\nexport const a=1;\n');
  save(path.join(work, 'app/a.test.mjs'),
    'import {test} from "node:test"; import assert from "node:assert/strict"; import {a} from "./a.mjs";\n' +
    '/** @id TEST-A-001 @verifies REQ-A-001 */\ntest("TEST-A-001",()=>assert.equal(a,1));\n');
  save(path.join(work, '.sdd/specs/a.md'), '---\nfeature: a\ntier: T1\n---\nREQ-A-001: The value shall be one.\n');
  const command = (...args) => [context.node, path.join(context.source, skillScripts, 'sdd.mjs'), ...args];
  const receipts = [];
  receipts.push(await runRecorded(context, 'fixture-init', command('init'), 0, work));
  save(path.join(work, '.sdd/config.json'), {
    schemaVersion: 1, testCmd: [context.node, '--test', '--test-name-pattern', '{id}', '{file}'],
    checks: [], scopePolicy: 'strict', projects: [{
      root: 'app', testCmd: [context.node, '--test', '--test-name-pattern', '{id}', '{file}'],
      checks: [{ name: 'test', cmd: [context.node, '--test', 'a.test.mjs'] }],
    }],
  }, false);
  for (const args of [['tdd', 'red', 'TEST-A-001', '--characterization', 'fixture stable valid control'],
    ['tdd', 'green', 'TEST-A-001']]) receipts.push(await runRecorded(context, `fixture-${receipts.length}`, command(...args), 0, work));
  for (const argv of [['git', 'init', '-q'], ['git', 'add', '.'], ['git', '-c', 'user.name=Qualification Fixture',
    '-c', 'user.email=qualification@example.invalid', 'commit', '-qm', 'unchanged fixture']]) {
    receipts.push(await runRecorded(context, `fixture-${receipts.length}`, argv, 0, work));
  }
  save(path.join(work, 'app/data.json'), '{"changed":true}\n', false);
  const changed = await runRecorded(context, 'changed-gate', command('gate', '--changed'), 0, work);
  ensure(/✓ cmd app:test /.test(readRef(changed.stdout)), 'changed project positive control did not execute its test');
  receipts.push(changed);
  save(path.join(work, 'app/data.json'), '{}\n', false);
  const before = fileSha(path.join(work, '.sdd/tdd.jsonl'));
  const last = await runRecorded(context, 'unchanged-gate', command('gate', '--changed'), 0, work);
  receipts.push(last);
  ensure(/cmd app:test: no changed files/.test(readRef(last.stdout)), 'no-change gate did not disclose unchanged scope');
  return { status: 'PASS', receipts, beforeLedgerSha256: before, afterLedgerSha256: fileSha(path.join(work, '.sdd/tdd.jsonl')) };
}

async function processSelftest(context) {
  const cases = [];
  const specs = [
    ['exit0', 'process.stdout.write("out"); process.stderr.write("err")', 0, 10000],
    ['exit17', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(17)', 17, 10000],
    ['timeout', 'setInterval(()=>{},1000)', null, 150],
    ['output-budget', 'process.stdout.write("x".repeat(8192)); setInterval(()=>{},1000)', null, 10000],
    ['descendant-cleanup', 'const {spawn}=require("child_process");const p=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});p.unref();console.log(p.pid)', 0, 10000],
  ];
  for (const [name, program, expected, timeoutMs] of specs) {
    const result = await execute({ command: [context.node, '-e', program], cwd: context.source,
      env: context.environment, timeoutMs, maxBytes: name === 'output-budget' ? 1024 : undefined });
    const evidence = retainProcess(path.join(context.output, name), result);
    if (name === 'timeout') ensure(result.timedOut, 'watchdog failed to time out real process');
    else if (name === 'output-budget') ensure(result.outputLimit, 'output budget was not enforced');
    else equal(result.exit, expected);
    if (name === 'descendant-cleanup') {
      const pid = Number(result.stdout.trim());
      ensure(Number.isSafeInteger(pid) && pid > 1, 'descendant PID missing');
      const failures = [];
      try { await waitForProcessExit(pid); }
      catch (error) { failures.push(error); }
      try { process.kill(pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'descendant observation/cleanup failed');
    }
    cases.push({ name, evidence });
  }
  return { status: 'PASS', cases };
}

export async function runAdapter(context) {
  if (['skill-mutation', 'placeholder-mutation'].includes(context.cell.kind)) return runContentCell(context);
  if (unresolvedMechanisms[context.cell.id]) return { status: 'INCOMPLETE', blockers: [unresolvedMechanisms[context.cell.id]] };
  if (['mutation', 'diagnostic-mutation'].includes(context.cell.kind)) return mutations(context);
  if (context.cell.kind === 'process') return processSelftest(context);
  if (context.cell.mode === 'r') return nativeR(context);
  if (context.cell.mode === 'gradle') return nativeGradle(context);
  if (context.cell.mode === 'prose') return nativeProse(context);
  if (context.cell.mode === 'no-change') return noChange(context);
  if (context.cell.mode === 'package') {
    const { verifyOnePackage } = await import('./release-qualification.mjs');
    return { status: 'PASS', packageReceipt: await verifyOnePackage({
      packagePath: context.configuration.packagePath, packageSha256: context.configuration.packageSha256,
      targetVersion: '0.2.3', runtime: context.configuration.runtimes.find(row => String(row.major) === context.cell.runtime),
      workRoot: path.join(context.output, 'install'), environment: context.environment,
    }) };
  }
  throw new Error(`unknown mandatory cell adapter: ${context.cell.id}`);
}

export function validateAdapter({ cell, catalogue, evidence }) {
  const { text } = processControl(evidence);
  const data = JSON.parse(text);
  ensure(data.status === 'PASS', `${cell.id}: ${(data.blockers || []).join('; ') || 'adapter incomplete'}`);
  if (['skill-mutation', 'placeholder-mutation'].includes(cell.kind)) return validateContentRun({ cell, catalogue, evidence, data });
  if (cell.mode === 'r' || cell.mode === 'gradle') {
    equal(data.controls.map(row => row.phase), ['baseline', 'mutant', 'restored']);
    for (const row of data.controls) {
      const { text: stdout } = processControl(row.evidence, row.phase === 'mutant' ? 1 : 0);
      if (cell.mode === 'r') {
        const matches = [...stdout.matchAll(/^RELQ_R_JSON (.+)$/gm)];
        ensure(matches.length === 1, 'native R result missing');
        const counts = JSON.parse(matches[0][1]);
        ensure(counts.tests === 1 && counts.skipped === 0 && counts.errors === 0 &&
          counts.fail === (row.phase === 'mutant' ? 1 : 0) && counts.pass === (row.phase === 'mutant' ? 0 : 1), 'invalid native R counts');
      } else {
        ensure(row.reports.length === 1 && !/^> Task :test (?:NO-SOURCE|SKIPPED)\b/m.test(stdout), 'Gradle target did not execute');
        const xml = readRef(row.reports[0]);
        const suite = /<testsuite\b([^>]*)>/.exec(xml);
        ensure(suite, 'native Gradle XML missing');
        const attr = name => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(suite[1])?.[1]);
        ensure(attr('tests') === 1 && attr('skipped') === 0 && attr('errors') === 0 &&
          attr('failures') === (row.phase === 'mutant' ? 1 : 0), 'invalid Gradle native counts');
        if (row.phase === 'mutant') ensure(/AssertionError|expected:&lt;3&gt;/.test(xml), 'native Gradle mutant was not assertion-detected');
      }
    }
  } else if (cell.mode === 'prose') {
    const { text: stdout, stderr } = processControl(data.evidence);
    const log = stdout + stderr;
    const count = /Ran (\d+) tests? in/.exec(log);
    ensure(count && +count[1] > 0 && /\nOK\s*$/.test(log) &&
      !/skipped|expected failures|unexpected success|FAILED \(/i.test(log), 'prose requires real positive counts without skips');
  } else if (cell.mode === 'no-change') {
    ensure(data.receipts.length >= 7, 'missing no-change controls');
    for (const receipt of data.receipts) processControl(receipt);
    ensure(/cmd app:test: no changed files/.test(readRef(data.receipts.at(-1).stdout)) &&
      data.receipts.some(receipt => /✓ cmd app:test /.test(readRef(receipt.stdout))),
    'unchanged and changed project controls did not prove their independent scope');
  } else if (cell.mode === 'package') {
    const receipt = data.packageReceipt;
    ensure(catalogue?.length === 1 && receipt.tgzPath === catalogue[0].packagePath &&
      receipt.tgzSha256 === catalogue[0].packageSha256 &&
      fileSha(catalogue[0].packagePath) === catalogue[0].packageSha256, 'package receipt not bound to the frozen artifact');
    ensure(receipt.runtimeMajor === Number(cell.runtime) && receipt.installedVersion === '0.2.3' &&
      receipt.offline && receipt.entrypoint === 'node_modules/.bin/musubix6', 'package runtime/entrypoint mismatch');
    const log = JSON.parse(readRef(receipt.log));
    ensure(log.commands?.length >= 3, 'real package command receipts missing');
    for (const command of log.commands) processControl(command);
    ensure(Object.keys(receipt.inventories).length === 2, 'missing copied host inventory');
  } else if (cell.kind === 'process') {
    equal(data.cases.map(row => row.name), ['exit0', 'exit17', 'timeout', 'output-budget', 'descendant-cleanup']);
    for (const row of data.cases) {
      readRef(row.evidence.stdout); readRef(row.evidence.stderr);
      if (row.name === 'timeout') ensure(row.evidence.timedOut, 'real timeout receipt required');
      else if (row.name === 'output-budget') ensure(row.evidence.outputLimit, 'real output-budget receipt required');
      else processControl(row.evidence, row.name === 'exit17' ? 17 : 0);
    }
  } else throw new Error(`no independent adapter verdict for ${cell.id}`);
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    ensure(process.argv.length === 6 && process.argv[2] === '--cell' && process.argv[4] === '--context', 'exact --cell ID --context FILE required');
    const context = json(process.argv[5]);
    ensure(context.cell.id === process.argv[3], 'cell context mismatch');
    const result = await runAdapter(context);
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'PASS' ? 0 : 2;
  } catch (error) {
    console.log(JSON.stringify({ status: 'FAIL', errors: [error.message] }));
    process.exitCode = 1;
  }
}
