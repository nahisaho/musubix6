import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = ['consulting-analyst', 'japanese-prose', 'presentation-planner', 'tech-writer'];
const cli = (...args) => spawnSync(process.execPath, [path.join(root, 'bin/musubix6.mjs'), ...args], {
  encoding: 'utf8', timeout: 30000,
});
function inventory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const file = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), `skill must be self-contained: ${file}`);
      assert.ok(entry.name !== '__pycache__' && !/\.py[co]$/.test(entry.name), `cache in skill: ${file}`);
      if (entry.isDirectory()) return inventory(file).map(([name, ...value]) => [entry.name + '/' + name, ...value]);
      return [[entry.name, fs.statSync(file).mode & 0o111, fs.readFileSync(file).toString('base64')]];
    });
}

/** @id TEST-KOTO-SYNC-001 @verifies REQ-KOTO-SYNC-001 */
test('TEST-KOTO-SYNC-001 initializes all four self-contained kotonoha skills', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kotonoha-init-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const result = cli('init', work, '--only', selected.join(','));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const installed = path.join(work, '.github/skills');
  assert.deepEqual(fs.readdirSync(installed).sort(), selected);
  for (const name of selected) {
    assert.deepEqual(inventory(path.join(installed, name)), inventory(path.join(root, '.github/skills', name)));
  }
});

/** @id TEST-KOTO-SYNC-002 @verifies REQ-KOTO-SYNC-002 */
test('TEST-KOTO-SYNC-002 refuses excluded obsidian skills without creating a destination', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kotonoha-exclude-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const listed = cli('list');
  assert.equal(listed.status, 0, listed.stderr);
  assert.ok(!listed.stdout.split('\n').some(name => name.startsWith('obsidian')));
  for (const name of ['obsidian-bases', 'obsidian-canvas', 'obsidian-vault']) {
    const target = path.join(work, name);
    const result = cli('init', target, '--only', name);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /unknown skill:/);
    assert.equal(fs.existsSync(target), false);
  }
});

/** @id TEST-KOTO-SYNC-003 @verifies REQ-KOTO-SYNC-003 */
test('TEST-KOTO-SYNC-003 initialized tech-writer preserves the local todo-app correction', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kotonoha-lint-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const installed = cli('init', work, '--only', 'tech-writer');
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const document = path.join(work, 'sample.md');
  fs.writeFileSync(document, '# todo-cli\n\nThe todo app lists tasks. Use todo add.\n\nTODO finish this.\n');
  const result = spawnSync('python3', [path.join(work, '.github/skills/tech-writer/scripts/lint.py'), document], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /placeholder/i);
  assert.doesNotMatch(result.stdout, /The todo app/);
});

/** @id TEST-GINZA-001 @verifies REQ-GINZA-001 */
test('TEST-GINZA-001 installed GiNZA 5.3 scripts preserve diagnostics and terminology', { timeout: 600000 }, t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ginza-53-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const installed = cli('init', work, '--only', 'japanese-prose');
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const scripts = path.join(work, '.github/skills/japanese-prose/scripts');
  const expectedDependencies = ['ginza>=5.3.0,<5.4', 'ja-ginza>=5.3.0,<5.4', 'spacy>=3.8.16,<4'];
  for (const script of ['test_engine.py', 'lint.py', 'terms.py']) {
    const source = fs.readFileSync(path.join(scripts, script), 'utf8');
    assert.match(source, /^# requires-python = ">=3\.10"$/m);
    const dependencies = [...source.matchAll(/^# {3}"((?:ginza|ja-ginza|spacy)[^"]+)",$/gm)]
      .map(match => match[1]);
    assert.deepEqual(dependencies, expectedDependencies, `${script} must declare the supported environment`);
  }
  for (const readme of ['README.md', 'README-ja.md']) {
    const text = fs.readFileSync(path.join(root, readme), 'utf8');
    assert.ok(text.includes(`uv pip install ${expectedDependencies.map(item => `"${item}"`).join(' ')}`),
      `${readme} must document the validated installation command`);
  }
  assert.match(fs.readFileSync(path.join(work, '.github/skills/japanese-prose/NOTICE.md'), 'utf8'),
    /targets GiNZA 5\.3\.x/);
  const run = (script, ...args) => {
    const result = spawnSync('uv', ['run', '--python', '3.12', '--script', path.join(scripts, script), ...args], {
      encoding: 'utf8', timeout: 180000,
      env: { ...process.env, PYTHONPATH: scripts, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.ifError(result.error);
    return result;
  };
  const suite = run('test_engine.py');
  assert.equal(suite.status, 0, suite.stdout + suite.stderr);
  assert.match(suite.stderr, /Ran \d+ tests/);
  assert.match(suite.stderr, /\bOK\b/);
  const document = path.join(work, 'sample.md');
  fs.writeFileSync(document, '# Test\n\n東京都でGitHubを利用します。\n\n```\n設定をを確認します。\n```\n');
  for (const script of ['lint.py', 'terms.py']) {
    const result = run(script, document, '--json');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.engine, 'GiNZA');
    if (script === 'lint.py') {
      assert.equal(output.finding_count, 0);
    } else {
      assert.ok(output.terms.some(term => term.term === 'GitHub'));
      assert.ok(output.terms.some(term => term.entity), 'NER must remain enabled for terminology');
    }
    const missing = run(script, path.join(work, 'missing.md'), '--json');
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /error:/);
  }
  fs.writeFileSync(document, '設定をを確認します。\n');
  const duplicate = run('lint.py', document, '--json');
  assert.equal(duplicate.status, 0, duplicate.stdout + duplicate.stderr);
  assert.ok(JSON.parse(duplicate.stdout).findings.some(finding => finding.category === 'duplicate_particle'));
});

const lintScript = path.join(root, '.github/skills/tech-writer/scripts/lint.py');
function lintPlaceholders(t, rows, script = lintScript) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-policy-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const document = path.join(work, 'policy.md');
  fs.writeFileSync(document, rows.map(([text]) => text).join('\n') + '\n');
  const result = spawnSync('python3', [script, '--json', '--atomic', document], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output).sort(), ['file', 'finding_count', 'findings']);
  assert.equal(output.file, document);
  assert.equal(output.finding_count, output.findings.length);
  const actual = output.findings.filter(finding => finding.category === 'placeholder');
  for (const finding of actual) {
    assert.deepEqual(Object.keys(finding).sort(), ['category', 'line', 'message', 'snippet']);
    assert.match(finding.message, /Unresolved placeholder/);
    assert.equal(finding.snippet, rows[finding.line - 1][0].trim());
  }
  const expected = rows.flatMap(([, count], index) => Array(count).fill(index + 1));
  assert.deepEqual(actual.map(finding => finding.line), expected,
    JSON.stringify(rows.filter(([, count], index) => actual.filter(f => f.line === index + 1).length !== count)));
}

function markerCaseForms(marker) {
  return Array.from({ length: 2 ** marker.length }, (_, mask) =>
    [...marker].map((letter, index) => mask & (1 << index) ? letter.toLowerCase() : letter).join(''));
}

function markerPolicyRows() {
  const rows = [['The todo app lists tasks. Use todo add.', 0], ['Todo is an app.', 0], ['todo finish this.', 0]];
  for (const marker of ['TODO', 'FIXME', 'TBD', 'XXX']) {
    for (const token of markerCaseForms(marker)) {
      for (const gap of ['', ' ', '\t']) {
        for (const colon of [':', '：']) rows.push([`${token}${gap}${colon} pending`, 1]);
        for (const [annotation, count] of [['(#123)', 0], ['(reason)', 0], ['(https://host/TODO)', 0],
          ['(docs/tracking.md)', 0], ['(`#123`)', 0], ['()', 1], ['( \t)', 1], ['(', 1], ['(#123', 1]]) {
          rows.push([`${token}${gap}${annotation}`, count]);
        }
      }
      rows.push([`${token} pending`, marker === 'TODO' && token !== marker ? 0 : 1]);
    }
  }
  rows.push(['- [ ] todo : pending', 1], ['> Todo：pending', 1], ['## tOdO\t: pending', 1],
    ['TODO: one; FIXME：two', 2], ['TODO(#123) then TODO: untracked', 1]);
  return rows;
}

function contextPolicyRows() {
  const rows = [];
  for (const marker of ['TODO', 'FIXME', 'TBD', 'XXX']) {
    for (const token of markerCaseForms(marker)) {
      for (const text of [`${token}-cli`, `my-${token}-app`, `${token}.md`, `src/${token}`, `src\\${token}`, `${token}_APP`,
        `https://host/${token}`, `www.host/${token}`, `ftp://host/${token}`, `mailto:${token}@host`,
        `[guide](../${token}/guide.md)`, `[guide](${token})`,
        `\`${token}\``, `\`\`before \` ${token}\`\``, `Use \`\`\`before \`\` ${token}\`\`\``]) {
        rows.push([text, 0]);
      }
    }
    rows.push([`[${marker}](https://host/${marker})`, 1],
      [`\`\`${marker} \` code\`\` ${marker}: pending`, 1],
      [`https://host/${marker} ${marker}: pending`, 1],
      [`[guide](../${marker}.md) ${marker}: pending`, 1],
      [`my-${marker}-app ${marker}: pending`, 1],
      [`\`${marker}\`\``, 1]);
  }
  rows.push(['```python', 0], ['TODO: example', 0], ['````', 0],
    ['TODO: outside fence', 1], ['~~~text', 0], ['FIXME: example', 0], ['~~~', 0],
    ['XXX: outside fence', 1], ['todo `cli`: application usage', 0], ['', 0]);
  return rows;
}

/** @id TEST-TW-PH-001 @verifies REQ-TW-PH-001 */
test('TEST-TW-PH-001 enumerates marker case, colon, whitespace and annotation policy', t => {
  lintPlaceholders(t, markerPolicyRows());
});

/** @id TEST-TW-PH-002 @verifies REQ-TW-PH-002 */
test('TEST-TW-PH-002 excludes only recognized code, URL and identifier contexts', t => {
  lintPlaceholders(t, contextPolicyRows());
});

/** @id TEST-TW-PH-003 @verifies REQ-TW-PH-003 */
test('TEST-TW-PH-003 installed linter preserves policy and advisory interfaces', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-install-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const installed = cli('init', work, '--only', 'tech-writer');
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const script = path.join(work, '.github/skills/tech-writer/scripts/lint.py');
  const missing = spawnSync('python3', [script, '--json', path.join(work, 'missing.md')], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(missing.error);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /error: file not found:/);
  assert.equal(missing.stdout, '');
  lintPlaceholders(t, [...markerPolicyRows(), ...contextPolicyRows()], script);
});
