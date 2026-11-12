import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const script = process.env.SDD_SCRIPT_UNDER_TEST ?? path.join(scripts, 'sdd.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'musubix-ledger-tests-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const { NODE_TEST_CONTEXT, NODE_OPTIONS, ...environment } = process.env;
const env = { ...environment, GIT_CEILING_DIRECTORIES: scratch };
function command(root, args, options = {}) {
  const result = spawnSync(process.execPath, [...(options.import ? ['--import', options.import] : []),
    script, '--root', root, ...args], { encoding: 'utf8', env,
    timeout: options.timeout ?? 45000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return { code: result.status, text: result.stdout + result.stderr };
}
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function project() {
  const root = fs.mkdtempSync(path.join(scratch, 'project-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Ledger Fixture');
  git(root, 'config', 'user.email', 'ledger@example.invalid');
  fs.mkdirSync(path.join(root, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sdd/config.json'), JSON.stringify({
    planning: { required: false }, specFeedback: { required: false }, checks: [],
  }));
  fs.writeFileSync(path.join(root, '.sdd/specs/calc.md'),
    '---\nfeature: calc\ntier: T2\n---\n## Design\nPure fixture.\nNo external effects.\n| REQ-CALC-001 | When called, return one. | TEST-CALC-001 |\n');
  return root;
}
function synthetic(count = 3, padding = '') {
  let previous = '';
  return Array.from({ length: count }, (_, index) => {
    const event = { v: 1, seq: index + 1, type: 'approval', feature: 'synthetic-archive-fixture',
      approvalSha: 'a'.repeat(64), at: '2026-01-01T00:00:00.000Z',
      ...(index === 0 && padding ? { fixturePadding: padding } : {}), prev: previous };
    event.hash = sha(JSON.stringify(event));
    previous = event.hash;
    return event;
  });
}
const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
function writePlain(root, rows) {
  fs.writeFileSync(path.join(root, '.sdd/tdd.jsonl'), encode(rows));
}
function archivedFixture(root, rows, tail = []) {
  const raw = encode(rows), compressed = zlib.gzipSync(raw);
  const file = `tdd-archive/${rows[0].seq}-${rows.at(-1).seq}-${sha(compressed)}.jsonl.gz`;
  fs.mkdirSync(path.join(root, '.sdd/tdd-archive'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sdd', file), compressed);
  const manifest = { schemaVersion: 1, segments: [{
    path: file, compressedSha256: sha(compressed), sha256: sha(raw), bytes: raw.length,
    count: rows.length, firstSeq: rows[0].seq, lastSeq: rows.at(-1).seq,
    firstPrev: rows[0].prev, lastHash: rows.at(-1).hash,
  }] };
  fs.writeFileSync(path.join(root, '.sdd/tdd-manifest.json'), JSON.stringify(manifest) + '\n');
  writePlain(root, tail);
  return { manifest, file: path.join(root, '.sdd', file), raw };
}
function snapshot(root) {
  const result = {};
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (fs.lstatSync(file).isDirectory()) walk(file);
      else result[path.relative(root, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(path.join(root, '.sdd'));
  return result;
}
const approve = root => command(root, ['approve', 'record', 'calc',
  '--by', 'ai:ledger-fixture', '--review', 'Independent synthetic fixture review']);
function logical(root) {
  const manifestPath = path.join(root, '.sdd/tdd-manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { segments: [] };
  return Buffer.concat([...manifest.segments.map(segment =>
    zlib.gunzipSync(fs.readFileSync(path.join(root, '.sdd', segment.path)))),
  fs.readFileSync(path.join(root, '.sdd/tdd.jsonl'))]);
}

/** @id TEST-LEDGER-001 @verifies REQ-LEDGER-001 */
test('TEST-LEDGER-001 legacy and archived ledgers preserve every ordered event and identity', () => {
  const root = project(), rows = synthetic();
  writePlain(root, rows);
  assert.equal(command(root, ['tdd', 'check']).code, 0);
  archivedFixture(root, rows.slice(0, 2), rows.slice(2));
  const archived = command(root, ['tdd', 'check']);
  assert.equal(archived.code, 0, archived.text);
  assert.match(archived.text, /3 entries/, 'Archived events must count, not just the active tail');
  assert.ok(logical(root).equals(encode(rows)));
  assert.equal(command(root, ['status']).code, 0);
});

/** @id TEST-LEDGER-002 @verifies REQ-LEDGER-002 */
test('TEST-LEDGER-002 oversized append rotates automatically; compact is idempotent and dry-run is read-only', () => {
  const small = project();
  writePlain(small, synthetic());
  assert.equal(approve(small).code, 0);
  assert.equal(fs.existsSync(path.join(small, '.sdd/tdd-manifest.json')), false);
  const approvalBytes = Buffer.byteLength(fs.readFileSync(path.join(small, '.sdd/tdd.jsonl'), 'utf8')
    .trimEnd().split('\n').at(-1) + '\n');
  for (const size of [2097151, 2097152, 2097153]) {
    const boundary = project();
    const padding = size - approvalBytes - encode(synthetic(3, 'x')).length + 1;
    writePlain(boundary, synthetic(3, 'x'.repeat(padding)));
    const result = approve(boundary);
    assert.equal(result.code, 0, result.text);
    assert.equal(logical(boundary).length, size, 'Measure the actual append boundary');
    assert.equal(fs.existsSync(path.join(boundary, '.sdd/tdd-manifest.json')), size > 2097152);
  }
  const root = project(), rows = synthetic(3, '\u65e5'.repeat(700000));
  writePlain(root, rows);
  const prefix = encode(rows);
  assert.ok(prefix.length > 2097152);
  const original = snapshot(root);
  const preview = command(root, ['tdd', 'compact', '--dry-run', '--json']);
  assert.equal(preview.code, 0, preview.text);
  assert.equal(JSON.parse(preview.text).changed, true);
  assert.deepEqual(snapshot(root), original, 'Dry-run must not rotate even an oversized ledger');
  const appended = approve(root);
  assert.equal(appended.code, 0, appended.text);
  assert.ok(fs.existsSync(path.join(root, '.sdd/tdd-manifest.json')), 'Append above 2 MiB must archive automatically');
  const reconstructed = logical(root);
  assert.ok(reconstructed.subarray(0, prefix.length).equals(prefix));
  assert.equal(reconstructed.toString().trimEnd().split('\n').length, 4);
  assert.ok(fs.statSync(path.join(root, '.sdd/tdd.jsonl')).size <= 2097152);
  const before = snapshot(root);
  const dry = command(root, ['tdd', 'compact', '--dry-run', '--json']);
  assert.equal(dry.code, 0, dry.text);
  assert.deepEqual(snapshot(root), before);
  const repeat = command(root, ['tdd', 'compact', '--json']);
  assert.equal(repeat.code, 0, repeat.text);
  assert.equal(JSON.parse(repeat.text).changed, false);
  assert.deepEqual(snapshot(root), before);
  const unknown = command(root, ['tdd', 'compact', '--unexpected']);
  assert.equal(unknown.code, 2, unknown.text);
});

/** @id TEST-LEDGER-003 @verifies REQ-LEDGER-003 */
test('TEST-LEDGER-003 invalid archives never become empty successful evidence', () => {
  const mutations = {
    missingSegment: [2, ({ file }) => fs.unlinkSync(file)],
    corruptCompressed: [1, ({ file }) => {
      const bytes = fs.readFileSync(file); bytes[bytes.length - 8] ^= 1; fs.writeFileSync(file, bytes);
    }],
    wrongDigest: [1, ({ manifest }) => { manifest.segments[0].sha256 = 'f'.repeat(64); }],
    wrongCount: [1, ({ manifest }) => { manifest.segments[0].count++; }],
    wrongSequence: [1, ({ manifest }) => { manifest.segments[0].firstSeq++; }],
    duplicateSegment: [1, ({ manifest }) => { manifest.segments.push({ ...manifest.segments[0] }); }],
    traversal: [2, ({ manifest }) => { manifest.segments[0].path = '../outside.jsonl.gz'; }],
    unknownSchema: [2, ({ manifest }) => { manifest.schemaVersion = 2; }],
  };
  for (const [name, [expected, mutate]] of Object.entries(mutations)) {
    const root = project(), fixture = archivedFixture(root, synthetic());
    mutate(fixture);
    fs.writeFileSync(path.join(root, '.sdd/tdd-manifest.json'), JSON.stringify(fixture.manifest));
    const before = snapshot(root);
    const result = command(root, ['tdd', 'check']);
    assert.equal(result.code, expected, `${name}: refuse with the specified evidence classification`);
    assert.deepEqual(snapshot(root), before, `${name}: checks are read-only`);
  }
  for (const name of ['tdd.jsonl', 'tdd-manifest.json']) {
    const root = project(); archivedFixture(root, synthetic());
    fs.unlinkSync(path.join(root, '.sdd', name));
    assert.equal(command(root, ['tdd', 'check']).code, 2, `Missing ${name} must remain unresolved`);
  }
  const root = project(), fixture = archivedFixture(root, synthetic());
  fs.unlinkSync(fixture.file);
  const outside = path.join(scratch, 'external-archive.jsonl.gz');
  fs.writeFileSync(outside, zlib.gzipSync(fixture.raw));
  fs.symlinkSync(outside, fixture.file);
  assert.equal(command(root, ['tdd', 'check']).code, 2, 'Archive symlink escape must refuse');
  const busy = project(); archivedFixture(busy, synthetic());
  fs.mkdirSync(path.join(busy, '.sdd/tdd.lock'));
  fs.writeFileSync(path.join(busy, '.sdd/tdd.lock/owner.json'), JSON.stringify({
    pid: process.pid, host: os.hostname(), nonce: 'synthetic-live-owner',
  }));
  assert.equal(command(busy, ['tdd', 'check']).code, 2, 'Read-only evidence must refuse an active foreign writer');
});

/** @id TEST-LEDGER-004 @verifies REQ-LEDGER-004 REQ-LEDGER-003 */
test('TEST-LEDGER-004 unknown live locks are not stolen and interrupted switches recover once', async () => {
  const locked = project(); writePlain(locked, synthetic());
  const lock = path.join(locked, '.sdd/tdd.lock');
  fs.mkdirSync(lock);
  fs.utimesSync(lock, new Date(0), new Date(0));
  const lockedResult = approve(locked);
  assert.equal(lockedResult.code, 2, 'An aged lock with unknown ownership must never be stolen');
  assert.ok(fs.existsSync(lock));
  for (const owner of [
    '{',
    JSON.stringify({ pid: -1, host: os.hostname(), nonce: crypto.randomUUID() }),
    JSON.stringify({ pid: process.pid, host: 'different-host.invalid', nonce: crypto.randomUUID() }),
  ]) {
    const root = project(); writePlain(root, synthetic());
    const directory = path.join(root, '.sdd/tdd.lock');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'owner.json'), owner);
    fs.utimesSync(directory, new Date(0), new Date(0));
    const before = snapshot(root);
    assert.equal(approve(root).code, 2, 'Unknown, malformed and foreign-host owners must not be stolen');
    assert.deepEqual(snapshot(root), before);
  }
  for (const [target, when] of [
    ['tdd-recovery.json', 'after'], ['tdd.jsonl', 'before'], ['tdd.jsonl', 'after'],
    ['tdd-manifest.json', 'before'], ['tdd-manifest.json', 'after'],
  ]) {
    const root = project(), rows = synthetic(3, 'x'.repeat(2100000));
    writePlain(root, rows);
    const hook = path.join(root, 'interrupt.mjs');
    fs.writeFileSync(hook, [
      "import fs from 'node:fs'; import path from 'node:path';",
      'const original = fs.renameSync;',
      `fs.renameSync = function(from, to) { const selected = path.basename(String(to)) === ${JSON.stringify(target)};`,
      when === 'before' ? 'if(selected) process.exit(97);' : '',
      'const value = original.apply(this, arguments);',
      when === 'after' ? 'if(selected) process.exit(97);' : '',
      'return value; };',
    ].join('\n'));
    const interrupted = command(root, ['tdd', 'compact'], { import: hook });
    assert.equal(interrupted.code, 97, `${target}/${when}: interrupt the intended switch`);
    const refusal = command(root, ['tdd', 'check']);
    assert.equal(refusal.code, 2, 'Unresolved storage must not yield a successful read');
    const recovery = command(root, ['tdd', 'compact']);
    assert.equal(recovery.code, 0, recovery.text);
    assert.ok(logical(root).equals(encode(rows)), `${target}/${when}: preserve every event exactly once`);
    assert.equal(command(root, ['tdd', 'check']).code, 0);
  }
  const concurrent = project(), rows = synthetic(3, 'x'.repeat(2100000));
  writePlain(concurrent, rows);
  const append = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--root', concurrent, 'approve', 'record',
      'calc', '--by', 'ai:ledger-fixture', '--review', 'Independent synthetic fixture review'],
    { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000 });
    let text = '';
    child.stdout.on('data', bytes => { text += bytes; });
    child.stderr.on('data', bytes => { text += bytes; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      try { assert.equal(signal, null, text); assert.equal(code, 0, text); resolve(); }
      catch (error) { reject(error); }
    });
  });
  await Promise.all([append(), append()]);
  assert.ok(logical(concurrent).subarray(0, encode(rows).length).equals(encode(rows)));
  assert.equal(logical(concurrent).toString().trimEnd().split('\n').length, 5);
  assert.equal(command(concurrent, ['tdd', 'check']).code, 0);
});

/** @id TEST-LEDGER-005 @verifies REQ-LEDGER-005 */
test('TEST-LEDGER-005 plain and archived Git baselines retain deletion protection and approval provenance', () => {
  for (const archivedBaseline of [false, true]) for (const archivedCurrent of [false, true]) {
    const root = project(), rows = synthetic();
    if (archivedBaseline) archivedFixture(root, rows); else writePlain(root, rows);
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'Synthetic baseline');
    if (archivedCurrent) archivedFixture(root, rows);
    else {
      fs.rmSync(path.join(root, '.sdd/tdd-manifest.json'), { force: true });
      fs.rmSync(path.join(root, '.sdd/tdd-archive'), { recursive: true, force: true });
      writePlain(root, rows);
    }
    const valid = command(root, ['tdd', 'check']);
    assert.equal(valid.code, 0, `${archivedBaseline}/${archivedCurrent}: ${valid.text}`);
    const fewer = synthetic(2);
    if (archivedCurrent) archivedFixture(root, fewer); else writePlain(root, fewer);
    assert.equal(command(root, ['tdd', 'check']).code, 1, 'Rechaining must not bless removed baseline evidence');
  }
  for (const at of ['2025-12-31T00:00:00.000Z', '2026-01-02T00:00:00.000Z']) {
    const root = project(), rows = synthetic();
    const sealed = archivedFixture(root, rows.slice(0, 2), rows.slice(2));
    const compressed = fs.readFileSync(sealed.file);
    const branch = { ...rows[2], feature: 'other-branch', at };
    delete branch.hash; branch.hash = sha(JSON.stringify(branch));
    fs.appendFileSync(path.join(root, '.sdd/tdd.jsonl'),
      '<<<<<<< branch\n' + JSON.stringify(branch) + '\n=======\n>>>>>>> main\n');
    const merged = command(root, ['tdd', 'merge-ledger']);
    assert.equal(merged.code, 0, merged.text);
    const events = logical(root).toString().trimEnd().split('\n').map(line => JSON.parse(line));
    const identity = ({ seq, prev, hash, ...event }) => JSON.stringify(event);
    assert.deepEqual(events.map(identity).sort(), [...rows, branch].map(identity).sort());
    assert.ok(fs.readFileSync(sealed.file).equals(compressed), 'Merge must not rewrite a sealed blob');
    assert.equal(command(root, ['tdd', 'check']).code, 0);
    const before = snapshot(root);
    assert.equal(command(root, ['tdd', 'merge-ledger']).code, 0);
    assert.deepEqual(snapshot(root), before, 'Repeated merge must be idempotent');
  }
  const root = project();
  const config = { planning: { required: true }, specFeedback: { required: false },
    testCmd: ['node', '--test', '{file}'],
    checks: [{ name: 'test', cmd: ['node', '--test', 'test.mjs'] }] };
  fs.writeFileSync(path.join(root, '.sdd/config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(root, 'calc.mjs'), '/** @id CODE-CALC-001 @implements REQ-CALC-001 */\nexport const one = () => 0;\n');
  fs.writeFileSync(path.join(root, 'test.mjs'), [
    "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { one } from './calc.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 returns one', () => assert.equal(one(), 1));",
  ].join('\n'));
  const plan = { schemaVersion: 1, features: [{ id: 'calc', dependsOn: [] }], tasks: [{
    id: 'TASK-CALC', feature: 'calc', kind: 'implementation', reqs: ['REQ-CALC-001'],
    dependsOn: [], dependencies: {}, artifacts: ['calc.mjs', 'test.mjs'],
    condition: 'Returns one with genuine Red and Green.',
    tests: ['TEST-CALC-001'], checks: [{ name: 'test', argv: ['node', '--test', 'test.mjs'], timeoutMs: 45000 }],
    specs: { '.sdd/specs/calc.md': sha(fs.readFileSync(path.join(root, '.sdd/specs/calc.md'))) },
    status: 'in-progress', receipt: null,
  }] };
  fs.writeFileSync(path.join(root, '.sdd/implementation-plan.json'), JSON.stringify(plan));
  assert.equal(approve(root).code, 0);
  const red = command(root, ['tdd', 'red', 'TEST-CALC-001']);
  assert.equal(red.code, 0, red.text);
  fs.writeFileSync(path.join(root, 'calc.mjs'), '/** @id CODE-CALC-001 @implements REQ-CALC-001 */\nexport const one = () => 1;\n');
  const green = command(root, ['tdd', 'green', 'TEST-CALC-001']);
  assert.equal(green.code, 0, green.text);
  const verified = command(root, ['plan', 'verify', 'TASK-CALC', '--json']);
  assert.equal(verified.code, 0, verified.text);
  plan.tasks[0].status = 'complete';
  plan.tasks[0].receipt = JSON.parse(verified.text).receipt;
  fs.writeFileSync(path.join(root, '.sdd/implementation-plan.json'), JSON.stringify(plan));
  const receipt = fs.readFileSync(path.join(root, plan.tasks[0].receipt));
  const original = logical(root);
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.sdd/check-output/\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'Genuine synthetic application proof before archival');
  const entries = original.toString().trimEnd().split('\n').map(line => JSON.parse(line));
  archivedFixture(root, entries.slice(0, -1), entries.slice(-1));
  assert.ok(logical(root).equals(original));
  for (const args of [['guard'], ['tdd', 'check'], ['plan', 'check', '--json'], ['gate', '--changed', '--json']]) {
    const result = command(root, args);
    assert.equal(result.code, 0, `${args.join(' ')}: ${result.text}`);
  }
  assert.ok(fs.readFileSync(path.join(root, plan.tasks[0].receipt)).equals(receipt));
  fs.writeFileSync(path.join(root, '.sdd/unowned-control.json'), '{}\n');
  const unowned = command(root, ['gate', '--changed', '--json']);
  assert.equal(unowned.code, 2, 'Archival bookkeeping must not waive unrelated unowned files');
  assert.match(unowned.text, /unowned-control\.json.*ownership is unresolved/);
});

/** @id TEST-LEDGER-006 @verifies REQ-LEDGER-006 */
test('TEST-LEDGER-006 copied Copilot and Claude SDK entry points reconstruct the same archive', () => {
  const source = project(); archivedFixture(source, synthetic());
  const current = command(source, ['tdd', 'check']);
  assert.equal(current.code, 0, current.text);
  assert.match(current.text, /3 entries/);
  const repository = path.resolve(scripts, '../../../..');
  const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch],
    { cwd: repository, encoding: 'utf8', env, timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(pack.error);
  assert.equal(pack.status, 0, pack.stderr);
  const tarball = path.join(scratch, JSON.parse(pack.stdout)[0].filename);
  const installed = project(); archivedFixture(installed, synthetic());
  const install = spawnSync('npm', ['install', '--prefix', installed, '--ignore-scripts', '--offline',
    '--no-audit', '--no-fund', tarball], { encoding: 'utf8', env, timeout: 45000 });
  assert.ifError(install.error);
  assert.equal(install.status, 0, install.stdout + install.stderr);
  const wrapper = path.join(installed, 'node_modules/musubix6/bin/musubix6.mjs');
  const run = args => {
    const result = spawnSync(process.execPath, [wrapper, ...args],
      { cwd: installed, encoding: 'utf8', env, timeout: 45000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  assert.match(run(['sdd', 'tdd', 'check', '--root', installed]), /3 entries/);
  assert.match(run(['sdd', '--help']), /tdd compact/);
  run(['init', installed, '--host', 'both', '--only', 'lean-sdd-tdd']);
  for (const host of ['.github', '.claude']) {
    const root = installed;
    const destination = path.join(root, host, 'skills/lean-sdd-tdd/scripts');
    const result = spawnSync(process.execPath, [path.join(destination, 'sdd.mjs'), '--root', root, 'tdd', 'check'],
      { encoding: 'utf8', env, timeout: 45000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /3 entries/, `${host}: installed reader must include archives`);
  }
});

/** @id TEST-LEDGER-007 @verifies REQ-LEDGER-004 REQ-LEDGER-005 */
test('TEST-LEDGER-007 recovery permits a changed tail with byte-identical old and new manifests', () => {
  const root = project(), rows = synthetic();
  writePlain(root, rows);
  for (const feature of ['first-branch', 'second-branch']) {
    const branch = { ...rows.at(-1), feature };
    delete branch.hash; branch.hash = sha(JSON.stringify(branch));
    fs.appendFileSync(path.join(root, '.sdd/tdd.jsonl'), JSON.stringify(branch) + '\n');
    const merged = command(root, ['tdd', 'merge-ledger']);
    assert.equal(merged.code, 0, `${feature}: equal manifest bytes must not imply that the tail was already switched: ${merged.text}`);
    assert.equal(command(root, ['tdd', 'check']).code, 0);
  }
  assert.equal(logical(root).toString().trimEnd().split('\n').length, 5);
});

/** @id TEST-LEDGER-008 @verifies REQ-LEDGER-004 */
test('TEST-LEDGER-008 a paused dead-owner reclaimer cannot poison a successor live writer', async t => {
  const root = project(); writePlain(root, synthetic());
  const previous = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8', env });
  assert.ifError(previous.error); assert.equal(previous.status, 0);
  fs.mkdirSync(path.join(root, '.sdd/tdd.lock'));
  fs.writeFileSync(path.join(root, '.sdd/tdd.lock/owner.json'), JSON.stringify({
    pid: Number(previous.stdout.trim()), host: os.hostname(), nonce: crypto.randomUUID(),
  }));
  const marker = name => path.join(root, name);
  const hook = actor => {
    const file = marker(`reclaimer-${actor}.mjs`);
    fs.writeFileSync(file, [
      "import fs from 'node:fs'; import path from 'node:path';",
      `const root = ${JSON.stringify(root)}, actor = ${JSON.stringify(actor)};`,
      'const mark = name => path.join(root, name);',
      'function wait(name) { const end = Date.now() + 15000; while (!fs.existsSync(mark(name))) { if (Date.now() >= end) throw new Error("Barrier timeout: " + name); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10); } }',
      'const list = fs.readdirSync; let paused = false;',
      'fs.readdirSync = function(directory, ...args) { const result = list.call(this,directory,...args);',
      'if(actor === "a" && !paused && path.basename(String(directory)) === "tdd.lock") { paused = true; fs.writeFileSync(mark("a-ready"),"yes"); wait("release-a"); } return result; };',
      'const link = fs.linkSync;',
      'fs.linkSync = function(from, to) { try { return link.call(this,from,to); } catch(error) { if(actor === "b" && path.basename(String(to)) === "tdd-transition.lock" && error.code === "EEXIST") fs.writeFileSync(mark("b-waiting"),"yes"); throw error; } };',
      'const open = fs.openSync, owners = new Set();',
      'fs.openSync = function(file, ...args) { try { const fd = open.call(this,file,...args); if(path.basename(String(file)) === "owner.json") owners.add(fd); return fd; }',
      'catch(error) { throw error; } };',
      'const write = fs.writeFileSync;',
      'fs.writeFileSync = function(file, value, ...args) { const result = write.call(this,file,value,...args);',
      'if(actor === "b" && owners.has(file) && String(value).includes(`"pid":${process.pid}`)) { owners.delete(file); write.call(this,mark("b-owner"),"yes"); wait("release-b"); } return result; };',
    ].join('\n'));
    return file;
  };
  const children = [];
  function writer(actor) {
    const child = spawn(process.execPath, ['--import', hook(actor), script, '--root', root,
      'approve', 'record', 'calc', '--by', 'ai:ledger-fixture', '--review', 'Independent synthetic fixture review'],
    { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000 });
    children.push(child);
    let text = '';
    child.stdout.on('data', bytes => { text += bytes; });
    child.stderr.on('data', bytes => { text += bytes; });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, text }));
    });
    return { child, done };
  }
  async function until(predicate, label) {
    const end = Date.now() + 20000;
    while (!predicate()) {
      assert.ok(Date.now() < end, `Timed out waiting for ${label}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
  const a = writer('a');
  try {
    await until(() => fs.existsSync(marker('a-ready')) || a.child.exitCode !== null, 'paused reclaimer');
    assert.ok(fs.existsSync(marker('a-ready')));
    const b = writer('b');
    await until(() => fs.existsSync(marker('b-owner')) || fs.existsSync(marker('b-waiting'))
      || b.child.exitCode !== null, 'successor writer or protected transition');
    fs.writeFileSync(marker('release-a'), 'yes');
    const resultA = await a.done;
    fs.writeFileSync(marker('release-b'), 'yes');
    const resultB = await b.done;
    assert.equal(resultA.signal, null, resultA.text);
    assert.equal(resultA.code, 0, `Paused reclaimer must serialize without poisoning its successor: ${resultA.text}`);
    assert.equal(resultB.signal, null, resultB.text);
    assert.equal(resultB.code, 0, `Successor live writer must release its own clean lock: ${resultB.text}`);
    assert.equal(command(root, ['tdd', 'check']).code, 0);
    assert.equal(logical(root).toString().trimEnd().split('\n').length, 5);
  } finally {
    fs.writeFileSync(marker('release-a'), 'yes');
    fs.writeFileSync(marker('release-b'), 'yes');
  }
});

/** @id TEST-LEDGER-009 @verifies REQ-LEDGER-005 */
test('TEST-LEDGER-009 gate detects an archive mutation before a later check can restore it', () => {
  const root = project();
  fs.writeFileSync(path.join(root, '.sdd/config.json'), JSON.stringify({
    planning: { required: false }, specFeedback: { required: false },
    testCmd: ['node', '--test', '{file}'],
    checks: ['first', 'second'].map(name => ({ name, cmd: ['node', '--test', 'test.mjs'] })),
  }));
  const implementation = result => `/** @id CODE-CALC-001 @implements REQ-CALC-001 */\nexport const one = () => ${result};\n`;
  fs.writeFileSync(path.join(root, 'calc.mjs'), implementation(0));
  fs.writeFileSync(path.join(root, 'test.mjs'), [
    "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { one } from './calc.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 returns one', () => assert.equal(one(), 1));",
  ].join('\n'));
  assert.equal(approve(root).code, 0);
  const red = command(root, ['tdd', 'red', 'TEST-CALC-001']);
  assert.equal(red.code, 0, red.text);
  fs.writeFileSync(path.join(root, 'calc.mjs'), implementation(1));
  const green = command(root, ['tdd', 'green', 'TEST-CALC-001']);
  assert.equal(green.code, 0, green.text);
  const entries = logical(root).toString().trimEnd().split('\n').map(line => JSON.parse(line));
  const archive = archivedFixture(root, entries);
  const valid = command(root, ['gate']);
  assert.equal(valid.code, 0, valid.text);
  const compressed = fs.readFileSync(archive.file);
  const hook = path.join(root, 'gate-archive-mutation.mjs');
  fs.writeFileSync(hook, [
    "import fs from 'node:fs'; import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';",
    `const file = ${JSON.stringify(archive.file)}, marker = ${JSON.stringify(path.join(root, 'mutation-executed'))};`,
    'const original = fs.readFileSync(file), spawn = cp.spawnSync; let checks = 0;',
    'cp.spawnSync = function(command, args, options) { const result = spawn.apply(this,arguments);',
    'if(args?.includes("--test") && args.includes("test.mjs")) {',
    'if(checks++ === 0) { const mutant = Buffer.from(original); mutant[mutant.length - 8] ^= 1; fs.writeFileSync(file,mutant); fs.writeFileSync(marker,"yes"); }',
    'else fs.writeFileSync(file,original); } return result; }; syncBuiltinESMExports();',
  ].join('\n'));
  try {
    const changed = command(root, ['gate'], { import: hook });
    assert.ok(fs.existsSync(path.join(root, 'mutation-executed')), 'The real first check must execute before tamper detection');
    assert.equal(changed.code, 1, `Archive mutation must stop the gate before a later check restores it: ${changed.text}`);
    assert.ok(!fs.readFileSync(archive.file).equals(compressed), 'The later restoring check must not execute');
    assert.match(changed.text, /validated inputs|input.*(?:changed|mutat)|archive digest mismatch/i);
  } finally { fs.writeFileSync(archive.file, compressed); }
  const restored = command(root, ['gate']);
  assert.equal(restored.code, 0, restored.text);
});

/** @id TEST-LEDGER-010 @verifies REQ-LEDGER-005 REQ-LEDGER-006 */
test('TEST-LEDGER-010 importing the standalone SDK exposes strict read-only logical bytes without CLI dispatch', () => {
  const root = project(), rows = synthetic();
  writePlain(root, rows);
  const read = () => spawnSync(process.execPath, ['--input-type=module', '-e', [
    "import assert from 'node:assert/strict';",
    `const sdk = await import(${JSON.stringify(pathToFileURL(script).href)});`,
    'assert.equal(process.exitCode, undefined, "Import must not alter exitCode");',
    'assert.equal(typeof sdk.readLedgerHistory, "function");',
    `try { const bytes = sdk.readLedgerHistory(${JSON.stringify(root)});`,
    'console.log(JSON.stringify({ bytes: bytes.toString("base64") })); }',
    'catch(error) { console.error(error.message); process.exitCode = error.exit ?? 1; }',
  ].join('\n')], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
  const expected = encode(rows);
  function accepted() {
    const before = snapshot(root), result = read();
    assert.ifError(result.error);
    assert.equal(result.status, 0, `Import and read must succeed without dispatch: ${result.stdout}${result.stderr}`);
    assert.deepEqual(Buffer.from(JSON.parse(result.stdout).bytes, 'base64'), expected);
    assert.deepEqual(snapshot(root), before);
  }
  accepted();
  const archive = archivedFixture(root, rows);
  accepted();
  for (const name of ['tdd-transition.lock', 'tdd-recovery.json']) {
    const file = path.join(root, '.sdd', name);
    fs.writeFileSync(file, '{}');
    const before = snapshot(root), result = read();
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(snapshot(root), before);
    fs.unlinkSync(file);
  }
  for (const file of [archive.file, path.join(root, '.sdd/tdd-manifest.json')]) {
    const bytes = fs.readFileSync(file);
    fs.unlinkSync(file);
    const before = snapshot(root), result = read();
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(snapshot(root), before);
    fs.writeFileSync(file, bytes);
  }
  const direct = command(root, ['tdd', 'check']);
  assert.equal(direct.code, 0, direct.text);
  assert.match(direct.text, /LEDGER OK \(3 entries\)/);
  const link = path.join(root, 'sdk-link.mjs');
  fs.symlinkSync(script, link);
  const linked = spawnSync(process.execPath, [link, '--root', root, 'tdd', 'check'],
    { env, encoding: 'utf8', timeout: 15000 });
  assert.ifError(linked.error);
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stdout, /LEDGER OK \(3 entries\)/, 'Symlink invocation must still dispatch the CLI');
  for (const args of [['tdd', 'check'], ['plan', 'check', '--json'], ['context', 'calc', '--json']]) {
    const preserved = spawnSync(process.execPath, ['--preserve-symlinks-main', link, '--root', root, ...args],
      { env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(preserved.error);
    assert.equal(preserved.status, 0, preserved.stderr);
    if (args[0] === 'tdd') assert.match(preserved.stdout, /LEDGER OK \(3 entries\)/,
      'Preserved symlink invocation must still dispatch the CLI');
    else if (args[0] === 'plan') assert.equal(JSON.parse(preserved.stdout).enabled, false,
      'Preserved symlink invocation must resolve the SDK planning modules');
    else assert.equal(JSON.parse(preserved.stdout).kind, 'reading-context');
  }
  for (const entry of [[script], ['--preserve-symlinks-main', link]]) {
    const diagnostics = spawnSync(process.execPath, [...entry, 'diagnostics', '--profile', 'unsupported', '--json'],
      { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(diagnostics.error);
    assert.equal(diagnostics.status, 2, diagnostics.stderr);
    assert.match(diagnostics.stdout, /Invalid diagnostics input: --profile requires/);
    assert.equal(JSON.parse(diagnostics.stdout).status, 'INCOMPLETE');
  }
  const enabled = project(), configFile = path.join(enabled, '.sdd/config.json');
  const config = JSON.parse(fs.readFileSync(configFile));
  config.planning.required = true;
  fs.writeFileSync(configFile, JSON.stringify(config));
  for (const entry of [[script], ['--preserve-symlinks-main', link]]) {
    const missing = spawnSync(process.execPath, [...entry, '--root', enabled, 'plan', 'check', '--json'],
      { env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(missing.error);
    assert.equal(missing.status, 2, missing.stderr);
    const result = JSON.parse(missing.stdout);
    assert.equal(result.enabled, true);
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.errors[0].reason, /implementation-plan\.json: required input unavailable \(ENOENT\)/);
  }
  const original = fs.readFileSync(archive.file), corrupt = Buffer.from(original);
  corrupt[corrupt.length - 8] ^= 1;
  fs.writeFileSync(archive.file, corrupt);
  const before = snapshot(root), rejected = read();
  assert.ifError(rejected.error);
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.match(rejected.stderr, /archive digest mismatch/);
  assert.deepEqual(snapshot(root), before);
  fs.writeFileSync(archive.file, original);
  fs.mkdirSync(path.join(root, '.sdd/tdd.lock'));
  const locked = snapshot(root), refused = read();
  assert.ifError(refused.error);
  assert.equal(refused.status, 2, refused.stderr);
  assert.match(refused.stderr, /writer lock is occupied/);
  assert.deepEqual(snapshot(root), locked);
});

/** @id TEST-LEDGER-011 @verifies REQ-LEDGER-005 */
test('TEST-LEDGER-011 release catalogues bind the complete logical ledger rather than its active tail', async () => {
  const { cellCatalogue } = await import('../../../../scripts/release-qualification-cells.mjs');
  const root = project(), rows = synthetic(), raw = encode(rows);
  writePlain(root, rows);
  fs.writeFileSync(path.join(root, '.sdd/implementation-plan.json'), JSON.stringify({
    schemaVersion: 1, features: [], tasks: [{
      id: 'TASK-CALC', artifacts: [], specs: {}, dependencies: {},
    }],
  }));
  const catalogue = () => cellCatalogue({}, { id: 'INTEGRATED-GATE', kind: 'gate' }, root);
  assert.deepEqual(catalogue()[0].ledger, { bytes: raw.length, sha256: sha(raw) });
  const archive = archivedFixture(root, rows);
  assert.deepEqual(catalogue()[0].ledger, { bytes: raw.length, sha256: sha(raw) },
    'Release catalogue must retain archived event bytes and their logical digest');
  const corrupt = fs.readFileSync(archive.file);
  corrupt[corrupt.length - 8] ^= 1;
  fs.writeFileSync(archive.file, corrupt);
  assert.throws(catalogue, /archive digest mismatch/, 'Corrupt storage must not yield a successful catalogue');
});
