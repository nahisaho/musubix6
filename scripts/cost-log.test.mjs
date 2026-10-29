import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./cost-log.py', import.meta.url));
const legacy = `# AI cost log (USD)

- Sessions: 1
- **Total: $10.00**

## By model
| Model | Calls | USD | Input tokens | Output tokens |
|---|---:|---:|---:|---:|
| gpt-test | 2 | $10.00 | 1000 | 200 |

## By session
| Started (UTC) | Session | Model | Calls | USD | Summary |
|---|---|---|---:|---:|---|
| 2026-10-01T10:00 | \`11111111\` | gpt-test | 2 | $10.00 | Archived |
`;
const sid = '22222222-0000-0000-0000-000000000000';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'musubix-cost-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.sdd'));
  const report = path.join(root, '.sdd/cost-log.md');
  const history = path.join(root, '.sdd/cost-history.json');
  fs.writeFileSync(report, legacy);
  return { root, report, history };
}
function store(f, name, id = sid, events = [[12e9, 100, 10]], model = 'gpt-test') {
  const file = path.join(f.root, name + '.db');
  fs.rmSync(file, { force: true });
  const created = spawnSync('python3', ['-c', `
import json, sqlite3, sys
file, root, sid, events, model = sys.argv[1:]
with sqlite3.connect(file) as con:
 con.executescript("CREATE TABLE sessions(id TEXT, created_at TEXT, summary TEXT, cwd TEXT); CREATE TABLE assistant_usage_events(id INTEGER PRIMARY KEY, session_id TEXT, model TEXT, total_nano_aiu INTEGER, input_tokens INTEGER, output_tokens INTEGER);")
 con.execute("INSERT INTO sessions VALUES(?,?,?,?)", (sid, "2026-10-29T10:00", "Live | summary", root))
 con.executemany("INSERT INTO assistant_usage_events(session_id,model,total_nano_aiu,input_tokens,output_tokens) VALUES(?,?,?,?,?)", [(sid,model,*row) for row in json.loads(events)])
`, file, f.root, id, JSON.stringify(events), model], { encoding: 'utf8' });
  assert.ifError(created.error);
  assert.equal(created.status, 0, created.stderr);
  return file;
}
function run(f, db) {
  const result = spawnSync('python3', [script, f.root, '--store', db], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  return result;
}
function success(f, db, total) {
  const result = run(f, db);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = fs.readFileSync(f.report, 'utf8');
  assert.ok(report.includes(`**Total: $${total}**`), report);
  return report;
}
function concurrent(f, db) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [script, f.root, '--store', db]);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => {
      try { assert.equal(code, 0, output); resolve(); } catch (error) { reject(error); }
    });
  });
}
function instrument(f, db, mode) {
  const result = spawnSync('python3', ['-c', `
import fcntl, importlib.util, pathlib, sys
script, root, db, mode = sys.argv[1:]
spec = importlib.util.spec_from_file_location("cost_log", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
called = False
if mode == "lock":
 original = module.load_history
 def load_locked(*args):
  global called
  called = True
  assert (pathlib.Path(root) / ".sdd/.cost-log.lock").exists()
  with (pathlib.Path(root) / ".sdd/.cost-log.lock").open("a") as probe:
   try:
    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
   except BlockingIOError:
    pass
   else:
    raise AssertionError("checkpoint must be read while writer lock is held")
  return original(*args)
 module.load_history = load_locked
else:
 original = module.atomic_write
 def fail_report(path, text):
  if path.name == ("cost-history.json" if mode == "checkpoint" else "cost-log.md"):
   raise OSError("injected " + mode + " write failure")
  return original(path, text)
 module.atomic_write = fail_report
sys.argv = [script, root, "--store", db]
module.main()
if mode == "lock":
 assert called, "lock probe must execute"
`, script, f.root, db, mode], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  return result;
}

/** @id TEST-COST-HISTORY-001 @verifies REQ-COST-HISTORY-001 */
test('TEST-COST-HISTORY-001 preserves legacy totals and exact live snapshots across retention and writers', async t => {
  const f = fixture(t);
  let db = store(f, 'live');
  let report = success(f, db, '10.12');
  assert.ok(report.includes('| gpt-test | 3 | $10.12 | 1100 | 210 |'), report);
  assert.ok(report.includes('| 2026-10-01T10:00 | `11111111` | gpt-test | 2 | $10.00 | Archived |'));
  const checkpoint = fs.readFileSync(f.history, 'utf8');
  success(f, db, '10.12');
  assert.equal(fs.readFileSync(f.history, 'utf8'), checkpoint, 'reruns must not double count');
  const locked = instrument(f, db, 'lock');
  assert.equal(locked.status, 0, locked.stderr);
  db = store(f, 'live', sid, [[12e9, 100, 10], [8e9, 50, 5]]);
  success(f, db, '10.20');
  db = store(f, 'empty', sid, []);
  success(f, db, '10.20');
  const alternate = store(f, 'alternate', sid, [[0, 0, 0]], 'new-model');
  assert.ok(success(f, alternate, '10.20').includes('| new-model | 1 | $0.00 | 0 | 0 |'));
  const a = store(f, 'a', '33333333-0000-0000-0000-000000000000', [[3e9, 30, 3]]);
  const b = store(f, 'b', '44444444-0000-0000-0000-000000000000', [[4e9, 40, 4]]);
  await Promise.all([concurrent(f, a), concurrent(f, b)]);
  report = success(f, db, '10.27');
  assert.ok(report.includes('- Sessions: 4'), report);
  assert.ok(report.includes('| gpt-test | 6 | $10.27 | 1220 | 222 |'), report);
  assert.ok(report.includes('Live / summary'), 'summary must remain Markdown-safe');
  fs.writeFileSync(f.report, legacy);
  success(f, db, '10.27');
  fs.rmSync(f.report);
  success(f, db, '10.27');
  const rounded = fixture(t);
  fs.writeFileSync(rounded.report, legacy.replace('**Total: $10.00**', '**Total: $9.99**'));
  const roundDb = store(rounded, 'round', sid, [[500e6, 0, 0]]);
  assert.ok(success(rounded, roundDb, '10.00').includes('| gpt-test | 3 | $10.00 | 1000 | 200 |'));
  store(rounded, 'round', sid, [[500e6, 0, 0], [500e6, 0, 0]]);
  assert.ok(success(rounded, roundDb, '10.00').includes('| gpt-test | 4 | $10.01 | 1000 | 200 |'));
  const baseline = JSON.parse(fs.readFileSync(rounded.history, 'utf8')).legacy;
  assert.equal(baseline.totalUsd, '9.99');
  assert.equal(baseline.models['gpt-test'].usd, '10.00');
  const fresh = fixture(t);
  fs.rmSync(fresh.report);
  success(fresh, store(fresh, 'fresh'), '0.12');
  const interrupted = fixture(t);
  const interruptedDb = store(interrupted, 'interrupted');
  const failed = instrument(interrupted, interruptedDb, 'report');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /injected report write failure/);
  assert.equal(fs.readFileSync(interrupted.report, 'utf8'), legacy);
  assert.ok(fs.existsSync(interrupted.history), 'checkpoint must survive a failed derived-report write');
  success(interrupted, interruptedDb, '10.12');
  const unavailable = fixture(t);
  const unavailableDb = store(unavailable, 'unavailable');
  const noCheckpoint = instrument(unavailable, unavailableDb, 'checkpoint');
  assert.notEqual(noCheckpoint.status, 0);
  assert.match(noCheckpoint.stderr, /injected checkpoint write failure/);
  assert.equal(fs.readFileSync(unavailable.report, 'utf8'), legacy);
  assert.equal(fs.existsSync(unavailable.history), false);
});

/** @id TEST-COST-HISTORY-002 @verifies REQ-COST-HISTORY-002 */
test('TEST-COST-HISTORY-002 refuses malformed, overlapping and decreasing evidence without overwrites', t => {
  const invalid = ['legacy', 'json', 'duplicate', 'schema', 'negative', 'money', 'orphan', 'overlap', 'calls', 'nanoAiu', 'inputTokens', 'outputTokens', 'missing'];
  for (const kind of invalid) {
    const f = fixture(t);
    let db = store(f, 'live', sid, [[6e9, 50, 5], [6e9, 50, 5]]);
    if (kind === 'legacy') {
      fs.writeFileSync(f.report, legacy.replace('## By model', '## Missing table'));
    } else if (kind === 'overlap') {
      db = store(f, 'live', '11111111-0000-0000-0000-000000000000');
    } else {
      success(f, db, '10.12');
      if (kind === 'json') fs.writeFileSync(f.history, '{invalid');
      else if (kind === 'duplicate') {
        const before = fs.readFileSync(f.history, 'utf8');
        const duplicated = before.replace(/"schemaVersion"\s*:\s*1/, '"schemaVersion": 1, "schemaVersion": 1');
        assert.notEqual(duplicated, before, 'duplicate-key fixture must actually alter JSON');
        fs.writeFileSync(f.history, duplicated);
      } else if (kind === 'orphan') fs.rmSync(f.history);
      else if (kind === 'missing') fs.rmSync(db);
      else if (kind === 'negative' || kind === 'money') {
        const history = JSON.parse(fs.readFileSync(f.history, 'utf8'));
        if (kind === 'negative') history.sessions[sid].models['gpt-test'].nanoAiu = -1;
        else history.legacy.totalUsd = 10;
        fs.writeFileSync(f.history, JSON.stringify(history));
      }
      else if (kind === 'schema') {
        const history = JSON.parse(fs.readFileSync(f.history, 'utf8'));
        history.schemaVersion = 999;
        fs.writeFileSync(f.history, JSON.stringify(history));
      } else {
        const events = {
          calls: [[12e9, 100, 10]],
          nanoAiu: [[5e9, 50, 5], [5e9, 50, 5]],
          inputTokens: [[6e9, 40, 5], [6e9, 40, 5]],
          outputTokens: [[6e9, 50, 4], [6e9, 50, 4]],
        }[kind];
        db = store(f, 'live', sid, events);
      }
    }
    const before = [f.report, f.history].map(file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
    const result = run(f, db);
    assert.notEqual(result.status, 0, `${kind}: ${result.stdout}${result.stderr}`);
    assert.ok(result.stderr.trim(), `${kind}: errors must be explicit`);
    assert.deepEqual([f.report, f.history].map(file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
      before, `${kind}: failed validation must preserve both files`);
  }
  for (const column of [0, 1, 2]) {
    for (const bad of [null, -1, 0.5]) {
      const f = fixture(t);
      const event = [12e9, 100, 10];
      success(f, store(f, 'valid'), '10.12');
      event[column] = bad;
      const before = [f.report, f.history].map(file => fs.readFileSync(file, 'utf8'));
      const db = store(f, 'invalid', sid, [[12e9, 100, 10], event]);
      const result = run(f, db);
      assert.notEqual(result.status, 0, `invalid column ${column}: ${bad}`);
      assert.ok(result.stderr.trim());
      assert.deepEqual([f.report, f.history].map(file => fs.readFileSync(file, 'utf8')), before);
    }
  }
});
