import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, '.github/skills/japanese-prose/scripts');

function runCase(method) {
  const result = spawnSync('uv', [
    'run', '--python', '3.12', '--script', path.join(scripts, 'test_engine.py'),
    `DiagnosticTests.${method}`,
  ], {
    encoding: 'utf8',
    timeout: 600000,
    env: { ...process.env, PYTHONPATH: scripts, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 1 test/);
  assert.match(result.stderr, /\bOK\b/);
}

/** @id TEST-JAPROSE-001 @verifies REQ-JAPROSE-001 */
test('TEST-JAPROSE-001 reviews contextual metaphors without banning literal or quoted uses', () => {
  runCase('test_japrose_001_contextual_metaphors');
});

/** @id TEST-JAPROSE-002 @verifies REQ-JAPROSE-002 */
test('TEST-JAPROSE-002 preserves targeted questions and reports isolated clichés', () => {
  runCase('test_japrose_002_targeted_questions');
});

/** @id TEST-JAPROSE-003 @verifies REQ-JAPROSE-003 */
test('TEST-JAPROSE-003 follows independent CommonMark code-span visibility and edit protection', () => {
  runCase('test_japrose_003_commonmark_code_spans');
});

/** @id TEST-JAPROSE-004 @verifies REQ-JAPROSE-004 */
test('TEST-JAPROSE-004 retains reading-load, JSON, natural controls and semantic review compatibility', () => {
  runCase('test_japrose_004_compatibility');
});

/** @id TEST-JAPROSE-005 @verifies REQ-JAPROSE-003 */
test('TEST-JAPROSE-005 copied PEP723 tools independently hide protected inline code', { timeout: 1800000 }, t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'japrose-copied-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const installed = spawnSync(process.execPath, [
    path.join(root, 'bin/musubix6.mjs'), 'init', work, '--only', 'japanese-prose',
  ], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(installed.error);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const copied = path.join(work, '.github/skills/japanese-prose/scripts');
  const input = path.join(work, 'inline.md');
  fs.writeFileSync(input, '実例: ``print(`GitHubがが設定をを確認する`)``\n');
  for (const script of ['lint.py', 'terms.py', 'outline.py']) {
    const result = spawnSync('uv', [
      'run', '--python', '3.12', '--script', path.join(copied, script), input, '--json',
    ], {
      encoding: 'utf8',
      timeout: 600000,
      env: { ...process.env, PYTHONPATH: copied, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    if (script === 'lint.py') {
      assert.equal(output.finding_count, 0);
    } else if (script === 'terms.py') {
      assert.deepEqual(output.terms, []);
    } else {
      assert.equal(output.paragraph_count, 1);
      assert.ok(!output.paragraphs[0].opening.includes('GitHub'));
    }
    assert.equal(fs.readFileSync(input, 'utf8'), '実例: ``print(`GitHubがが設定をを確認する`)``\n');
  }
});
