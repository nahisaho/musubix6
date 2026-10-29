import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = fs.realpathSync(process.argv[2]);
assert.ok(path.relative(root, output).startsWith('..' + path.sep), 'proof output must be outside source');
const scratch = fs.mkdtempSync(path.join(output, 'host-proof-source-'));
const sourceFile = 'scripts/release-host-mutations.mjs';
const original = fs.readFileSync(path.join(root, sourceFile), 'utf8');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const frameMatch = "      return new RegExp(`^\\\\s*at\\\\s+(?:[^\\\\n]*\\\\()?${quoted}:${line}:\\\\d+\\\\)?\\\\s*$`, 'm').test(frame);";
const mutations = [
  ['catalogue-omission', 'return rows.map(([name, id, file, mutate, needle])', 'return rows.slice(1).map(([name, id, file, mutate, needle])'],
  ['prerelease-admission', "  assert.match(version, /^\\d+\\.\\d+\\.\\d+$/, 'stable version required');", ''],
  ['duplicate-anchor', '(all || count === 1)', 'true'],
  ['missing-anchor', 'count > 0 && (all || count === 1)', 'count === 0 || (all || count === 1)'],
  ['no-op-anchor', "  assert.notEqual(before, after, 'no-op mutation');", ''],
  ['unknown-native-target', "  assert.ok(rows.every(row => testNames.includes(row.data.name)), 'unknown native target');", ''],
  ['duplicate-native-target', "  assert.equal(new Set(rows.map(row => row.data.name)).size, rows.length, 'duplicate native targets');", ''],
  ['selected-skip', "  assert.ok([undefined, false].includes(selected[0].data.skip), 'selected case skipped');", ''],
  ['selected-todo', "  assert.ok([undefined, false].includes(selected[0].data.todo), 'selected case TODO');", ''],
  ['filtered-skip-reason', "row.data.skip === 'test name does not match pattern'", 'Boolean(row.data.skip)'],
  ['filtered-failure', "row.type === 'test:pass' &&", 'true &&'],
  ['filtered-todo', '[undefined, false].includes(row.data.todo)', 'true'],
  ['native-plan-count', "  assert.equal(plans[0].data.count, rows.length, 'native plan count differs');", ''],
  ['owned-assertion-code', "'ERR_ASSERTION'", "'MODULE_NOT_FOUND'", 2],
  ['owned-assertion-location', frameMatch, '      return stack.includes(file);'],
  ['owned-frame-identity', frameMatch, '      return stack.includes(`${file}:${line}:`);'],
  ['oracle-line-shape',
    "  assert.ok(expectedLines.length > 0 && expectedLines.every(line => Number.isSafeInteger(line) && line > 0),\n    'positive integer assertion lines required');", ''],
  ['owned-assertion-admission', '    assert.equal(mutant.assertion, true, `${mutation.name}: not the expected owned assertion; ${mutant.log}`);', ''],
  ['restoration', '      fs.writeFileSync(file, original);', ''],
  ['retained-log-digest', 'logSha256: digest(log)', "logSha256: '0'.repeat(64)"],
  ['source-contained-evidence', "  assert.ok(path.relative(source, output).startsWith('..' + path.sep), 'evidence must be outside the source');", ''],
  ['valid-output-control', "  assert.ok(path.relative(source, output).startsWith('..' + path.sep), 'evidence must be outside the source');",
    "  assert.ok(false, 'evidence must be outside the source');"],
];
const cases = [];
const passing = { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
function check(label) {
  const args = ['--test', '--test-reporter=spec', path.join(scratch, 'scripts/release-host-mutations.test.mjs')];
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, args, { cwd: scratch, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const log = path.join(output, `${label}.log`);
  fs.writeFileSync(log, text, { flag: 'wx' });
  assert.ifError(result.error);
  assert.equal(result.signal, null, label);
  const counts = Object.fromEntries(Object.keys(passing).map(key => {
    const matches = [...text.matchAll(new RegExp(`^(?:ℹ\\s+|#\\s+)?${key} (\\d+)\\s*$`, 'gm'))];
    assert.equal(matches.length, 1, `${label}: missing or duplicate ${key} summary`);
    return [key, Number(matches[0][1])];
  }));
  return {
    status: result.status, signal: result.signal, counts, log, logSha256: sha(text),
    assertion: /AssertionError \[ERR_ASSERTION\]/.test(text) &&
      /release-host-mutations\.test\.mjs:\d+:\d+/.test(text),
    command: process.execPath, args,
  };
}
try {
  for (const [name, before, , count = 1] of mutations) {
    assert.equal(original.split(before).length - 1, count, `one bounded mechanism: ${name}`);
  }
  for (const name of ['bin', 'scripts', '.github/skills', 'package.json', 'package-lock.json', 'README.md', 'README-ja.md', 'CLANGELOG.md',
    '.sdd/release-validation.v0.2.0.json']) {
    const target = path.join(scratch, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, name), target, { recursive: true });
  }
  const baseline = check('baseline');
  assert.equal(baseline.status, 0, baseline.log);
  assert.deepEqual(baseline.counts, passing);
  for (const [name, before, after] of mutations) {
    const file = path.join(scratch, sourceFile);
    let mutant;
    try {
      fs.writeFileSync(file, original.replaceAll(before, after));
      mutant = check(name);
    } finally {
      fs.writeFileSync(file, original);
    }
    assert.equal(mutant.status, 1, `${name}: survived; ${mutant.log}`);
    assert.equal(mutant.assertion, true, `${name}: not an owned regression assertion; ${mutant.log}`);
    assert.deepEqual(mutant.counts, { ...passing, pass: 0, fail: 1 });
    const restored = check(`${name}-restored`);
    assert.equal(restored.status, 0, restored.log);
    assert.deepEqual(restored.counts, passing);
    cases.push({ name, baseline, mutant, restored });
  }
  assert.equal(fs.readFileSync(path.join(root, sourceFile), 'utf8'), original);
  const report = {
    status: 'PASS', sourceSha256: sha(original),
    testSha256: sha(fs.readFileSync(path.join(scratch, 'scripts/release-host-mutations.test.mjs'))),
    reporterSha256: sha(fs.readFileSync(path.join(scratch, 'scripts/release-host-events.mjs'))),
    cases, qualificationCredit: 0,
  };
  fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'PASS', mechanisms: cases.length, report: path.join(output, 'proof.json') }));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
