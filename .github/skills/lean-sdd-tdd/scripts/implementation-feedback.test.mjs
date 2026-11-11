import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordFeedback } from './implementation-feedback.mjs';

const script = process.env.SDD_SCRIPT_UNDER_TEST ?? fileURLToPath(new URL('./sdd.mjs', import.meta.url));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const sha = value => createHash('sha256').update(value).digest('hex');
function write(root, file, value) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}
function call(root, ...args) {
  const result = spawnSync(process.execPath, [script, ...args, '--root', root],
    { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return { exit: result.status, text: result.stdout, error: result.stderr };
}
function json(result, expected = 0) {
  assert.equal(result.exit, expected, result.text + result.error);
  assert.match(result.text, /^\s*\{/, 'The requested feedback/plan command must return structured JSON.');
  return JSON.parse(result.text);
}
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'musubix-feedback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function fixture(t, names = ['a']) {
  const root = temporary(t), document = { schemaVersion: 1, features: [], tasks: [] };
  const req = name => `REQ-FB-FIX-${name.toUpperCase()}`;
  const tid = name => `TEST-FB-FIX-${name.toUpperCase()}`;
  const cid = name => `CODE-FB-FIX-${name.toUpperCase()}`;
  const spec = name => `.sdd/specs/${name}.md`;
  const base = name => `---\nfeature: ${name}\ntier: T1\n---\n| ${req(name)} | When read, value shall return 2. | ${tid(name)} |\n`;
  const implementation = (name, value) => `/** @id ${cid(name)} @implements ${req(name)} */\nexport const value = () => ${value};\n`;
  const config = { planning: { required: true }, specFeedback: { required: true },
    testCmd: [process.execPath, '--test', '--test-name-pattern', '{id}(?![0-9A-Za-z])', '{file}'],
    checks: [{ name: 'test', cmd: [process.execPath, '--test', ...names.map(name => `${name}.test.mjs`)], timeoutMs: 20000 }],
    timeoutMs: 20000 };
  for (const name of names) {
    write(root, spec(name), base(name));
    write(root, `${name}.mjs`, implementation(name, 0));
    write(root, `${name}.test.mjs`, `import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {value} from './${name}.mjs';\n/** @id ${tid(name)} @verifies ${req(name)} */\ntest('${tid(name)}',()=>assert.equal(value(),2));\n`);
    document.features.push({ id: name, dependsOn: [] });
    document.tasks.push({ id: name, feature: name, kind: 'implementation', reqs: [req(name)], dependsOn: [],
      artifacts: [`${name}.mjs`], condition: 'The current implementation returns 2.', tests: [tid(name)],
      checks: [{ name: 'sentinel', argv: [process.execPath, '-e',
        `require('node:fs').writeFileSync('check-${name}.txt','ran');`], timeoutMs: 20000 }],
      specs: {}, dependencies: {}, status: 'not-started', receipt: null });
  }
  const save = () => {
    for (const task of document.tasks) task.specs = { [spec(task.feature)]: sha(fs.readFileSync(path.join(root, spec(task.feature)))) };
    write(root, '.sdd/implementation-plan.json', document);
    write(root, '.sdd/config.json', config);
  };
  const entries = new Map(names.map(name => [name, []]));
  const entry = (name, digest, id = `change-${entries.get(name).length + 1}`) =>
    ({ schemaVersion: 1, id, implementationSha256: digest, summary: 'Update the value implementation and retain the intended return contract.',
      reqs: [req(name)], tests: [tid(name)] });
  const setEntries = (name, values) => {
    entries.set(name, values);
    write(root, spec(name), base(name) + values.map(value => `\n\`\`\`sdd-feedback\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n\`\`\`\n`).join(''));
    save();
  };
  const state = (name = 'a', expected = 2) => json(call(root, 'feedback', 'status', name, '--json'), expected);
  const accept = (name = 'a', id) => {
    const observed = call(root, 'feedback', 'status', name, '--json');
    assert.ok([0, 1, 2].includes(observed.exit), observed.text + observed.error);
    const result = json(observed, observed.exit);
    const digest = result.features.find(row => row.feature === name).implementationSha256;
    setEntries(name, [...entries.get(name), entry(name, digest, id)]);
    return json(call(root, 'feedback', 'record', name, '--json'));
  };
  const native = () => {
    for (const name of names) {
      assert.equal(call(root, 'tdd', 'red', tid(name)).exit, 0);
      write(root, `${name}.mjs`, implementation(name, 2));
      const green = call(root, 'tdd', 'green', tid(name));
      assert.equal(green.exit, 0, green.text + green.error);
    }
  };
  const context = () => ({ root, config: JSON.parse(fs.readFileSync(path.join(root, '.sdd/config.json'), 'utf8')),
    model: { ...document, root, scope: names, tasks: document.tasks.map(task => ({ ...task, effectiveDeps: task.dependsOn })),
      specs: names.map(name => ({ feature: name, path: spec(name), reqs: [{ id: req(name), tests: [tid(name)] }] })) },
    files: names.flatMap(name => [`${name}.mjs`, `${name}.test.mjs`]),
    entities: names.flatMap(name => [
      { id: cid(name), kind: 'CODE', path: `${name}.mjs`, refs: { implements: [req(name)] } },
      { id: tid(name), kind: 'TEST', path: `${name}.test.mjs`, refs: { verifies: [req(name)] } },
    ]) });
  save();
  return { root, config, document, entries, save, req, tid, cid, spec, base, implementation, entry, setEntries, state, accept, native, context };
}
const history = root => fs.readFileSync(path.join(root, '.sdd/spec-feedback.jsonl'), 'utf8');

/** @id TEST-FEEDBACK-001 @verifies REQ-FEEDBACK-001 */
test('TEST-FEEDBACK-001 activation is explicit, finite and compatible with existing projects', t => {
  const root = temporary(t);
  assert.equal(call(root, 'init').exit, 0);
  const config = JSON.parse(fs.readFileSync(path.join(root, '.sdd/config.json'), 'utf8'));
  assert.equal(config.specFeedback?.required, true, 'Fresh init must enable mandatory implementation feedback.');
  for (const setting of [undefined, {}, { required: false }]) {
    const f = fixture(t);
    if (setting === undefined) delete f.config.specFeedback;
    else f.config.specFeedback = setting;
    f.config.planning = { required: false };
    f.save();
    write(f.root, '.sdd/spec-feedback.jsonl', 'malformed history deliberately outside the disabled feature\n');
    assert.equal(json(call(f.root, 'feedback', 'status', '--json')).status, 'DISABLED');
    const before = fs.readFileSync(path.join(f.root, '.sdd/config.json'), 'utf8');
    assert.equal(call(f.root, 'init').exit, 0);
    assert.equal(fs.readFileSync(path.join(f.root, '.sdd/config.json'), 'utf8'), before);
  }
  for (const setting of [null, false, [], 'true', { required: null }, { required: 0 },
    { required: 'true' }, { required: true, typo: true }]) {
    const f = fixture(t); f.config.specFeedback = setting; f.save();
    assert.equal(json(call(f.root, 'feedback', 'status', '--json'), 2).status, 'INCOMPLETE');
    assert.equal(fs.existsSync(path.join(f.root, '.sdd/spec-feedback.jsonl')), false);
  }
  const f = fixture(t);
  f.config.planning = { required: false }; f.save();
  json(call(f.root, 'feedback', 'status', '--json'), 2);
  assert.equal(json(call(f.root, 'plan', 'verify', 'a', '--json'), 2).status, 'INCOMPLETE');
  assert.equal(fs.existsSync(path.join(f.root, 'check-a.txt')), false);
  const installed = fixture(t); installed.native();
  installed.config.planning = { required: false }; installed.save();
  const tool = path.join(temporary(t), 'sdd.mjs');
  fs.copyFileSync(script, tool);
  const unavailable = spawnSync(process.execPath, [tool, 'gate', '--json', '--root', installed.root],
    { cwd: installed.root, env, encoding: 'utf8', timeout: 60000 });
  assert.ifError(unavailable.error);
  assert.equal(unavailable.status, 2, 'An incomplete installation must not bypass enabled feedback through legacy planning fallback.');
});

/** @id TEST-FEEDBACK-002 @verifies REQ-FEEDBACK-002 */
test('TEST-FEEDBACK-002 inventory reconciles unmapped, shared, deleted and transferred sources', t => {
  const f = fixture(t);
  const initial = f.state().features[0];
  const expectedRows = [{ path: 'a.mjs', sha256: sha(f.implementation('a', 0)),
    owners: [{ feature: 'a', task: 'a', reqs: [f.req('a')], codes: [f.cid('a')] }] }];
  assert.equal(initial.implementationSha256, sha(JSON.stringify(expectedRows)), 'Digest follows the specified independent ownership table.');
  f.accept();
  const before = history(f.root);
  for (const file of ['unregistered.mjs', 'looks-like-test.mjs']) {
    write(f.root, file, 'export const unowned = true;\n');
    assert.match(JSON.stringify(f.state('a', 2).errors), /ownership|mapping/i);
    fs.unlinkSync(path.join(f.root, file));
  }
  write(f.root, '.sdd/evidence/run.mjs', 'throw new Error("generated execution evidence");\n');
  assert.equal(f.state('a', 0).features[0].implementationSha256, initial.implementationSha256);
  assert.equal(history(f.root), before);
  fs.unlinkSync(path.join(f.root, 'a.mjs'));
  f.document.tasks[0].artifacts = [f.spec('a')]; f.save();
  f.state('a', 1);
  f.accept('a', 'remove-source');
  assert.equal(f.state('a', 0).features[0].implementationSha256, sha('[]'));
  const shared = fixture(t, ['a', 'b']);
  write(shared.root, 'shared.mjs', `/** @id ${shared.cid('a')} @implements ${shared.req('a')} */\n/** @id ${shared.cid('b')} @implements ${shared.req('b')} */\nexport const value = () => 2;\n`);
  for (const name of ['a', 'b']) {
    fs.unlinkSync(path.join(shared.root, `${name}.mjs`));
    shared.document.tasks.find(task => task.id === name).artifacts = ['shared.mjs'];
  }
  shared.save(); shared.accept('a'); shared.accept('b');
  write(shared.root, 'shared.mjs', fs.readFileSync(path.join(shared.root, 'shared.mjs'), 'utf8') + '// refactor\n');
  for (const name of ['a', 'b']) shared.state(name, 1);
  shared.accept('a', 'shared-refactor-a');
  shared.state('b', 1);
  shared.accept('b', 'shared-refactor-b');
  shared.document.tasks[0].artifacts = [shared.spec('a')];
  write(shared.root, 'shared.mjs', `/** @id ${shared.cid('b')} @implements ${shared.req('b')} */\nexport const value = () => 2;\n`);
  shared.save();
  shared.state('a', 1); shared.state('b', 1);
  shared.accept('a', 'transfer-away');
  shared.state('a', 1);
  shared.accept('b', 'transfer-in');
  shared.state('a', 0);
  write(shared.root, 'shared.mjs', fs.readFileSync(path.join(shared.root, 'shared.mjs'), 'utf8') + '// b-only\n');
  shared.state('a', 0); shared.state('b', 1);
  for (const order of ['sender-first-empty', 'recipient-first', 'recipient-first-drift']) {
    const recipientFirst = order !== 'sender-first-empty';
    const transfer = fixture(t, ['a', 'b']);
    transfer.accept('a'); transfer.accept('b');
    transfer.document.tasks[0].artifacts = [transfer.spec('a')];
    transfer.document.tasks[1].artifacts = ['a.mjs', 'b.mjs'];
    write(transfer.root, 'a.mjs', `/** @id CODE-FB-TRANSFER @implements ${transfer.req('b')} */\nexport const value = () => 0;\n`);
    transfer.save();
    if (recipientFirst) transfer.accept('b', 'receive-first');
    if (order === 'recipient-first-drift') {
      write(transfer.root, 'a.mjs', fs.readFileSync(path.join(transfer.root, 'a.mjs'), 'utf8') + '// changed handoff\n');
    }
    transfer.accept('a', 'send');
    if (recipientFirst) {
      if (order === 'recipient-first-drift') {
        transfer.state('a', 1);
        transfer.accept('b', 'receive-final-handoff');
      }
      transfer.state('a', 0);
    } else {
      fs.unlinkSync(path.join(transfer.root, 'a.mjs'));
      transfer.document.tasks[1].artifacts = ['b.mjs']; transfer.save();
      transfer.state('a', 1);
      transfer.state('b', 1);
      transfer.accept('b', 'acknowledge-now-empty-transfer');
      transfer.state('a', 0); transfer.state('b', 0);
    }
    write(transfer.root, 'b.mjs', transfer.implementation('b', 2));
    transfer.state('a', 0);
  }
});

/** @id TEST-FEEDBACK-003 @verifies REQ-FEEDBACK-003 */
test('TEST-FEEDBACK-003 canonical entries are mandatory, complete, immutable and replay resistant', t => {
  const f = fixture(t);
  const digest = f.state().features[0].implementationSha256;
  const valid = f.entry('a', digest);
  for (const changes of [{ schemaVersion: 0 }, { id: '' }, { summary: ' ' }, { reqs: [] },
    { reqs: ['REQ-UNKNOWN-001'] }, { tests: [] }, { tests: ['TEST-UNKNOWN-001'] },
    { implementationSha256: '0'.repeat(64) }, { extra: 'not an accepted field' }]) {
    f.setEntries('a', [{ ...valid, ...changes }]);
    json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
    assert.equal(fs.existsSync(path.join(f.root, '.sdd/spec-feedback.jsonl')), false);
  }
  f.setEntries('a', ['{']);
  json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
  f.setEntries('a', [valid]);
  json(call(f.root, 'feedback', 'record', 'a', '--json'));
  const before = history(f.root);
  json(call(f.root, 'feedback', 'record', 'a', '--json'));
  assert.equal(history(f.root), before, 'Recording already-current feedback is read-only and idempotent.');
  const nativeTest = fs.readFileSync(path.join(f.root, 'a.test.mjs'));
  fs.unlinkSync(path.join(f.root, 'a.test.mjs'));
  json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
  assert.equal(history(f.root), before, 'Loss of an accepted entry TEST reference must not append acceptance.');
  write(f.root, 'a.test.mjs', nativeTest.toString('utf8'));
  json(call(f.root, 'feedback', 'record', 'a', '--json'));
  assert.equal(history(f.root), before, 'Restoring the TEST must preserve valid idempotent acceptance.');
  let contextReads = 0;
  const losingReference = () => {
    const context = f.context();
    if (++contextReads === 2) {
      fs.unlinkSync(path.join(f.root, 'a.test.mjs'));
      context.entities = context.entities.filter(entity => entity.kind !== 'TEST');
      context.files = context.files.filter(file => !file.endsWith('.test.mjs'));
    }
    return context;
  };
  const lost = recordFeedback(losingReference, 'a');
  write(f.root, 'a.test.mjs', nativeTest.toString('utf8'));
  assert.equal(lost.exit, 2, 'The second read must also validate current TEST mappings.');
  assert.equal(history(f.root), before);
  fs.unlinkSync(path.join(f.root, 'a.test.mjs'));
  let recoveringReads = 0;
  const recoveringReference = () => {
    if (++recoveringReads === 2) write(f.root, 'a.test.mjs', nativeTest.toString('utf8'));
    const context = f.context();
    if (recoveringReads === 1) {
      context.entities = context.entities.filter(entity => entity.kind !== 'TEST');
      context.files = context.files.filter(file => !file.endsWith('.test.mjs'));
    }
    return context;
  };
  const recoveredDuringAcceptance = recordFeedback(recoveringReference, 'a');
  write(f.root, 'a.test.mjs', nativeTest.toString('utf8'));
  assert.equal(recoveredDuringAcceptance.exit, 2, 'An initially invalid mapping must not become idempotent success during acceptance.');
  f.setEntries('a', [{ ...valid, summary: 'Rewrite accepted design history.' }]);
  json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
  assert.equal(history(f.root), before);
  f.setEntries('a', [{ ...valid, summary: 'Rewrite an old note while adding a fresh ID.' },
    f.entry('a', digest, 'fresh-id-cannot-hide-rewritten-history')]);
  json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
  assert.equal(history(f.root), before);
  f.setEntries('a', [valid]);
  write(f.root, 'a.mjs', f.implementation('a', 2));
  f.accept('a', 'revision-b');
  write(f.root, 'a.mjs', f.implementation('a', 0));
  f.setEntries('a', [...f.entries.get('a'), valid]);
  json(call(f.root, 'feedback', 'record', 'a', '--json'), 2);
  f.setEntries('a', f.entries.get('a').slice(0, -1));
  f.accept('a', 'revision-a-again');
  f.state('a', 0);
});

/** @id TEST-FEEDBACK-004 @verifies REQ-FEEDBACK-004 */
test('TEST-FEEDBACK-004 verify and gates reject missing feedback before checks but accept valid native evidence', t => {
  const f = fixture(t); f.native();
  const refused = call(f.root, 'plan', 'verify', 'a', '--json');
  assert.equal(refused.exit, 2, 'Missing feedback must block verification before executing its declared checks.');
  assert.equal(fs.existsSync(path.join(f.root, 'check-a.txt')), false);
  f.accept();
  const result = json(call(f.root, 'plan', 'verify', 'a', '--json'));
  assert.equal(fs.readFileSync(path.join(f.root, 'check-a.txt'), 'utf8'), 'ran');
  f.document.tasks[0].status = 'complete'; f.document.tasks[0].receipt = result.receipt; f.save();
  assert.equal(json(call(f.root, 'gate', '--json')).verdict, 'PASS');
  for (const args of [['init', '-q'], ['add', '.'],
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Current feedback control']]) {
    const git = spawnSync('git', args, { cwd: f.root, env, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stdout + git.stderr);
  }
  write(f.root, 'a.mjs', f.implementation('a', 3));
  fs.unlinkSync(path.join(f.root, 'check-a.txt'));
  assert.notEqual(call(f.root, 'plan', 'verify', 'a', '--json').exit, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'check-a.txt')), false);
  assert.notEqual(call(f.root, 'gate', '--json').exit, 0);
  assert.notEqual(call(f.root, 'gate', '--changed', '--json').exit, 0);
  assert.equal(call(f.root, 'tdd', 'red', f.tid('a')).exit, 0, 'Pending feedback must not block genuine Red.');
  write(f.root, 'a.mjs', f.implementation('a', 2));
  const green = call(f.root, 'tdd', 'green', f.tid('a'));
  assert.equal(green.exit, 0, green.text + green.error);
  f.accept('a', 'post-test-reconciliation');
  const verified = json(call(f.root, 'plan', 'verify', 'a', '--json'));
  f.document.tasks[0].receipt = verified.receipt; f.save();
  assert.equal(json(call(f.root, 'gate', '--changed', '--json')).verdict, 'PASS');
  const clean = fixture(t); clean.native(); clean.accept();
  const complete = json(call(clean.root, 'plan', 'verify', 'a', '--json'));
  clean.document.tasks[0].status = 'complete'; clean.document.tasks[0].receipt = complete.receipt; clean.save();
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: clean.root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Accepted baseline');
  write(clean.root, 'orphan.mjs', 'export const orphan = 1;\n');
  git('add', 'orphan.mjs');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Unmapped committed source');
  const emptyUnresolved = call(clean.root, 'gate', '--changed', '--json');
  assert.equal(emptyUnresolved.exit, 2, 'An empty changed-task scope must still reject unresolved inventory.');
  assert.match(emptyUnresolved.text, /ownership|mapping/i);
  fs.unlinkSync(path.join(clean.root, 'orphan.mjs')); git('add', '-A');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Restore mapped inventory');
  const preserved = history(clean.root);
  write(clean.root, '.sdd/spec-feedback.jsonl', '{');
  assert.equal(call(clean.root, 'gate', '--changed', '--json').exit, 2,
    'Bookkeeping-only changes must not hide malformed feedback history.');
  write(clean.root, '.sdd/spec-feedback.jsonl', preserved);
  assert.equal(json(call(clean.root, 'gate', '--changed', '--json')).verdict, 'PASS',
    'Valid inventory and history must pass with an empty changed-task scope.');
  const live = fixture(t), trigger = path.join(temporary(t), 'change-history');
  live.config.checks.push({ name: 'history-boundary', cmd: [process.execPath, '-e',
    `const fs=require('node:fs');if(fs.existsSync(${JSON.stringify(trigger)}))fs.appendFileSync('.sdd/spec-feedback.jsonl','\\n');`],
    timeoutMs: 20000 });
  live.save(); live.native(); live.accept();
  const receipt = json(call(live.root, 'plan', 'verify', 'a', '--json'));
  live.document.tasks[0].status = 'complete'; live.document.tasks[0].receipt = receipt.receipt; live.save();
  for (const args of [['init', '-q'], ['add', '.'],
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Stable live boundary control']]) {
    const result = spawnSync('git', args, { cwd: live.root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(json(call(live.root, 'gate', '--changed', '--json')).verdict, 'PASS');
  write(path.dirname(trigger), path.basename(trigger), 'armed');
  const changedHistory = call(live.root, 'gate', '--changed', '--json');
  assert.equal(changedHistory.exit, 1, 'A valid but different history snapshot during checks must prevent gate success.');
  assert.match(changedHistory.text, /feedback inventory or history changed during gate/i);
  const checking = fixture(t);
  checking.document.tasks[0].checks.push({ name: 'change-history', argv: [process.execPath, '-e',
    "require('node:fs').appendFileSync('.sdd/spec-feedback.jsonl','\\n');"], timeoutMs: 20000 });
  checking.save(); checking.native(); checking.accept();
  const changedVerification = json(call(checking.root, 'plan', 'verify', 'a', '--json'), 1);
  assert.match(JSON.stringify(changedVerification.errors), /feedback inventory or history changed during verification/i);
  const retained = JSON.parse(fs.readFileSync(path.join(checking.root, changedVerification.receipt), 'utf8'));
  assert.equal(retained.status, 'FAIL', 'A post-check history change must retain a failed, not successful, receipt.');
});

/** @id TEST-FEEDBACK-005 @verifies REQ-FEEDBACK-005 */
test('TEST-FEEDBACK-005 recording serializes writers, retains the chain and detects deterministic input races', t => {
  const f = fixture(t);
  const expectedRows = [{ path: 'a.mjs', sha256: sha(f.implementation('a', 0)),
    owners: [{ feature: 'a', task: 'a', reqs: [f.req('a')], codes: [f.cid('a')] }] }];
  f.setEntries('a', [f.entry('a', sha(JSON.stringify(expectedRows)))]);
  const accepted = recordFeedback(f.context, 'a');
  assert.equal(accepted.exit, 0, 'A complete explicit first entry must establish current feedback.');
  const before = history(f.root);
  fs.mkdirSync(path.join(f.root, '.sdd/spec-feedback.lock'));
  assert.equal(recordFeedback(f.context, 'a').exit, 2);
  assert.equal(history(f.root), before);
  assert.equal(fs.existsSync(path.join(f.root, '.sdd/spec-feedback.lock')), true);
  fs.rmdirSync(path.join(f.root, '.sdd/spec-feedback.lock'));
  write(f.root, 'a.mjs', f.implementation('a', 2));
  const rows = [{ ...expectedRows[0], sha256: sha(f.implementation('a', 2)) }];
  f.setEntries('a', [...f.entries.get('a'), f.entry('a', sha(JSON.stringify(rows)), 'second')]);
  let reads = 0;
  const racing = () => {
    if (++reads === 2) write(f.root, 'a.mjs', f.implementation('a', 3));
    return f.context();
  };
  assert.notEqual(recordFeedback(racing, 'a').exit, 0, 'Mutation at the second input barrier must prevent acceptance.');
  assert.ok(reads >= 2);
  assert.equal(history(f.root), before);
  write(f.root, 'a.mjs', f.implementation('a', 2));
  assert.equal(recordFeedback(f.context, 'a').exit, 0);
  const records = history(f.root).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.equal(records[1].previous, records[0].hash);
  const complete = history(f.root);
  const invalidAck = records.map(record => ({ ...record }));
  invalidAck[1].acknowledges = ['a'.repeat(64)];
  const invalidPayload = { ...invalidAck[1] }; delete invalidPayload.hash;
  invalidAck[1].hash = sha(JSON.stringify(invalidPayload));
  write(f.root, '.sdd/spec-feedback.jsonl', invalidAck.map(record => JSON.stringify(record)).join('\n') + '\n');
  assert.equal(recordFeedback(f.context, 'a').exit, 2, 'A correctly hashed unknown transfer acknowledgement must be refused.');
  write(f.root, '.sdd/spec-feedback.jsonl', complete);
  const corrupted = records.map(record => ({ ...record })); corrupted[0].specSha256 = '0'.repeat(64);
  write(f.root, '.sdd/spec-feedback.jsonl', corrupted.map(record => JSON.stringify(record)).join('\n') + '\n');
  assert.equal(recordFeedback(f.context, 'a').exit, 2);
  assert.equal(history(f.root), corrupted.map(record => JSON.stringify(record)).join('\n') + '\n');
  write(f.root, '.sdd/spec-feedback.jsonl', complete);
  assert.equal(recordFeedback(f.context, 'a').exit, 0);
  const maximum = 8 * 1024 * 1024;
  const padded = complete.replace('"schemaVersion"', ' '.repeat(maximum - Buffer.byteLength(complete)) + '"schemaVersion"');
  assert.equal(Buffer.byteLength(padded), maximum);
  write(f.root, '.sdd/spec-feedback.jsonl', padded);
  assert.equal(recordFeedback(f.context, 'a').exit, 0, 'Valid history at the inclusive byte limit remains usable.');
  const oversized = padded.replace('"schemaVersion"', ' ' + '"schemaVersion"');
  write(f.root, '.sdd/spec-feedback.jsonl', oversized);
  assert.equal(recordFeedback(f.context, 'a').exit, 2, 'One byte beyond the history budget must refuse before writing.');
  assert.equal(history(f.root), oversized);
  write(f.root, '.sdd/spec-feedback.jsonl', complete);
  assert.equal(recordFeedback(f.context, 'a').exit, 0);
});
