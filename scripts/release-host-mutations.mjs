import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertionFrame } from './release-qualification-evidence.mjs';

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const successCounts = { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
const failureCounts = { ...successCounts, pass: 0, fail: 1 };

function assertOutside(source, output) {
  assert.ok(path.relative(source, output).startsWith('..' + path.sep), 'evidence must be outside the source');
}

/** @id CODE-RELQ-HOST-004 @implements REQ-RELQ-003 */
export function prepareHostOutput(source, output) {
  const canonicalSource = fs.realpathSync(source);
  const requested = path.resolve(output);
  const canonicalOutput = fs.existsSync(requested) ? fs.realpathSync(requested) :
    path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
  assertOutside(canonicalSource, canonicalOutput);
  if (!fs.existsSync(canonicalOutput)) fs.mkdirSync(canonicalOutput);
  assert.ok(fs.statSync(canonicalOutput).isDirectory(), 'evidence output must be a directory');
  return canonicalOutput;
}

/** @id CODE-RELQ-HOST-003 @implements REQ-RELQ-003 */
export function parseHostEvidence(text, { test, testNames, expectedLines, sourceTest }) {
  assert.ok(expectedLines.length > 0 && expectedLines.every(line => Number.isSafeInteger(line) && line > 0),
    'positive integer assertion lines required');
  assert.equal(typeof sourceTest, 'string', 'source path required');
  assert.ok(path.isAbsolute(sourceTest), 'absolute source path required');
  const events = text.trim().split('\n').map(line => JSON.parse(line));
  const rows = events.filter(event => ['test:pass', 'test:fail'].includes(event.type) && event.data?.nesting === 0);
  assert.equal(new Set(testNames).size, testNames.length, 'duplicate expected host names');
  assert.equal(new Set(rows.map(row => row.data.name)).size, rows.length, 'duplicate native targets');
  assert.ok(rows.every(row => testNames.includes(row.data.name)), 'unknown native target');
  const selected = rows.filter(row => row.data.name.startsWith(test + ' '));
  assert.equal(selected.length, 1, 'exactly one named target must execute');
  assert.ok([undefined, false].includes(selected[0].data.skip), 'selected case skipped');
  assert.ok([undefined, false].includes(selected[0].data.todo), 'selected case TODO');
  const filtered = rows.filter(row => row !== selected[0]);
  assert.ok(filtered.every(row => row.type === 'test:pass' &&
    row.data.skip === 'test name does not match pattern' && [undefined, false].includes(row.data.todo)),
  'only explicit nonselected cases may be filtered');
  const plans = events.filter(event => event.type === 'test:plan' && event.data?.nesting === 0);
  assert.equal(plans.length, 1, 'one native plan required');
  assert.equal(plans[0].data.count, rows.length, 'native plan count differs');
  let error = selected[0].data.details?.error;
  for (let depth = 0; error && depth < 8 && error.code !== 'ERR_ASSERTION'; depth++) error = error.cause;
  const stack = error?.code === 'ERR_ASSERTION' && typeof error.stack === 'string' ? error.stack : '';
  const frame = stack ? assertionFrame(error) : '';
  const assertionLines = expectedLines.filter(line =>
    [sourceTest, pathToFileURL(sourceTest).href].some(file => {
      const quoted = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^\\s*at\\s+(?:[^\\n]*\\()?${quoted}:${line}:\\d+\\)?\\s*$`, 'm').test(frame);
    }));
  const failed = selected[0].type === 'test:fail';
  return {
    counts: { tests: 1, pass: failed ? 0 : 1, fail: failed ? 1 : 0, cancelled: 0, skipped: 0, todo: 0 },
    nativeCounts: { tests: rows.length, pass: failed ? 0 : 1, fail: failed ? 1 : 0, cancelled: 0, skipped: filtered.length, todo: 0 },
    filteredNames: filtered.map(row => row.data.name),
    assertion: failed && assertionLines.length > 0, assertionLines,
  };
}

export function replace(before, after, all = false) {
  assert.notEqual(before, after, 'no-op mutation');
  assert.ok(before.length > 0, 'empty mutation anchor');
  return text => {
    const count = text.split(before).length - 1;
    assert.ok(count > 0 && (all || count === 1), `mutation anchor count: ${count}; ${before}`);
    return all ? text.replaceAll(before, after) : text.replace(before, after);
  };
}

/** @id CODE-RELQ-HOST-001 @implements REQ-RELQ-003 REQ-RELQ-005 */
export function hostMutations(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/, 'stable version required');
  const cli = 'bin/musubix6.mjs';
  const wsl = '.github/skills/wslc-containers/SKILL.md';
  const unchanged = {
    success: 'assert.equal(result.status, 0, result.stdout + result.stderr);',
    malformed: 'assert.equal(result.status, 2, JSON.stringify(args) + result.stdout + result.stderr);',
    preserve: "assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), expected);",
  };
  const rows = [
    ['host-routing', '001', cli, replace("target === 'copilot' ? '.github' : '.claude'", "'.github'"),
      "assert.equal(fs.existsSync(path.join(dest, relative, 'lean-sdd-tdd/SKILL.md')), expected,"],
    ['host-value-consumption', '001', cli, replace('const value = args[++i];', 'const value = args[i + 1];'), unchanged.success],
    ['host-validation', '002', cli, replace("if (!['copilot', 'claude', 'both'].includes(value))", 'if (false)'), unchanged.malformed],
    ['duplicate-options', '002', cli, replace('if (seen.has(arg))', 'if (false)'), unchanged.malformed],
    ['explicit-watchdog', '002', cli, replace("if (host !== 'copilot' && only?.includes('agent-watchdog'))", 'if (false)'),
      'assert.equal(result.status, 2, result.stdout + result.stderr);'],
    ['implicit-watchdog', '002', cli, replace("if (target === 'claude' && name === 'agent-watchdog')", 'if (false)'),
      'assert.deepEqual(fs.readdirSync(path.join(dest, relative)).sort(), expected);'],
    ['validation-before-write', '002', cli, replace('const all = skills();', "mkdirSync(resolve(dir || '.'), { recursive: true });\n  const all = skills();"),
      "assert.equal(fs.existsSync(dest), false, 'reject the whole request before copying either host');"],
    ['legacy-diagnostic', '002', cli, replace("'--only requires a non-empty comma-separated skill list' :", "'--only requires a non-empty value' :"),
      'assert.match(result.stderr, /--only.*(?:requires|expected|missing|non.?empty)'],
    ['force-overwrite', '003', cli, replace('if (existsSync(to) && !force)', 'if (existsSync(to))'), unchanged.preserve],
    ['skip-preservation', '003', cli, replace('if (existsSync(to) && !force)', 'if (false)'), unchanged.preserve],
    ['skill-relative-path', '004', wsl, replace('bash "<skill-dir>/scripts/wslc.sh"', 'bash .github/skills/wslc-containers/scripts/wslc.sh', true),
      'assert.doesNotMatch(skill, /(?:bash|node|python3?|uv run)'],
    ['question-host-mapping', '004', '.github/skills/lean-agentic-coding/SKILL.md', replace('AskUserQuestion', 'UnavailableQuestion', true),
      'assert.match(skill, /AskUserQuestion/,'],
    ['question-rule-contradiction', '004', '.github/skills/sdd-spec-interview/SKILL.md',
      replace("via the host's native question tool, one field per form; use the conversational fallback only when that tool is unavailable.",
        'via `ask_user`, one field per form. No questions in plain text.'),
      'assert.match(questionRule, /host.*question tool.*fallback.*unavailable/,'],
    ['tool-restriction', '004', wsl, replace('name: wslc-containers', 'name: wslc-containers\nallowed-tools: shell'),
      'assert.doesNotMatch(skill, /allowed-tools:'],
    ['version', '005', 'package.json', replace(`"version": "${version}"`, `"version": "${version}-dev.0"`),
      'assert.equal(pkg.version,'],
    ...[['lock-version', null, 'assert.equal(lock.version, pkg.version);'],
      ['lock-root-version', '', "assert.equal(lock.packages[''].version, pkg.version);"]].map(([name, key, needle]) =>
      [name, '005', 'package-lock.json', text => {
        const lock = JSON.parse(text);
        const target = key === null ? lock : lock.packages[key];
        assert.equal(target.version, version);
        target.version = `${version}-dev.0`;
        return JSON.stringify(lock, null, 2) + '\n';
      }, needle]),
    ['packed-cli-version', '005', cli,
      replace("else if (cmd === '-v' || cmd === '--version') console.log(pkg.version);",
        `else if (cmd === '-v' || cmd === '--version') console.log('${version}-dev.0');`),
      "assert.equal(wrapper('--version').stdout.trim(),"],
    ['changelog-version', '005', 'CLANGELOG.md', replace(`## [${version}] - Unreleased`, `## [${version}-dev.1] - Unreleased`),
      "assert.match(fs.readFileSync(path.join(root, 'CLANGELOG.md'),"],
    ...['README.md', 'README-ja.md'].flatMap(file => [
      [`${file}-stable-version`, '005', file, replace(`**${version}**`, `**${version}-dev.0**`, true), 'assert.ok(body.includes(\'**'],
      [`${file}-availability`, '005', file, replace(`npm view musubix6@${version} version`, 'npm view musubix6@0.1.4 version', true),
        'assert.ok(body.includes(\'npm view'],
      [`${file}-false-publication`, '005', file, file === 'README.md'
        ? replace('a version string does not establish publication or release', 'a version string establishes publication and release')
        : replace('版番号だけでは、公開済みであることやリリース適格性を確認できません', '版番号で公開済みであることとリリース適格性を確認できます'),
      'assert.match(body.slice(0, 1000), notice,'],
      [`${file}-npx-availability`, '005', file, file === 'README.md'
        ? replace(`Before using this candidate, check \`npm view musubix6@${version} version\`.`, 'Before using this candidate, continue below.')
        : replace(`この候補を使う前に、\`npm view musubix6@${version} version\` で公開状況を確認してください。`, 'この候補を使う前に、次に進んでください。'),
      'assert.ok(updateBody.includes(\'npm view'],
    ]),
    ['packed-regression-omission', '005', 'package.json', text => {
      const pkg = JSON.parse(text);
      assert.ok(pkg.files.includes('scripts/host-compatibility.test.mjs'));
      pkg.files = pkg.files.filter(file => file !== 'scripts/host-compatibility.test.mjs');
      return JSON.stringify(pkg, null, 2) + '\n';
    }, "assert.ok(fs.existsSync(path.join(packed, 'scripts/host-compatibility.test.mjs')));"],
  ];
  return rows.map(([name, id, file, mutate, needle]) => ({
    name, test: `TEST-HOST-${id}`, file, mutate, expectedAssertionNeedles: [needle],
  }));
}

function executeTest({ node, source, scratch, output, mutation, phase, env, expectedLines }) {
  const testFile = path.join(source, 'scripts/host-compatibility.test.mjs');
  const reporter = fileURLToPath(new URL('./release-host-events.mjs', import.meta.url));
  const args = ['--test', `--test-reporter=${reporter}`, '--test-name-pattern', `^${mutation.test} `, testFile];
  const startedAt = new Date().toISOString();
  const result = spawnSync(node, args, {
    cwd: scratch, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  const log = path.join(output, `${mutation.name}-${phase}.log`);
  const text = result.stdout ?? '';
  fs.writeFileSync(log, text, { flag: 'wx', mode: 0o600 });
  const stderr = log + '.stderr';
  fs.writeFileSync(stderr, `${result.stderr ?? ''}${result.error ? '\n' + result.error.stack : ''}`, { flag: 'wx', mode: 0o600 });
  const receipt = {
    command: node, args, cwd: scratch, startedAt, completedAt: new Date().toISOString(),
    status: result.status, signal: result.signal, log, logSha256: digest(log), stderr, stderrSha256: digest(stderr),
  };
  fs.writeFileSync(log + '.command.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  assert.ifError(result.error);
  const testNames = [...fs.readFileSync(testFile, 'utf8').matchAll(/^test\('([^']+)'/gm)].map(match => match[1]);
  return {
    ...receipt,
    ...parseHostEvidence(text, { test: mutation.test, testNames, expectedLines, sourceTest: testFile }),
  };
}

/** @id CODE-RELQ-HOST-002 @implements REQ-RELQ-003 REQ-RELQ-005 */
export function runHostMutation({ source, output, mutation, node = process.execPath, env = process.env }) {
  source = fs.realpathSync(source);
  output = fs.realpathSync(output);
  assert.ok(path.isAbsolute(node), 'absolute runtime path required');
  assert.match(mutation.name, /^[a-zA-Z0-9._-]+$/);
  assertOutside(source, output);
  const testLines = fs.readFileSync(path.join(source, 'scripts/host-compatibility.test.mjs'), 'utf8').split('\n');
  const expectedLines = mutation.expectedAssertionNeedles.flatMap(needle => {
    const matches = testLines.flatMap((line, index) => line.includes(needle) ? [index + 1] : []);
    assert.equal(matches.length, 1, `independent assertion anchor: ${mutation.name}/${needle}`);
    return matches;
  });
  const scratch = fs.mkdtempSync(path.join(output, `${mutation.name}-work-`));
  const childEnv = { ...env, MUSUBIX6_HOST_ROOT: scratch, PYTHONDONTWRITEBYTECODE: '1', NO_COLOR: '1' };
  delete childEnv.NODE_OPTIONS;
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.FORCE_COLOR;
  try {
    for (const name of ['bin', 'scripts', '.github/skills', 'package.json', 'package-lock.json', 'README.md', 'README-ja.md', 'CLANGELOG.md']) {
      const to = path.join(scratch, name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(path.join(source, name), to, { recursive: true });
    }
    const context = { node, source, scratch, output, mutation, env: childEnv, expectedLines };
    const baseline = executeTest({ ...context, phase: 'baseline' });
    assert.equal(baseline.status, 0, `${mutation.name}: invalid baseline; ${baseline.log}`);
    assert.equal(baseline.signal, null);
    assert.deepEqual(baseline.counts, successCounts);
    const file = path.join(scratch, mutation.file);
    const original = fs.readFileSync(file);
    let mutant;
    try {
      const changed = mutation.mutate(original.toString('utf8'));
      assert.notEqual(changed, original.toString('utf8'), `${mutation.name}: no-op`);
      fs.writeFileSync(file, changed);
      mutant = executeTest({ ...context, phase: 'mutant' });
    } finally {
      fs.writeFileSync(file, original);
    }
    assert.deepEqual(fs.readFileSync(file), original);
    const restored = executeTest({ ...context, phase: 'restored' });
    assert.equal(mutant.status, 1, `${mutation.name}: mutant survived or failed setup; ${mutant.log}`);
    assert.equal(mutant.signal, null);
    assert.equal(mutant.assertion, true, `${mutation.name}: not the expected owned assertion; ${mutant.log}`);
    assert.deepEqual(mutant.counts, failureCounts);
    assert.equal(restored.status, 0, `${mutation.name}: restoration failed; ${restored.log}`);
    assert.equal(restored.signal, null);
    assert.deepEqual(restored.counts, successCounts);
    return { name: mutation.name, test: mutation.test, file: mutation.file, baseline, mutant, restored };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cases = [];
  try {
    const source = process.env.QUALIFY_SOURCE;
    const requestedOutput = process.env.QUALIFY_MUTATION_OUTPUT;
    assert.ok(source && requestedOutput, 'QUALIFY_SOURCE and QUALIFY_MUTATION_OUTPUT are required');
    const output = prepareHostOutput(source, requestedOutput);
    const { version } = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const inherited = JSON.parse(fs.readFileSync(path.join(source, '.sdd/release-validation.v0.2.0.json')));
    const mutations = hostMutations(version);
    assert.deepEqual(mutations.map(item => item.name), inherited.hostMutationCatalogue);
    for (const mutation of mutations) cases.push(runHostMutation({ source, output, mutation }));
    const report = { status: 'PASS', cases };
    fs.writeFileSync(path.join(output, 'host-mutation-results.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
