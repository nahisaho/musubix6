import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = process.env.MUSUBIX6_HOST_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = ['agent-watchdog', 'consulting-analyst', 'japanese-prose', 'lean-agentic-coding',
  'lean-sdd-tdd', 'presentation-planner', 'sdd-reverse-spec', 'sdd-spec-interview',
  'tech-writer', 'wslc-containers'];
const shared = all.filter(name => name !== 'agent-watchdog');
const hosts = { copilot: '.github/skills', claude: '.claude/skills' };

function temporary(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'musubix6-host-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  return work;
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}
function cli(cwd, ...args) {
  return run(process.execPath, [path.join(root, 'bin/musubix6.mjs'), ...args], cwd);
}
function success(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
function inventory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const file = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), `non-self-contained payload: ${file}`);
      if (entry.isDirectory()) return inventory(file).map(([name, ...value]) => [`${entry.name}/${name}`, ...value]);
      return [[entry.name, fs.statSync(file).mode & 0o111, fs.readFileSync(file).toString('base64')]];
    });
}

/** @id TEST-HOST-001 @verifies REQ-HOST-001 */
test('TEST-HOST-001 routes all host selections and option positions without changing the default', t => {
  const work = temporary(t);
  for (const host of [undefined, 'copilot', 'claude', 'both']) {
    for (const before of [false, true]) {
      const dest = path.join(work, `${host}-${before} space`);
      const options = host ? ['--host', host] : [];
      const args = before ? [...options, dest] : [dest, ...options];
      success(cli(work, 'init', ...args, '--only', 'lean-sdd-tdd'));
      for (const [name, relative] of Object.entries(hosts)) {
        const expected = host === 'both' || name === (host || 'copilot');
        assert.equal(fs.existsSync(path.join(dest, relative, 'lean-sdd-tdd/SKILL.md')), expected,
          `${host}, before=${before}, ${name}`);
      }
      assert.equal(fs.existsSync(path.join(work, host || 'copilot')), false, 'host value is not a destination');
    }
  }
  const cwd = path.join(work, 'default cwd');
  fs.mkdirSync(cwd);
  success(cli(cwd, 'init', '--host', 'claude', '--only', 'lean-sdd-tdd'));
  assert.ok(fs.existsSync(path.join(cwd, '.claude/skills/lean-sdd-tdd/SKILL.md')));
  assert.equal(fs.existsSync(path.join(cwd, '.github')), false);
});

/** @id TEST-HOST-002 @verifies REQ-HOST-002 */
test('TEST-HOST-002 enumerates watchdog policy and rejects malformed requests before writes', t => {
  const work = temporary(t);
  for (const host of ['copilot', 'claude', 'both']) {
    for (const explicit of [false, true]) {
      const dest = path.join(work, `policy-${host}-${explicit}`);
      const result = cli(work, 'init', dest, '--host', host,
        ...(explicit ? ['--only', 'agent-watchdog'] : []));
      if (explicit && host !== 'copilot') {
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stderr, /agent-watchdog.*copilot-only/i);
        assert.equal(fs.existsSync(dest), false, 'reject the whole request before copying either host');
        continue;
      }
      success(result);
      for (const [name, relative] of Object.entries(hosts)) {
        const selected = host === name || host === 'both';
        if (!selected) {
          assert.equal(fs.existsSync(path.join(dest, relative)), false);
          continue;
        }
        const expected = explicit ? ['agent-watchdog'] : name === 'copilot' ? all : shared;
        assert.deepEqual(fs.readdirSync(path.join(dest, relative)).sort(), expected);
      }
      if (host !== 'copilot') assert.match(result.stderr, /agent-watchdog.*claude.*copilot-only/i);
    }
  }
  const malformed = [
    ['--host'], ['--host', ''], ['--host', ' '], ['--host', '--force'],
    ['--host', 'CLAUDE'], ['--host', 'auto'], ['--host=claude'],
    ['--host', 'copilot', '--host', 'claude'], ['--only'], ['--only', ''],
    ['--only', ' , '], ['--only', '--force'], ['--only', 'absent'],
    ['--only', 'lean-sdd-tdd', '--only', 'tech-writer'], ['--unknown'],
    ['--host', 'claude', '--only', 'lean-sdd-tdd,absent'], ['another-destination'],
  ];
  for (const [index, args] of malformed.entries()) {
    const dest = path.join(work, `invalid-${index}`);
    const result = cli(work, 'init', dest, ...args);
    assert.equal(result.status, 2, JSON.stringify(args) + result.stdout + result.stderr);
    assert.ok(result.stderr.trim(), `missing diagnostic for ${JSON.stringify(args)}`);
    assert.equal(fs.existsSync(dest), false, `wrote before validation: ${JSON.stringify(args)}`);
  }
  for (const [index, args] of [
    ['--only'], ['--only', ''], ['--only', ',,'], ['--only', '--force'],
    ['--only', 'lean-sdd-tdd', '--only'],
  ].entries()) {
    const dest = path.join(work, `only-diagnostic-${index}`);
    const result = cli(work, 'init', dest, ...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--only.*(?:requires|expected|missing|non.?empty).*(?:skill|a,b)/i);
    assert.equal(fs.existsSync(dest), false);
  }
  const existing = path.join(work, 'existing');
  success(cli(work, 'init', existing, '--only', 'lean-sdd-tdd'));
  const before = inventory(existing);
  assert.equal(cli(work, 'init', existing, '--force', '--host', 'invalid').status, 2);
  assert.deepEqual(inventory(existing), before, 'invalid forced request must not overwrite existing files');
});

/** @id TEST-HOST-003 @verifies REQ-HOST-003 */
test('TEST-HOST-003 enumerates per-host skip/force states and retains extra files', t => {
  const work = temporary(t);
  for (const host of ['copilot', 'claude', 'both']) {
    for (const force of [false, true]) {
      for (const existing of [false, true]) {
        const dest = path.join(work, `${host}-${force}-${existing}`);
        const selectedHosts = host === 'both' ? Object.keys(hosts) : [host];
        for (const name of selectedHosts) {
          if (!existing) continue;
          const dir = path.join(dest, hosts[name], 'lean-sdd-tdd');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'SKILL.md'), `custom ${name}\n`);
          fs.writeFileSync(path.join(dir, 'local.txt'), 'keep\n');
        }
        const result = cli(work, 'init', '--host', host, dest, '--only', 'lean-sdd-tdd',
          ...(force ? ['--force'] : []));
        success(result);
        for (const name of selectedHosts) {
          const dir = path.join(dest, hosts[name], 'lean-sdd-tdd');
          const expected = existing && !force ? `custom ${name}\n` :
            fs.readFileSync(path.join(root, '.github/skills/lean-sdd-tdd/SKILL.md'), 'utf8');
          assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), expected);
          if (existing) assert.equal(fs.readFileSync(path.join(dir, 'local.txt'), 'utf8'), 'keep\n');
          assert.deepEqual(fs.readdirSync(path.dirname(dir)), ['lean-sdd-tdd'], '--only limits each host');
          assert.ok(result.stdout.includes(hosts[name]), 'messages identify host paths');
          if (existing && !force) assert.match(result.stdout, /skip.*exists/);
        }
      }
    }
  }
  const asymmetric = path.join(work, 'asymmetric');
  success(cli(work, 'init', asymmetric, '--only', 'lean-sdd-tdd'));
  const copilotFile = path.join(asymmetric, hosts.copilot, 'lean-sdd-tdd/SKILL.md');
  fs.writeFileSync(copilotFile, 'custom copilot\n');
  success(cli(work, 'init', asymmetric, '--host', 'both', '--only', 'lean-sdd-tdd'));
  assert.equal(fs.readFileSync(copilotFile, 'utf8'), 'custom copilot\n');
  assert.deepEqual(inventory(path.join(asymmetric, hosts.claude, 'lean-sdd-tdd')),
    inventory(path.join(root, '.github/skills/lean-sdd-tdd')));
});

/** @id TEST-HOST-004 @verifies REQ-HOST-004 */
test('TEST-HOST-004 shared instructions are host-neutral and relocated helpers execute', t => {
  for (const name of shared) {
    const skill = fs.readFileSync(path.join(root, '.github/skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(skill, /allowed-tools:\s*shell\b/, `${name}: Copilot-only shell restriction`);
    assert.doesNotMatch(skill, /(?:bash|node|python3?|uv run)\s+\.github\/skills\//,
      `${name}: unconditional repository execution path`);
    assert.doesNotMatch(skill, /`(?:manage_schedule|list_agents|write_agent|read_agent)`/,
      `${name}: mandatory Copilot agent tools`);
    if (skill.includes('ask_user')) {
      assert.match(skill, /AskUserQuestion/, `${name}: Claude-native question tool`);
      assert.match(skill, /(?:unavailable|not available)/i, `${name}: unavailable tool handling`);
      assert.match(skill, /(?:explicit|stop)/i, `${name}: approval cannot be bypassed`);
    }
  }
  const protocol = fs.readFileSync(path.join(root,
    '.github/skills/lean-agentic-coding/references/t2-protocol.md'), 'utf8');
  assert.match(protocol, /AskUserQuestion/);
  const interview = fs.readFileSync(path.join(root, '.github/skills/sdd-spec-interview/SKILL.md'), 'utf8');
  const questionRule = interview.split('\n').find(line => line.startsWith('2. **One question at a time**'));
  assert.match(questionRule, /host.*question tool.*fallback.*unavailable/,
    'the operational question rule must preserve the native-tool fallback, not prohibit it');
  const watchdog = fs.readFileSync(path.join(root, '.github/skills/agent-watchdog/SKILL.md'), 'utf8');
  assert.match(watchdog, /Copilot-only/i);
  const work = temporary(t);
  success(cli(work, 'init', work, '--host', 'both'));
  for (const name of shared) {
    const canonical = inventory(path.join(root, '.github/skills', name));
    for (const relative of Object.values(hosts)) {
      assert.deepEqual(inventory(path.join(work, relative, name)), canonical);
    }
  }
  const sdd = path.join(work, '.claude/skills/lean-sdd-tdd/scripts/sdd.mjs');
  success(run(process.execPath, [sdd, '--root', work, 'init']));
  success(run(process.execPath, [sdd, '--root', work, 'status']));
  const doc = path.join(work, 'sample.md');
  fs.writeFileSync(doc, '# Sample\n\nTODO: incomplete\n');
  const lint = run('python3', [path.join(work, '.claude/skills/tech-writer/scripts/lint.py'), '--json', doc]);
  success(lint);
  assert.ok(JSON.parse(lint.stdout).findings.some(finding => finding.category === 'placeholder'));
  success(run('bash', ['-n', path.join(work, '.claude/skills/wslc-containers/scripts/wslc.sh')]));
});

/** @id TEST-HOST-005 @verifies REQ-HOST-005 */
test('TEST-HOST-005 development metadata and real npm payload preserve wrapper contracts', t => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.2.0-dev.0');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(fs.readFileSync(path.join(root, 'CLANGELOG.md'), 'utf8'), /0\.2\.0-dev\.0/);
  for (const file of ['README.md', 'README-ja.md']) {
    const body = fs.readFileSync(path.join(root, file), 'utf8');
    for (const host of ['claude', 'both']) assert.ok(body.includes(`--host ${host}`), `${file}: ${host}`);
    assert.match(body, /--host claude --force/);
    assert.match(body, /\.claude\/skills/);
    assert.match(body, /agent-watchdog/);
  }
  const work = temporary(t);
  success(run('npm', ['pack', '--ignore-scripts', '--pack-destination', work, '--json']));
  const archives = fs.readdirSync(work).filter(name => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  success(run('tar', ['-xzf', path.join(work, archives[0]), '-C', work]));
  const packed = path.join(work, 'package');
  for (const name of all) {
    assert.deepEqual(inventory(path.join(packed, '.github/skills', name)),
      inventory(path.join(root, '.github/skills', name)));
  }
  assert.ok(fs.existsSync(path.join(packed, 'scripts/host-compatibility.test.mjs')));
  const wrapper = (...args) => run(process.execPath, [path.join(packed, 'bin/musubix6.mjs'), ...args], work);
  const listed = wrapper('list');
  success(listed);
  assert.deepEqual(listed.stdout.trim().split('\n').sort(), all);
  assert.equal(wrapper('--version').stdout.trim(), '0.2.0-dev.0');
  const dest = path.join(work, 'packed project');
  success(wrapper('init', dest, '--host', 'both'));
  assert.deepEqual(fs.readdirSync(path.join(dest, '.github/skills')).sort(), all);
  assert.deepEqual(fs.readdirSync(path.join(dest, '.claude/skills')).sort(), shared);
  const forwarded = wrapper('sdd', '--root', dest, 'init');
  success(forwarded);
  const invalid = wrapper('sdd', 'not-a-command');
  assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /usage/i);
});
