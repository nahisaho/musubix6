import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLiteralEdit } from './release-qualification-cells.mjs';
import { ensure, equal, mkdir, save, execute, cleanEnvironment, retainProcess, fileSha } from './release-qualification-io.mjs';

const core = 'scripts/release-qualification.mjs';
const evidence = 'scripts/release-qualification-evidence.mjs';
const io = 'scripts/release-qualification-io.mjs';
const cli = 'scripts/release-qualification-cli.mjs';
export const sensitivities = [
  ['matrix-equality', '001', core, 'equal(sortedCells(plan.requiredCells), sortedCells(required));', '/* isolated matrix omission */'],
  ['artifact-lock', '001', core, 'for (const relative of locked) equal(fileSha(path.join(paths.root, relative)), approval.artifacts[relative]);', '/* isolated artifact lock omission */'],
  ['frozen-bytes', '002', core, 'for (const file of manifest.files) equal(fingerprint(file.path), file.fingerprint);', '/* isolated input fingerprint omission */'],
  ['tool-probe', '002', core, 'ensure(current.exit === 0 && current.signal === null', 'ensure(true || current.exit === 0 && current.signal === null'],
  ['regression-catalogue', '002', core, 'ensure(catalogues.regressions.includes(name),', 'ensure(true || catalogues.regressions.includes(name),'],
  ['exit-verdict', '003', evidence, 'equal(evidence.exit, expectedExit);', '/* isolated exit verdict omission */'],
  ['log-digest', '003', io, 'equal(fileSha(ref.path), ref.sha256);', '/* isolated retained digest omission */'],
  ['selected-skip', '003', evidence, 'ensure(!row.skip && !row.todo && row.failed ===', 'ensure(true || !row.skip && !row.todo && row.failed ==='],
  ['owned-frame-identity', '003', evidence, 'export function ownedAssertion(error, source, lines) {',
    'export function ownedAssertion(error, source, lines) {\n  return typeof error?.stack === "string" && Array.isArray(lines) && lines.some(line => error.stack.includes(`${source}:${line}:`));'],
  ['restored-control', '003', evidence, "for (const stage of ['baseline', 'mutant', 'restored'])", "for (const stage of ['baseline', 'mutant'])"],
  ['streak-reset', '004', core, "streak = row.status === 'PASS' ? Math.min(2, streak + 1) : 0;", "streak = row.status === 'PASS' ? Math.min(2, streak + 1) : streak;"],
  ['fresh-state', '004', core, "path.isAbsolute(root) && !used.has(root)", 'path.isAbsolute(root)'],
  ['immutable-failure', '004', core, 'ensure(request.run.id && !history.some(row => row.run.id === request.run.id),',
    'ensure(true || request.run.id && !history.some(row => row.run.id === request.run.id),'],
  ['history-tail-anchor', '004', core,
    'equal(head, { entries: rows.length, tailSha256: sha(lines.at(-1)), historySha256: sha(text) });',
    '/* isolated history truncation guard omission */'],
  ['native-gate-header', '003', core, '/^SDD GATE PASS$/m.test(text)', '/^GATE PASS$/m.test(text)'],
  ['preflight-canonical-output', '002', cli, 'externalOutput(source, configuration.workRoot);',
    '/* isolated canonical output guard omission */'],
  ['historical-command-is-data', '002', cli,
    "historical.command === 'bash' ? ['--version'] : historical.args", 'historical.args'],
  ['durable-entry-module-cycle', '005', core,
    "import('./release-qualification-cli.mjs').then(({ main }) => main(process.argv.slice(2))).then(code => {",
    "await import('./release-qualification-cli.mjs').then(({ main }) => main(process.argv.slice(2))).then(code => {"],
  ['preparation-private-home', '002', cli,
    'path.join(configuration.workRoot, `${phase}-home`))', 'configuration.environment.HOME)'],
  ['observed-input-reset', '004', cli, "if (checked.status !== 'PASS') await must(recordRun({",
    "if (false && checked.status !== 'PASS') await must(recordRun({"],
  ['native-event-counts', '003', evidence, 'equal(nativeCounts, counts);', '/* isolated native count agreement omission */'],
  ['native-summary-counts', '003', evidence, 'equal(reported, counts);', '/* isolated Node24 summary agreement omission */'],
  ['native-todo-counts', '003', evidence,
    'const counts = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,\n    fail: rows.filter(r => r.failed && !r.todo && !r.skip).length,',
    'const counts = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,\n    fail: rows.filter(r => r.failed).length,'],
  ['tap-todo-counts', '003', evidence,
    'const observed = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,\n    fail: rows.filter(r => r.failed && !r.todo && !r.skip).length,',
    'const observed = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,\n    fail: rows.filter(r => r.failed).length,'],
  ['finding-scope', '004', core,
    "ensure(['in-scope', 'out-of-scope'].includes(finding.scope), 'unclassified finding scope blocks readiness');",
    '/* isolated finding scope classification omission */'],
  ['finding-workaround', '004', core,
    "typeof finding.workaround === 'string' && finding.workaround.trim()", 'finding.workaround'],
  ['package-evidence', '005', core, 'function validatePackageReceipts(request) {', 'function validatePackageReceipts(request) {\n  return;'],
  ['native-timeout', 'process', io, 'timedOut = true; terminate();', 'terminate();'],
  ['native-output-budget', 'process', io, 'outputLimit = true; terminate();', 'terminate();'],
  ['ordinary-descendants', 'process', io, "if (child.pid) signalGroup('SIGKILL');",
    "/* isolated descendant cleanup omission */"],
];

export async function prove({ source, output }) {
  ensure(!fs.existsSync(output), 'fresh sensitivity output required');
  mkdir(output);
  const copy = path.join(output, 'source');
  fs.cpSync(source, copy, { recursive: true, filter: file => {
    const relative = path.relative(source, file);
    return !relative.split(path.sep).some(part => ['.git', 'node_modules', '.release-qualification-test-work'].includes(part));
  } });
  const env = { ...cleanEnvironment(process.env, process.env.PATH), QUALIFY_DEVELOPMENT_DIR: path.join(output, 'fixtures') };
  env.TMPDIR = path.join(output, 'work'); mkdir(env.TMPDIR);
  const cases = [];
  for (const [name, id, relative, before, after] of sensitivities) {
    const file = path.join(copy, relative), original = fs.readFileSync(file, 'utf8');
    const command = [process.execPath, '--test', '--test-reporter=tap',
      ...(id === 'process' ? [] : ['--test-name-pattern', `^TEST-RELQ-${id} `]),
      path.join(copy, 'scripts', id === 'process' ? 'release-qualification-process.test.mjs' : 'release-qualification.test.mjs')];
    const run = async (phase, expected) => {
      const result = await execute({ command, cwd: copy, env, timeoutMs: 120000 });
      const retained = retainProcess(path.join(output, name, phase), result);
      equal(result.exit, expected);
      ensure(!result.error && !result.timedOut && !result.signal, `${name}: runner setup failure`);
      if (expected === 1) ensure(result.stdout.includes('ERR_ASSERTION'), `${name}: mutant was not assertion-detected`);
      return retained;
    };
    const baseline = await run('baseline', 0);
    let mutant;
    try { fs.writeFileSync(file, applyLiteralEdit(original, { before, after, count: 1 })); mutant = await run('mutant', 1); }
    finally { fs.writeFileSync(file, original); }
    const restored = await run('restored', 0);
    equal(fs.readFileSync(file, 'utf8'), original);
    cases.push({ name, relative, baseline, mutant, restored, restoredSha256: fileSha(file) });
  }
  const result = { status: 'PASS', cases };
  save(path.join(output, 'proof.json'), result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    ensure(process.argv.length === 4, 'SOURCE OUTPUT required');
    console.log(JSON.stringify(await prove({ source: path.resolve(process.argv[2]), output: path.resolve(process.argv[3]) })));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
