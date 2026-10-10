import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SDD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sdd.mjs');

function project() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T2\n---\n## Design\nadd is a pure function.\nno state.\n\n| REQ-CALC-001 | When add is called, the system shall sum. | TEST-CALC-001 |\n');
  fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add } from './add.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => assert.equal(add(1, 2), 3));",
    '',
  ].join('\n'));
  return d;
}
const { NODE_TEST_CONTEXT, ...ENV } = process.env;
const sdd = (d, ...a) => { const r = spawnSync('node', [SDD, '--root', d, ...a], { encoding: 'utf8', env: ENV }); return { code: r.status, out: r.stdout + r.stderr }; };
const impl = (d, body) => fs.writeFileSync(path.join(d, 'add.mjs'), `/** @id CODE-CALC-001 @implements REQ-CALC-001 */\nexport const add = ${body};\n`);

test('T2 flow: refuses Red before approval, then Red -> Green -> gate', () => {
  const d = project();
  sdd(d, 'init');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 1, 'unapproved T2 must refuse');
  assert.match(sdd(d, 'approve', 'prepare', 'calc').out, /calc\.md\s+sha256:[0-9a-f]{64}/);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'tester').code, 0);

  impl(d, '(a, b) => a - b');
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1, 'Green must fail while test still fails');

  impl(d, '(a, b) => a + b');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  const g = sdd(d, 'gate', '--no-run');
  assert.match(g.out, /INCOMPLETE/, 'skipped commands never count as PASS');
  assert.match(g.out, /1\/1 tests Red→Green/);
  assert.equal(sdd(d, 'tdd', 'check').code, 0);
});

test('Red rejects a test that already passes and a missing module', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  impl(d, '(a, b) => a + b');
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /REJECTED.*passed/);
  fs.rmSync(path.join(d, 'add.mjs'));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /REJECTED.*load\/compile/);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak').code, 0);
});

test('editing the test after Red blocks Green; editing the spec stales approval', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  impl(d, '(a, b) => a - b');
  sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  const tf = path.join(d, 'add.test.mjs');
  fs.writeFileSync(tf, fs.readFileSync(tf, 'utf8') + '// tweak\n');
  impl(d, '(a, b) => a + b');
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
  fs.appendFileSync(path.join(d, '.sdd/specs/calc.md'), '\nnote\n');
  assert.match(sdd(d, 'guard').out, /approval stale/);
});

test('tampering with the ledger is detected; trace flags orphans', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  impl(d, '(a, b) => a - b');
  sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  const lp = path.join(d, '.sdd/tdd.jsonl');
  fs.writeFileSync(lp, fs.readFileSync(lp, 'utf8').replace('"exit":1', '"exit":0'));
  assert.equal(sdd(d, 'tdd', 'check').code, 1);
  fs.appendFileSync(path.join(d, 'add.mjs'), '/** @id CODE-CALC-002 @implements REQ-CALC-999 */\n');
  assert.match(sdd(d, 'trace').out, /unknown REQ-CALC-999/);
});

test('auto specs lock without a human; approval: human specs refuse ai approvers', () => {
  const d = project();
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:rubber-duck', '--review', 'no findings').code, 0);
  assert.equal(sdd(d, 'guard').code, 0);
  const sp = path.join(d, '.sdd/specs/calc.md');
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('tier: T2', 'tier: T2\napproval: human'));
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:rubber-duck').out, /requires a human/);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho').code, 0);
});

test('#1 fixture strings are ignored and scan.exclude works', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'fx.mjs'), 'export const s = "/** @id TEST-CALC-001 @verifies REQ-CALC-001 */";\n');
  fs.mkdirSync(path.join(d, 'fixtures'));
  fs.writeFileSync(path.join(d, 'fixtures/a.mjs'), '/** @id CODE-X-001 @implements REQ-CALC-001 */\n');
  fs.writeFileSync(path.join(d, 'fixtures/b.mjs'), '/** @id CODE-X-001 @implements REQ-CALC-001 */\n');
  assert.match(sdd(d, 'trace').out, /duplicate @id CODE-X-001/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ scan: { exclude: ['fixtures/**'] }, checks: [] }));
  assert.doesNotMatch(sdd(d, 'trace').out, /duplicate/);
});

test('#2 trace --baseline hides legacy errors but reports new ones', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'old.mjs'), '/** @id CODE-OLD-001 @implements REQ-NOPE-1 */\n');
  assert.equal(sdd(d, 'trace').code, 1);
  sdd(d, 'trace', '--baseline');
  assert.equal(sdd(d, 'trace').code, 0, 'legacy errors are baselined');
  fs.writeFileSync(path.join(d, 'new.mjs'), '/** @id CODE-NEW-001 @implements REQ-BAD-9 */\n');
  assert.match(sdd(d, 'trace', '--changed').out, /REQ-BAD-9/);
});

test('#4 ai approval needs review evidence', () => {
  const d = project();
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:self', '--review', 'x').code, 1);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck').code, 1);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', 'ok').code, 0);
});

test('#5 --missing-module accepts a declared missing import as non-weak Red', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--missing-module');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /weak/);
});

test('#3 --changed uses changedCmd with placeholders and reports TIMEOUT', () => {
  const d = project();
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [
    { name: 'slow', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', 'setTimeout(()=>{},5000)', '{changedFiles}'], changedTimeoutMs: 300 },
    { name: 'ok', cmd: ['node', '-e', 'process.exit(1)'], changedCmd: ['node', '-e', 'process.exit(0)', '{changedTests}', '{changedScopes}'] },
  ] }));
  const g = sdd(d, 'gate', '--changed');
  assert.match(g.out, /cmd slow TIMEOUT/);
  assert.match(g.out, /✓ cmd ok/);
});

test('#4 review file: Open findings and missing spec hash are refused', () => {
  const d = project();
  const rv = path.join(d, '.sdd/review.md');
  const hash = sdd(d, 'approve', 'prepare', 'calc').out.match(/sha256:([0-9a-f]{64})/)[1];
  fs.writeFileSync(rv, `spec ${hash}\nverdict: pass\nopen: 1\nF1|high|add.mjs:1|Open\n`);
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /1 Open/);
  fs.writeFileSync(rv, `spec ${hash}\nF1|high|add.mjs:1|Closed\n`);
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /missing `verdict/);
  fs.writeFileSync(rv, 'verdict: pass\nopen: 0\nF1|high|add.mjs:1|Closed\n');
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /spec hash/);
  fs.writeFileSync(rv, `spec ${hash}\nverdict: pass\nopen: 0\nF1|high|add.mjs:1|Closed\n`);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /\[ai, review file\]/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ requireReviewFile: true, checks: [] }));
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', 'looks fine').code, 1);
});

test('#5 tdd stub creates a throwing stub so Red is real (not weak)', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  assert.match(sdd(d, 'tdd', 'stub', 'TEST-CALC-001').out, /add\.mjs/);
  assert.match(fs.readFileSync(path.join(d, 'add.mjs'), 'utf8'), /export function add/);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /weak/);
  assert.match(sdd(d, 'tdd', 'stub', 'TEST-CALC-001').out, /no missing/);
});

test('#4 Open detection covers table, checkbox and state: formats', () => {
  const d = project();
  const hash = sdd(d, 'approve', 'prepare', 'calc').out.match(/sha256:([0-9a-f]{64})/)[1];
  for (const line of ['| F1 | high | a.mjs:1 | Open |', '- [ ] F1 fix it', 'F1 state: Open', 'F1|high|a.mjs:1|OPEN', '**Open** F1 fix', '- Open: F1 fix']) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec ${hash}\nverdict: pass\nopen: 1\n${line}\n`);
    assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /1 Open/, line);
  }
  fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec ${hash}\nverdict: pass\nopen: 0\n| F1 | high | a.mjs:1 | Closed |\n- [x] F2 done\nopen source note\n`);
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').code, 0);
});

test('#1 @id inside multi-line template literals is ignored', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'fx.test.mjs'), 'const a = `x\n/** @id TEST-EX-001\n * @verifies REQ-CALC-001 */`;\n');
  fs.writeFileSync(path.join(d, 'fy.test.mjs'), 'const b = `x\n/** @id TEST-EX-001\n * @verifies REQ-CALC-001 */`;\n');
  assert.doesNotMatch(sdd(d, 'trace').out, /TEST-EX-001/);
});

test('#8 baseline counts multiplicity: an added same-kind error is new', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'o1.mjs'), '/** @id CODE-O-001 @implements REQ-NOPE-1 */\n');
  sdd(d, 'trace', '--baseline');
  assert.equal(sdd(d, 'trace').code, 0);
  fs.writeFileSync(path.join(d, 'o2.mjs'), '/** @id CODE-O-001 @implements REQ-NOPE-1 */\n');
  assert.equal(sdd(d, 'trace').code, 1);
});

test('#7 hub change uses hubFallbackCmd; leaf change uses changedCmd', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 1;\n');
  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(d, `t${i}.test.mjs`), "import { h } from './hub.mjs';\nexport { h };\n");
  fs.writeFileSync(path.join(d, 'leaf.mjs'), 'export const l = 1;\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [
    { name: 'k', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', 'console.log("RELATED")'], hubFallbackCmd: ['node', '-e', 'console.log("NARROW")'], hubThreshold: 0.5, minHubTests: 1 },
  ] }));
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-qm', 'x'], { cwd: d });
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 2;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /hub change/);
  spawnSync('git', ['checkout', 'hub.mjs'], { cwd: d });
  fs.appendFileSync(path.join(d, 'leaf.mjs'), '// c\n');
  assert.doesNotMatch(sdd(d, 'gate', '--changed').out, /hub change/);
});

test('#7 oversized hub is skipped as INCOMPLETE, not timed out', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 1;\n');
  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(d, `t${i}.test.mjs`), "import { h } from './hub.mjs';\nexport { h };\n");
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [
    { name: 'k', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'], hubFallbackCmd: ['node', '-e', '0'], hubThreshold: 0.5, minHubTests: 1, hubMaxTests: 2 },
  ] }));
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-qm', 'x'], { cwd: d });
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 2;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /hub too large[\s\S]*INCOMPLETE|INCOMPLETE[\s\S]*hub too large/);
});

test('#11 hub detection follows workspace package names and tsconfig paths', () => {
  const d = project();
  fs.mkdirSync(path.join(d, 'packages/lib/src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'packages/lib/package.json'), JSON.stringify({ name: '@x/lib', main: 'dist/index.js' }));
  fs.writeFileSync(path.join(d, 'packages/lib/src/index.ts'), 'export const h = 1;\n');
  fs.mkdirSync(path.join(d, 'app'));
  fs.writeFileSync(path.join(d, 'tsconfig.json'), '{ // c\n "compilerOptions": { "baseUrl": ".", "paths": { "@app/*": ["app/*"] } } }');
  fs.writeFileSync(path.join(d, 'app/util.ts'), 'export const u = 1;\n');
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(d, `t${i}.test.ts`), "import { h } from '@x/lib';\nimport { u } from '@app/util';\n");
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [
    { name: 'k', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'], hubFallbackCmd: ['node', '-e', 'console.log("NARROW")'], hubThreshold: 0.5, minHubTests: 1 },
  ] }));
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-qm', 'x'], { cwd: d });
  fs.writeFileSync(path.join(d, 'packages/lib/src/index.ts'), 'export const h = 2;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /hub change \(3\/4/);
  spawnSync('git', ['checkout', '.'], { cwd: d });
  fs.writeFileSync(path.join(d, 'app/util.ts'), 'export const u = 2;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /hub change \(3\/4/);
});

test('#12 hub change is scoped by changed symbols; comment-only is skipped', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 1;\nexport const k = 1;\n');
  fs.writeFileSync(path.join(d, 'a.test.mjs'), "import { h } from './hub.mjs';\n");
  fs.writeFileSync(path.join(d, 'b.test.mjs'), "import { k } from './hub.mjs';\n");
  fs.writeFileSync(path.join(d, 'c.test.mjs'), "import { k } from './hub.mjs';\n");
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [
    { name: 'k', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'], hubFallbackCmd: ['node', '-e', '0', '{directTests}'], hubThreshold: 0.1, minHubTests: 1 },
  ] }));
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-qm', 'x'], { cwd: d });
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 2;\nexport const k = 1;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /scoped by changed symbols \(h\) → 1 test files/);
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'export const h = 1;\nexport const k = 1;\n// note\n');
  assert.match(sdd(d, 'gate', '--changed').out, /symbol-neutral/);
  fs.writeFileSync(path.join(d, 'hub.mjs'), 'const z = 1;\nexport const h = 1;\nexport const k = 1;\n');
  assert.match(sdd(d, 'gate', '--changed').out, /hub change \(3\/4/);
  assert.doesNotMatch(sdd(d, 'gate', '--changed').out, /scoped by/);
});

test('#13 prepare runs once, is cached until inputs change, and failure fails the gate', () => {
  const d = project();
  const marker = path.join(d, 'built.txt');
  const cfg = (cmd) => fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ prepare: { cmd, outputs: ['built.txt'] }, checks: [{ name: 'ok', cmd: ['node', '-e', '0'] }] }));
  cfg(['node', '-e', "require('fs').appendFileSync('built.txt','x')"]);
  assert.match(sdd(d, 'gate').out, /✓ prepare \(/);
  assert.match(sdd(d, 'gate').out, /prepare: up to date/);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'x');
  fs.appendFileSync(path.join(d, 'add.test.mjs'), '// edit\n');
  assert.match(sdd(d, 'gate').out, /✓ prepare \(/);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'xx');
  fs.rmSync(marker);
  assert.match(sdd(d, 'gate').out, /✓ prepare \(/);
  cfg(['node', '-e', 'process.exit(3)']);
  const g = sdd(d, 'gate');
  assert.match(g.out, /✗ prepare failed/);
});

test('#9 tokenizer: backticks in strings/comments/nested templates do not desync', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'real.mjs'), [
    "const a = 'it`s'; // `",
    '/* ` */',
    'const b = `x ${ `y ${1}` } z`;',
    '/** @id CODE-REAL-001 @implements REQ-CALC-001 */',
    'export const r = 1;',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(d, 'fx.mjs'), 'const t = `\n${1}\n/** @id CODE-FX-001 @implements REQ-CALC-001 */\n`;\n');
  const g = sdd(d, 'status').out;
  assert.match(g, /entities 2/);
});

test('#10 gate without specs is INCOMPLETE with a hint, not FAIL', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  const g = sdd(d, 'gate', '--no-run');
  assert.match(g.out, /INCOMPLETE/);
  assert.equal(g.code, 2);
  assert.match(g.out, /T0 changes need no gate/);
});

test('python projects: init uses python3 -m pytest (cwd on sys.path) and a default test check', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.writeFileSync(path.join(d, 'requirements.txt'), '');
  sdd(d, 'init');
  const c = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  assert.deepEqual(c.testCmd.slice(0, 3), ['python3', '-m', 'pytest']);
  assert.equal(c.checks[0].name, 'test');
});

test('#14 stub Red from a setup call is weak; --expect / --allow-setup-red override', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add, reset } from './add.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => {",
    '  reset();',
    '  assert.equal(add(1, 2), 3);',
    '});',
    '',
  ].join('\n'));
  const stub = (a, r) => fs.writeFileSync(path.join(d, 'add.mjs'), `export const add = ${a};\nexport const reset = ${r};\n`);
  stub('() => 3', "() => { throw new Error('not implemented: reset'); }");
  const w = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(w.code, 0, w.out);
  assert.match(w.out, /\[weak\].*setup call "reset"/);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', 'not implemented: add').out, /REJECTED.*--expect/);
  assert.doesNotMatch(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--allow-setup-red').out, /\[weak\]/);
  stub("() => { throw new Error('not implemented: add'); }", '() => {}');
  assert.doesNotMatch(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);
});

test('#15 go/rust: init picks defaults and {IDU}/{idu} map IDs to test-name patterns', () => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: g });
  fs.writeFileSync(path.join(g, 'go.mod'), 'module x\n');
  sdd(g, 'init');
  const gc = JSON.parse(fs.readFileSync(path.join(g, '.sdd/config.json'), 'utf8'));
  assert.deepEqual(gc.testCmd, ['go', 'test', './...', '-run', '{IDU}(_|$)']);
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: r });
  fs.writeFileSync(path.join(r, 'Cargo.toml'), '[package]\nname="x"\n');
  sdd(r, 'init');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r, '.sdd/config.json'), 'utf8')).testCmd, ['cargo', 'test', '{idu}']);
  fs.mkdirSync(path.join(r, 'src'));
  fs.writeFileSync(path.join(r, 'src/lib.rs'), '// @id CODE-X-001 @implements REQ-CALC-001\npub fn f() {}\n');
  assert.match(sdd(r, 'status').out, /entities 1/);
});

test('#15 impl and test in one file (Rust-style): Green is allowed after implementing; editing the test still blocks', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const w = (body, assertion) => fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    '/** @id CODE-CALC-001 @implements REQ-CALC-001 */',
    `const add = (a, b) => ${body};`,
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    `test('TEST-CALC-001 adds', () => assert.equal(${assertion}, 3));`,
    '',
  ].join('\n'));
  w('a - b', 'add(1, 2)');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  w('a + b', 'add(1, 2)');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  w('a + b', 'add(1, 2) + 0');
  assert.match(sdd(d, 'gate', '--no-run').out, /test changed since last Green/);
});

test('#15 go build failure is a load error, not a Red', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const bin = path.join(d, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'go'), '#!/bin/sh\necho "# calc [calc.test]"\necho "./calc_test.go:7:5: undefined: Plus"\necho "FAIL\tcalc [build failed]"\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: [path.join(bin, 'go'), 'test', '-run', '{IDU}'] }));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /REJECTED.*load\/compile/);
});

test('#16 regex literals and JSX text do not desync the tokenizer; unterminated state fails open', () => {
  const d = project();
  fs.writeFileSync(path.join(d, 'rx.mjs'), [
    "const a = /['`]/.test(x);",
    "const b = s.replace(/[`/]/g, '') / 2;",
    "const c = x / 2 / 3; // `",
    'const j = <p>don\'t `quote</p>;',
    '/** @id CODE-RX-001 @implements REQ-CALC-001 */',
    'export const r = 1;',
    '',
  ].join('\n'));
  assert.match(sdd(d, 'status').out, /entities 2/);
  fs.writeFileSync(path.join(d, 'bad.mjs'), 'const t = `unterminated\n/** @id CODE-BAD-001 @implements REQ-CALC-001 */\n');
  assert.match(sdd(d, 'status').out, /entities 3/);
});

test('#17 review template/check: schema is validated, counts must match', () => {
  const d = project();
  const t = sdd(d, 'review', 'template', 'calc').out.replace('verdict: pending', 'verdict: pass');
  fs.writeFileSync(path.join(d, '.sdd/review.md'), t);
  assert.match(sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc').out, /REVIEW OK/);
  fs.writeFileSync(path.join(d, '.sdd/review.md'), t.replace('verdict: pass', 'verdict: fail'));
  assert.equal(sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc').code, 1);
  fs.writeFileSync(path.join(d, '.sdd/review.md'), t + '\n| F1 | high | a.ts:1 | Open |\n');
  assert.match(sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc').out, /does not match 1/);
});

test('#36 an unedited review template is rejected (verdict pending, no sample finding)', () => {
  const d = project();
  const t = sdd(d, 'review', 'template', 'calc').out;
  assert.match(t, /verdict: pending/);
  assert.doesNotMatch(t, /\bF1\b/);
  fs.writeFileSync(path.join(d, '.sdd/review.md'), t);
  const r = sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc');
  assert.equal(r.code, 1);
  assert.match(r.out, /verdict is "pending"/);
});

test('C/C++ sources are scanned; unknown stack warns at init; "FAIL <name>" is shown as the Red reason', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T2\n---\n## Design\nadd is a pure function.\nno state.\n\n| REQ-CALC-001 | When add is called, the system shall sum. | TEST-CALC-001 |\n');
  fs.writeFileSync(path.join(d, 'calc.c'), '/* @id CODE-CALC-001 @implements REQ-CALC-001 */\nint add(int a, int b) { return a - b; }\n');
  fs.writeFileSync(path.join(d, 't.cpp'), '// @id TEST-CALC-001 @verifies REQ-CALC-001\nint main() { return 1; }\n');
  assert.match(sdd(d, 'init').out, /WARNING: stack not recognised/);
  assert.match(sdd(d, 'status').out, /entities 2/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'echo "FAIL test_calc_001"; exit 1', 'x', '{idu}'] }));
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /fails with: FAIL test_calc_001/);
});

test('gcc/clang/javac compile diagnostics are load errors, not Red', () => {
  for (const diag of ['test.c:7:5: error: implicit declaration of function plus', 'Foo.java:3: error: cannot find symbol', '/usr/bin/ld: x.o: undefined reference to `f`\ncollect2: error: ld returned 1 exit status']) {
    const d = project();
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', `printf '%s\\n' "$0"; exit 1`, diag] }));
    assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /REJECTED.*load\/compile/, diag);
  }
});

test('#24 init detects Maven / Gradle / CMake and zero-match is reported before "passed"', () => {
  const cases = [
    [{ 'pom.xml': '<project/>' }, 'mvn', /-Dtest=\*#\*\{idu\}\*/],
    [{ 'build.gradle': '' }, 'sh', / gradle -I .*--tests "\*\$0\*"/],
    [{ 'build.gradle.kts': '', gradlew: '' }, 'sh', / \.\/gradlew -I .*--tests "\*\$0\*"/],
    [{ 'CMakeLists.txt': '' }, 'sh', /ctest .* -R "\$0"/],
  ];
  for (const [files, head, re] of cases) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c);
    const out = sdd(d, 'init').out;
    assert.doesNotMatch(out, /not recognised/);
    const c = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
    assert.equal(c.testCmd[0], head);
    assert.match(c.testCmd.join(' '), re);
    assert.equal(c.checks[0].name, 'test');
  }
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'echo "Tests run: 0, Failures: 0"; exit 0'] }));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /no test matched/);
});

test('#30 polyglot monorepo: nested manifests become projects run in their own cwd', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, 'services/py'), { recursive: true });
  fs.mkdirSync(path.join(d, 'services/go'), { recursive: true });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'services/py/pyproject.toml'), '');
  fs.writeFileSync(path.join(d, 'services/go/go.mod'), 'module x\n');
  fs.writeFileSync(path.join(d, '.sdd/specs/g.md'), '---\nfeature: g\ntier: T1\n---\n| REQ-GO-001 | When x, the system shall y. | TEST-GO-001 |\n');
  fs.writeFileSync(path.join(d, 'services/go/x_test.go'), '// @id TEST-GO-001 @verifies REQ-GO-001\nfunc TestX() {}\n');
  assert.match(sdd(d, 'init').out, /projects: services\/go.*services\/py/);
  const c = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  assert.deepEqual(c.projects.map((p) => p.root), ['services/go', 'services/py']);
  assert.deepEqual(c.projects[0].testCmd.slice(0, 2), ['go', 'test']);
  c.projects[0].testCmd = ['sh', '-c', 'echo "cwd=$(pwd) file=$0"; echo "FAIL x"; exit 1', '{file}'];
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify(c));
  const r = sdd(d, 'tdd', 'red', 'TEST-GO-001');
  assert.equal(r.code, 0, r.out);
  const ledger = fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8');
  assert.match(ledger, /services\/go\/x_test\.go/);
  c.projects[0].checks = [{ name: 'test', cmd: ['sh', '-c', 'exit 0'] }];
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify(c));
  assert.match(sdd(d, 'gate').out, /cmd services\/go:test/);
});

test('#25 init detects PHP / R / Julia and tdd stub writes throwing php + julia stubs', () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  assert.match(sdd(mk({ 'composer.json': '{}' }), 'init').out, /testCmd: phpunit .*--filter \{idu\}/);
  assert.match(sdd(mk({ DESCRIPTION: 'Package: x\n' }), 'init').out, /testCmd: Rscript .*testthat/);
  assert.match(sdd(mk({ 'Project.toml': 'name = "X"\n' }), 'init').out, /testCmd: julia --project=\. \{file\}/);
  const spec = '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | When add, the system shall sum. | TEST-C-001 |\n';
  const php = mk({ 'composer.json': '{}', '.sdd/specs/c.md': spec, 'tests/CTest.php': "<?php\nrequire_once __DIR__ . '/../src/C.php';\n// @id TEST-C-001 @verifies REQ-C-001\nfinal class CTest { function test_c_001() { assert(c_add(1, 2) === 3); } }\n" });
  assert.match(sdd(php, 'tdd', 'stub', 'TEST-C-001').out, /src\/C\.php/);
  assert.match(fs.readFileSync(path.join(php, 'src/C.php'), 'utf8'), /function c_add\(.*\n.*LogicException\('not implemented: c_add'\)/);
  const jl = mk({ 'Project.toml': 'name = "X"\n', '.sdd/specs/c.md': spec, 'test/runtests.jl': 'include("../src/C.jl")\n# @id TEST-C-001 @verifies REQ-C-001\n@test c_add(1, 2) == 3\n' });
  assert.match(sdd(jl, 'tdd', 'stub', 'TEST-C-001').out, /src\/C\.jl/);
  assert.match(fs.readFileSync(path.join(jl, 'src/C.jl'), 'utf8'), /c_add\(args\.\.\.; kwargs\.\.\.\) = error\("not implemented: c_add"\)/);
});

test('#25 tdd stub for Java / C / Go / Rust infers arity and return type from the test', { skip: ['cc', 'go', 'cargo'].some((c) => spawnSync('which', [c]).status !== 0) }, () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
  const java = mk({ 'test/CTest.java': 'public class CTest {\n  // @id TEST-C-001 @verifies REQ-C-001\n  static boolean t() { return C.add(1, 2) == 3; }\n}\n' });
  assert.match(sdd(java, 'tdd', 'stub', 'TEST-C-001').out, /src\/C\.java/);
  assert.match(read(java, 'src/C.java'), /public static int add\(Object a0, Object a1\)[\s\S]*not implemented: add/);
  const c = mk({ 'test_c.c': '#include "c.h"\n/* @id TEST-C-001 @verifies REQ-C-001 */\nint main(void) { return add(1, 2) == 3 ? 0 : 1; }\n' });
  assert.match(sdd(c, 'tdd', 'stub', 'TEST-C-001').out, /c\.h/);
  assert.match(read(c, 'c.h'), /static inline int add\(int a0, int a1\)[\s\S]*abort\(\)/);
  const go = mk({ 'go.mod': 'module c\n\ngo 1.21\n', 'c_test.go': 'package c\nimport "testing"\n// @id TEST-C-001 @verifies REQ-C-001\nfunc TestTEST_C_001(t *testing.T) { if Add(1, 2) != 3 { t.Fatal("x") } }\n' });
  assert.match(sdd(go, 'tdd', 'stub', 'TEST-C-001').out, /c\.go/);
  assert.match(read(go, 'c.go'), /func Add\(a0, a1 any\) int \{\n\tpanic\("not implemented: Add"\)/);
  const rs = mk({ 'Cargo.toml': '[package]\nname = "c"\nversion = "0.1.0"\nedition = "2021"\n', 'tests/c.rs': 'use c::*;\n// @id TEST-C-001 @verifies REQ-C-001\n#[test]\nfn test_c_001() { assert_eq!(add(1, 2), 3); }\n' });
  assert.match(sdd(rs, 'tdd', 'stub', 'TEST-C-001').out, /src\/lib\.rs/);
  assert.match(read(rs, 'src/lib.rs'), /pub fn add<A0, A1>\(_a0: A0, _a1: A1\) -> i64/);
});

test('#31 mixed monorepo: root JS + nested go becomes a project, nested js stays with the root', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const [f, b] of Object.entries({ 'package.json': '{"scripts":{"test":"echo ok"}}', 'packages/a/package.json': '{}', 'services/go/go.mod': 'module x\n' })) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); }
  assert.match(sdd(d, 'init').out, /root \+ projects: services\/go/);
  const c = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  assert.deepEqual(c.projects.map((p) => p.root), ['services/go']);
  assert.ok(c.checks.some((k) => k.name === 'test'), 'root checks kept');
  assert.equal(c.testCmd[0], 'node');
});

test('#32 projects: dependsOn triggers dependents, project changedCmd gets project-relative paths', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const git = (...a) => spawnSync('git', a, { cwd: d });
  git('init', '-q');
  for (const f of ['libs/shared/x.txt', 'services/api/a.txt', 'services/web/w.txt', '.sdd/specs/g.md']) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), 'x'); }
  git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['true'], checks: [], projects: [
    { root: 'services/api', testCmd: ['true'], dependsOn: ['libs/shared'], checks: [{ name: 'test', cmd: ['sh', '-c', 'echo full'], changedCmd: ['sh', '-c', 'echo scoped "$@"', 'x', '{changedFiles}'] }] },
    { root: 'services/web', testCmd: ['true'], checks: [{ name: 'test', cmd: ['true'] }] },
  ] }));
  fs.writeFileSync(path.join(d, 'libs/shared/x.txt'), 'changed');
  let r = sdd(d, 'gate', '--changed').out;
  assert.match(r, /cmd services\/api:test/);
  assert.match(r, /services\/web:test: no changed files/);
  fs.writeFileSync(path.join(d, 'services/api/a.txt'), 'changed');
  r = sdd(d, 'gate', '--changed', '--json').out;
  assert.match(r, /cmd services\/api:test/);
});

test('#27 {idu} falls back to the test method declared below @id (camelCase JUnit)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/c.md'), '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | When x, the system shall y. | TEST-C-001 |\n');
  fs.writeFileSync(path.join(d, 'CTest.java'), 'class CTest {\n  // @id TEST-C-001 @verifies REQ-C-001\n  @Test\n  @DisplayName("adds")\n  void addsNumbers() {}\n}\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'echo "$0" > filter.txt; echo "FAIL x"; exit 1', '{idu}'] }));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-C-001').out, /RED ok/);
  assert.equal(fs.readFileSync(path.join(d, 'filter.txt'), 'utf8').trim(), 'addsNumbers');
});

test('#26 multi-module output: a zero-test module does not hide a failing one; build/POM errors are not Red', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/c.md'), '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | When x, the system shall y. | TEST-C-001 |\n');
  fs.writeFileSync(path.join(d, 'a_test.py'), '# @id TEST-C-001 @verifies REQ-C-001\ndef test_c_001(): pass\n');
  const red = (script) => { fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', script] })); return sdd(d, 'tdd', 'red', 'TEST-C-001').out; };
  assert.match(red('echo "Tests run: 0, Failures: 0"; echo "Tests run: 1, Failures: 1"; echo "FAIL x"; exit 1'), /RED ok/);
  assert.match(red('echo "Tests run: 0, Failures: 0"; echo "Tests run: 0, Failures: 0"; exit 1'), /no test matched/);
  assert.match(red('echo "Non-parseable POM /x/pom.xml: Duplicated tag"; exit 1'), /load\/compile error/);
  assert.match(red('printf "* What went wrong:\\nBUG! exception in phase semantic analysis\\n"; exit 1'), /load\/compile error/);
  assert.match(red('printf "* What went wrong:\\nExecution failed for task \':core:test\'.\\n> There were failing tests\\n"; echo "FAIL x"; exit 1'), /RED ok/);
});

test('#28 init detects Makefile and .NET projects; MSBuild/C# errors are load errors', () => {
  for (const [files, re] of [[{ Makefile: 'test:\n\ttrue\n' }, /testCmd: make test TEST=\{idu\}/], [{ 'App.csproj': '<Project/>' }, /testCmd: dotnet test --nologo --filter FullyQualifiedName~\{idu\}/]]) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c);
    const out = sdd(d, 'init').out;
    assert.doesNotMatch(out, /not recognised/);
    assert.match(out, re);
  }
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/c.md'), '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | When x, the system shall y. | TEST-C-001 |\n');
  fs.writeFileSync(path.join(d, 'CTest.cs'), '// @id TEST-C-001 @verifies REQ-C-001\npublic void Adds() {}\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'echo "CTest.cs(3,5): error CS0103: The name Calc does not exist"; exit 1'] }));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-C-001').out, /load\/compile error/);
});

test('#33 gate --changed scopes Go to changed packages plus dependents; go.mod falls back to full', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-go-'));
  const git = (...a) => spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: d });
  const w = (f, c) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
  git('init', '-q');
  w('go.mod', 'module m\n\ngo 1.21\n');
  w('a/a.go', 'package a\nfunc A() int { return 1 }\n');
  w('b/b.go', 'package b\nimport "m/a"\nfunc B() int { return a.A() }\n');
  w('c/c.go', 'package c\n');
  sdd(d, 'init');
  git('add', '-A'); git('commit', '-qm', 'base');
  w('a/a.go', 'package a\nfunc A() int { return 2 }\n');
  assert.match(sdd(d, 'gate', '--changed').out, /scoped → go test m\/a m\/b\b/);
  git('commit', '-qam', 'a');
  w('go.mod', 'module m\n\ngo 1.22\n');
  assert.match(sdd(d, 'gate', '--changed').out, /cannot scope changes for \{changedGoPkgs\} — running the full check/);
});

test('#34 tdd stub for a Python test inside a project dir writes the stub under that project, not the repo root', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pystub-'));
  const w = (f, c) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('package.json', '{"name":"r","scripts":{"test":"true"}}');
  w('worker/pyproject.toml', '[project]\nname="w"\nversion="0"\n');
  w('worker/tests/test_s.py', '# @id TEST-S-001\n# @verifies REQ-S-001\nfrom jobworker.stats import percentile\ndef test_s_001():\n    assert percentile([1], 50) == 1\n');
  w('.sdd/specs/s.md', '---\nfeature: s\ntier: T1\n---\n| ID | EARS | Test |\n| --- | --- | --- |\n| REQ-S-001 | When p, the system shall return. | TEST-S-001 |\n');
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  assert.ok(fs.existsSync(path.join(d, 'worker/jobworker/stats.py')));
  assert.ok(!fs.existsSync(path.join(d, 'jobworker')));
});

test('#37 a check whose runner reports "no tests ran" is INCOMPLETE, a real failure still FAILs', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  const cfg = (cmd) => fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [{ name: 'py', cmd }] }));
  cfg(['node', '-e', "console.log('no tests ran in 0.01s'); process.exit(5)"]);
  const r = sdd(d, 'gate');
  assert.match(r.out, /no tests exist yet/);
  assert.doesNotMatch(r.out, /✗ cmd/);
  cfg(['node', '-e', "console.log('1 failed, 3 passed'); process.exit(1)"]);
  assert.match(sdd(d, 'gate').out, /✗ cmd py/);
});

test('#41 tdd stub for Python does not shadow stdlib modules but still stubs project modules', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pystd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'));
  fs.writeFileSync(path.join(d, 'tests/test_s.py'), '# @id TEST-S-001\n# @verifies REQ-S-001\nfrom pathlib import Path\nfrom jobx.mod import f\ndef test_s_001():\n    assert f(Path(".")) == 1\n');
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  assert.ok(!fs.existsSync(path.join(d, 'pathlib.py')));
  assert.ok(fs.existsSync(path.join(d, 'jobx/mod.py')));
});

test('#42 tdd stub for JS/TS generates a class for symbols used with new / extends / toThrow(Class)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-clsstub-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"x","scripts":{"test":"true"}}');
  fs.writeFileSync(path.join(d, 's.test.ts'), [
    "import { Sched, Boom, plain } from './s';",
    '// @id TEST-S-001 @verifies REQ-S-001',
    "test('TEST-S-001 x', () => { const s = new Sched(); expect(() => plain()).toThrow(Boom); });",
    '',
  ].join('\n'));
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  const body = fs.readFileSync(path.join(d, 's.ts'), 'utf8');
  assert.match(body, /export class Sched\b/);
  assert.match(body, /export class Boom\b/);
  assert.match(body, /export function plain\b/);
});

test('#35 weak-Red classification follows the throwing call site: same symbol in setup and assert, and helper-wrapped calls', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const stub = "export const add = () => { throw new Error('not implemented: add'); };\n";
  fs.writeFileSync(path.join(d, 'add.mjs'), stub);
  const test = (body) => fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add } from './add.mjs';",
    'const call = (a, b) => add(a, b);',
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => {",
    ...body,
    '});',
    '',
  ].join('\n'));
  test(['  const seed = add(0, 0);', '  assert.equal(add(1, 2), 3 + seed);']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\].*setup call "add"/);
  test(['  const r = call(1, 2);', '  assert.equal(r, 3);']);
  assert.doesNotMatch(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);
});

test('#39/#40 gate --changed: root checks skip when only a nested project changed; shared paths are reachable through dependsOn', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-nest-'));
  const git = (...a) => spawnSync('git', a, { cwd: d });
  const w = (f, c) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
  git('init', '-q'); git('config', 'user.email', 'a@b'); git('config', 'user.name', 't');
  w('package.json', '{"name":"r","scripts":{"test":"true"}}');
  w('worker/pyproject.toml', '[project]\nname="w"\nversion="0"\n');
  w('worker/a.py', 'x = 1\n');
  w('contract/s.json', '[]\n');
  sdd(d, 'init');
  const cfgPath = path.join(d, '.sdd/config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.checks = [{ name: 'root', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'] }];
  cfg.projects = [{ root: 'worker', checks: [{ name: 't', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'] }] }];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  git('add', '-A'); git('commit', '-qm', 'base');
  w('worker/a.py', 'x = 2\n');
  const a = sdd(d, 'gate', '--changed').out;
  assert.match(a, /cmd root: all changed files are inside nested projects/);
  assert.match(a, /✓ cmd worker:t/);
  git('commit', '-qam', 'a');
  w('contract/s.json', '["x"]\n');
  const b = sdd(d, 'gate', '--changed').out;
  assert.match(b, /✓ cmd root/);
  assert.match(b, /worker:t: no changed files/);
  assert.match(b, /add the path to its `dependsOn`/);
  cfg.projects[0].dependsOn = ['contract'];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  const c = sdd(d, 'gate', '--changed').out;
  assert.match(c, /✓ cmd worker:t/);
  assert.doesNotMatch(c, /add the path to its `dependsOn`/);
});

test('#38 editing one test does not invalidate the Red/Green evidence of its siblings in the same file', () => {
  const d = project();
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T1\n---\n| REQ-CALC-001 | When add is called, the system shall sum. | TEST-CALC-001 |\n| REQ-CALC-002 | When add gets zero, the system shall return the other. | TEST-CALC-002 |\n');
  const tf = (second) => fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add } from './add.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => assert.equal(add(1, 2), 3));",
    '/** @id TEST-CALC-002 @verifies REQ-CALC-002 */',
    `test('TEST-CALC-002 zero', () => assert.equal(add(${second}), 5));`,
    '',
  ].join('\n'));
  sdd(d, 'init');
  tf('0, 5');
  fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
  for (const id of ['TEST-CALC-001', 'TEST-CALC-002']) assert.equal(sdd(d, 'tdd', 'red', id).code, 0);
  impl(d, '(a, b) => a + b');
  for (const id of ['TEST-CALC-001', 'TEST-CALC-002']) assert.equal(sdd(d, 'tdd', 'green', id).code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /2\/2 tests Red→Green/);
  tf('5, 0');
  const g = sdd(d, 'gate', '--no-run').out;
  assert.match(g, /1\/2 tests Red→Green/);
  assert.match(g, /TEST-CALC-002.*test changed/);
  assert.doesNotMatch(g, /TEST-CALC-001 \(/);
});

test('#43 a data-only test that passes without implementation needs --characterization to be recorded; it is counted as weak', () => {
  const d = project();
  sdd(d, 'init');
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  impl(d, '(a, b) => a + b');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1);
  assert.match(r.out, /--characterization/);
  const c = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'checks a data file only');
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, /\[weak\]/);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /1 weak Red \(1 characterization/);
});

test('#44 weak-Red: result assigned from the stub and asserted is the act (not setup); pytest fixture error is weak with a real reason; Python class stubs construct', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
  const test = (body) => fs.writeFileSync(path.join(d, 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add } from './add.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => {",
    ...body,
    '});',
    '',
  ].join('\n'));
  test(['  const r = add(1, 2);', '  assert.equal(r, 3);']);
  assert.doesNotMatch(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);
  test(['  const r = add(1, 2);', '  assert.equal(String(r), "3");']);
  assert.doesNotMatch(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);

  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pyfix-'));
  spawnSync('git', ['init', '-q'], { cwd: p });
  fs.mkdirSync(path.join(p, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(p, 'tests'));
  fs.writeFileSync(path.join(p, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | When f is called, the system shall return 1. | TEST-S-001 |\n');
  fs.writeFileSync(path.join(p, 'pyproject.toml'), '[project]\nname="x"\nversion="0"\n');
  fs.writeFileSync(path.join(p, 'tests/test_s.py'), [
    'import pytest',
    'from pkg.mod import Thing, f',
    '@pytest.fixture',
    'def thing():',
    '    return Thing()',
    '# @id TEST-S-001',
    '# @verifies REQ-S-001',
    'def test_s_001(thing):',
    '    assert f(thing) == 1',
    '',
  ].join('\n'));
  sdd(p, 'init');
  sdd(p, 'tdd', 'stub', 'TEST-S-001');
  assert.match(fs.readFileSync(path.join(p, 'pkg/mod.py'), 'utf8'), /class Thing:\n    def __init__\(self, \*a, \*\*k\):\n        pass/);
  const r = sdd(p, 'tdd', 'red', 'TEST-S-001');
  assert.doesNotMatch(r.out, /\[weak\]/, r.out);
  assert.match(r.out, /NotImplementedError: f/);
  fs.writeFileSync(path.join(p, 'pkg/mod.py'), 'class Thing:\n    def __init__(self):\n        raise NotImplementedError("Thing")\n\ndef f(t):\n    return 0\n');
  const w = sdd(p, 'tdd', 'red', 'TEST-S-001');
  assert.match(w.out, /\[weak\].*setup call "Thing"/, w.out);
  assert.doesNotMatch(w.out, /fails with: \[100%\]/);
});

test('#44b a stub call inside `with pytest.raises` is the asserted behaviour, not setup', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pyraises-'));
  spawnSync('git', ['init', '-q'], { cwd: p });
  fs.mkdirSync(path.join(p, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(p, 'tests'));
  fs.writeFileSync(path.join(p, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | If x is negative, then f shall raise ValueError. | TEST-S-001 |\n');
  fs.writeFileSync(path.join(p, 'pyproject.toml'), '[project]\nname="x"\nversion="0"\n');
  fs.writeFileSync(path.join(p, 'tests/test_s.py'), 'import pytest\nfrom pkg.mod import f\n# @id TEST-S-001\n# @verifies REQ-S-001\ndef test_s_001():\n    with pytest.raises(ValueError):\n        f(-1)\n');
  sdd(p, 'init');
  sdd(p, 'tdd', 'stub', 'TEST-S-001');
  const r = sdd(p, 'tdd', 'red', 'TEST-S-001');
  assert.match(r.out, /RED ok/, r.out);
  assert.doesNotMatch(r.out, /\[weak\]/, r.out);
});

test('#45 Python docstring annotations (one-line and multi-line triple-quoted) are scanned', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pydoc-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | When f is called, the system shall return 1. | TEST-S-001 |\n| REQ-S-002 | When g is called, the system shall return 2. | TEST-S-001 |\n');
  fs.writeFileSync(path.join(d, 'm.py'), '"""@id CODE-S-001 @implements REQ-S-001"""\n\ndef f():\n    return 1\n\n\ndef g():\n    """\n    @id CODE-S-002\n    @implements REQ-S-002\n    """\n    return 2\n');
  const r = sdd(d, 'trace');
  assert.match(r.out, /\b2 annotated entities/, r.out);
  assert.doesNotMatch(r.out, /REQ-S-00[12] has no @implements/, r.out);
});

test('#46 gate --changed: a scoped run that matched no tests falls back to the full check (no false PASS)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-zero-'));
  const git = (...a) => spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd: d });
  git('init', '-q');
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'data.json'), '[1]\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [{ name: 'test', cmd: ['node', '-e', 'console.log("1 failed"); process.exit(1)'], changedCmd: ['node', '-e', 'console.log("No test files found, exiting with code 0")', '{changedFiles}'] }] }));
  git('add', '-A'); git('commit', '-qm', 'base');
  fs.writeFileSync(path.join(d, 'data.json'), '[2]\n');
  const r = sdd(d, 'gate', '--changed').out;
  assert.match(r, /scoped run matched no tests — running the full check instead/);
  assert.match(r, /✗ cmd test/);
});

test('#47 a REQ marked "test-only" is not warned about missing @implements', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-testonly-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | Golden file matches. (test-only) | TEST-S-001 |\n| REQ-S-002 | f returns 1. | TEST-S-002 |\n');
  fs.writeFileSync(path.join(d, 't.test.js'), '// @id TEST-S-001 @verifies REQ-S-001\n// @id TEST-S-002 @verifies REQ-S-002\n');
  const r = sdd(d, 'trace').out;
  assert.doesNotMatch(r, /REQ-S-001 has no @implements/, r);
  assert.match(r, /REQ-S-002 has no @implements/, r);
});

test('#48 tdd stub for Python does not stub installed third-party packages (user site / PYTHONPATH) or their submodules', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pysite-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'));
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-site-'));
  fs.mkdirSync(path.join(site, 'thirdpkg_zz'));
  fs.writeFileSync(path.join(site, 'thirdpkg_zz/__init__.py'), '');
  fs.writeFileSync(path.join(site, 'thirdpkg_zz/sub.py'), 'X = 1\n');
  fs.writeFileSync(path.join(d, 'tests/test_s.py'), '# @id TEST-S-001\n# @verifies REQ-S-001\nfrom thirdpkg_zz.sub import X\nfrom jobx.mod import f\ndef test_s_001():\n    assert f(X) == 1\n');
  sdd(d, 'init');
  spawnSync('node', [SDD, '--root', d, 'tdd', 'stub', 'TEST-S-001'], { encoding: 'utf8', env: { ...ENV, PYTHONPATH: site } });
  assert.ok(!fs.existsSync(path.join(d, 'thirdpkg_zz')));
  assert.ok(fs.existsSync(path.join(d, 'jobx/mod.py')));
});

test('#49 Python stub: exception classes derive from Exception; stub-only modules get newly imported names', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-pyexc-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'));
  fs.writeFileSync(path.join(d, 'tests/test_s.py'), '# @id TEST-S-001\n# @verifies REQ-S-001\nimport pytest\nfrom pk.errors import Boom\ndef test_s_001():\n    with pytest.raises(Boom):\n        pass\n\n# @id TEST-S-002\n# @verifies REQ-S-001\ndef test_s_002():\n    from pk.errors import Other\n    assert Other\n');
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  const f = path.join(d, 'pk/errors.py');
  assert.match(fs.readFileSync(f, 'utf8'), /class Boom\(Exception\)/);
  sdd(d, 'tdd', 'stub', 'TEST-S-002');
  assert.match(fs.readFileSync(f, 'utf8'), /class Boom\(Exception\)[\s\S]*class Other/);
  fs.appendFileSync(f, '\nREAL = 1\n');
  fs.writeFileSync(path.join(d, 'tests/test_s.py'), fs.readFileSync(path.join(d, 'tests/test_s.py'), 'utf8') + '\nfrom pk.errors import Third\n');
  sdd(d, 'tdd', 'stub', 'TEST-S-002');
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Third/);
});

test('#50 Rust: type stubs, panic message as Red reason, asserted result of a stub call is not weak', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-rust-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'src')); fs.mkdirSync(path.join(d, 'tests'));
  fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | When count is called, it shall count. | TEST-S-001 |\n');
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname = "lp"\nversion = "0.1.0"\nedition = "2021"\n');
  fs.writeFileSync(path.join(d, 'src/lib.rs'), '#[derive(Debug, PartialEq)]\npub struct S { pub n: usize }\npub fn count(_l: &[&str]) -> S { unimplemented!("count") }\n');
  fs.writeFileSync(path.join(d, 'tests/t.rs'), 'use lp::count;\n\n// @id TEST-S-001 @verifies REQ-S-001\n#[test]\nfn test_s_001() {\n    let s = count(&["a"]);\n    assert_eq!(s.n, 1);\n}\n');
  sdd(d, 'init');
  const r = sdd(d, 'tdd', 'red', 'TEST-S-001').out;
  assert.match(r, /fails with: not implemented: count/, r);
  assert.doesNotMatch(r, /\[weak\]/, r);
});

test('#50 Rust tdd stub: capitalised imports become types (enum for Name::Variant), not functions', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-rusttype-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'));
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname = "lp"\nversion = "0.1.0"\nedition = "2021"\n');
  fs.writeFileSync(path.join(d, 'tests/t.rs'), 'use lp::{parse, Level};\n\n// @id TEST-S-001 @verifies REQ-S-001\n#[test]\nfn test_s_001() {\n    assert_eq!(parse("x"), Level::Warn);\n}\n');
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  const lib = fs.readFileSync(path.join(d, 'src/lib.rs'), 'utf8');
  assert.match(lib, /pub enum Level \{\s*Warn,/);
  assert.doesNotMatch(lib, /pub fn Level/);
});

test('#52 framework build output (.mastra, .next, …) is not scanned for @id (no duplicate-@id errors)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-build-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, '.mastra/output'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | f shall return 1. | TEST-S-001 |\n');
  const code = '// @id CODE-S-001 @implements REQ-S-001\nexport const f = () => 1;\n';
  fs.writeFileSync(path.join(d, 'f.mjs'), code);
  fs.writeFileSync(path.join(d, '.mastra/output/f.mjs'), code);
  assert.doesNotMatch(sdd(d, 'trace').out, /duplicate @id/);
});

test('T2 spec without a ## Design section cannot be locked and fails guard/gate', () => {
  const d = project();
  const sp = path.join(d, '.sdd/specs/calc.md');
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace(/## Design[\s\S]*?\n\n/, ''));
  const a = sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho');
  assert.equal(a.code, 1);
  assert.match(a.out, /needs a "## Design"/);
  assert.match(sdd(d, 'guard').out, /GUARD FAIL/);
  assert.match(sdd(d, 'gate', '--no-run').out, /design calc: missing/);
});

test('plan: orders features, flags bad dependencies, and names the next feature', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-plan-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/a.md'), '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | f shall return 1. | TEST-A-001 |\n');
  const plan = (rows) => fs.writeFileSync(path.join(d, '.sdd/plan.md'), `| order | feature | depends | note |\n|---|---|---|---|\n${rows}\n`);
  plan('| 1 | a | - | core |\n| 2 | b | a | later |');
  let r = sdd(d, 'plan');
  assert.equal(r.code, 0);
  assert.match(r.out, /next: a/);
  plan('| 1 | a | b | x |\n| 2 | b | a | y |\n| 3 | c | zzz | z |');
  r = sdd(d, 'plan');
  assert.equal(r.code, 1);
  assert.match(r.out, /dependency b is ordered after/);
  assert.match(r.out, /unknown dependency zzz/);
});

test('changing a REQ line stales its tests until tdd refactor/red re-verifies; other REQ edits do not', () => {
  const d = project();
  const sp = path.join(d, '.sdd/specs/calc.md');
  sdd(d, 'init');
  sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho');
  impl(d, '(a, b) => a - b');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  impl(d, '(a, b) => a + b');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
  fs.appendFileSync(sp, '\nnotes outside any REQ line\n');
  sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho');
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('shall sum.', 'shall return the sum of both numbers.'));
  sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho');
  const g = sdd(d, 'gate', '--no-run');
  assert.match(g.out, /REQ-CALC-001 changed in the spec/);
  assert.equal(sdd(d, 'tdd', 'refactor', 'TEST-CALC-001').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
});

test('plan: a feature is not done while a REQ has no test or its T2 lock is stale', () => {
  const d = project();
  sdd(d, 'init');
  fs.writeFileSync(path.join(d, '.sdd/plan.md'), '| order | feature | depends | note |\n|---|---|---|---|\n| 1 | calc | - | x |\n');
  sdd(d, 'approve', 'record', 'calc', '--by', 'nahisaho');
  impl(d, '(a, b) => a - b');
  sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  impl(d, '(a, b) => a + b');
  sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.match(sdd(d, 'plan').out, /next: \(all features done\)/);
  const sp = path.join(d, '.sdd/specs/calc.md');
  fs.appendFileSync(sp, '| REQ-CALC-002 | When sub is called, the system shall subtract. | TEST-CALC-002 |\n');
  const r = sdd(d, 'plan').out;
  assert.match(r, /next: calc/);
  assert.match(r, /· 1\. calc \[T2:stale\]/);
});

test('appending a new test after the last one keeps the previous last test evidence (describe closer is not part of the test)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-append-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/c.md'), '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | f shall return 1. | TEST-C-001 |\n| REQ-C-002 | g shall return 2. | TEST-C-002 |\n');
  fs.writeFileSync(path.join(d, 'f.mjs'), '// @id CODE-C-001 @implements REQ-C-001 REQ-C-002\nexport const f = () => 1;\nexport const g = () => 2;\n');
  const head = "import { describe, test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f, g } from './f.mjs';\ndescribe('c', () => {\n";
  const t1 = "  // @id TEST-C-001 @verifies REQ-C-001\n  test('TEST-C-001 f', () => {\n    assert.equal(f(), 1);\n  });\n";
  const t2 = "\n  // @id TEST-C-002 @verifies REQ-C-002\n  test('TEST-C-002 g', () => {\n    assert.equal(g(), 2);\n  });\n";
  fs.writeFileSync(path.join(d, 'c.test.mjs'), head + t1 + '});\n');
  sdd(d, 'init');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-C-001', '--characterization', 'impl exists').code, 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-C-001').code, 0);
  fs.writeFileSync(path.join(d, 'c.test.mjs'), head + t1 + t2 + '});\n');
  const g = sdd(d, 'gate', '--no-run').out;
  assert.match(g, /TEST-C-002 \(REQ-C-002\): no Green recorded/);
  assert.doesNotMatch(g, /TEST-C-001 .*changed/);
});

test('#55 adding a name to an import list keeps sibling evidence; changing the import module does not', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-imp-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdd/specs/c.md'), '---\nfeature: c\ntier: T1\n---\n| REQ-C-001 | f shall return 1. | TEST-C-001 |\n| REQ-C-002 | g shall return 2. | TEST-C-002 |\n');
  fs.writeFileSync(path.join(d, 'f.mjs'), '// @id CODE-C-001 @implements REQ-C-001 REQ-C-002\nexport const f = () => 1;\nexport const g = () => 2;\n');
  fs.writeFileSync(path.join(d, 'other.mjs'), 'export const f = () => 1;\n');
  const head = (names, mod = './f.mjs') => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${names} } from '${mod}';\n`;
  const t1 = "// @id TEST-C-001 @verifies REQ-C-001\ntest('TEST-C-001 f', () => assert.equal(f(), 1));\n";
  const t2 = "// @id TEST-C-002 @verifies REQ-C-002\ntest('TEST-C-002 g', () => assert.equal(g(), 2));\n";
  const file = path.join(d, 'c.test.mjs');
  fs.writeFileSync(file, head('f') + t1);
  sdd(d, 'init');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-C-001', '--characterization', 'impl exists').code, 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-C-001').code, 0);
  fs.writeFileSync(file, head('f, g') + t1 + t2);
  assert.doesNotMatch(sdd(d, 'gate', '--no-run').out, /TEST-C-001 .*changed/);
  fs.writeFileSync(file, head('f, g', './other.mjs') + t1 + t2);
  assert.match(sdd(d, 'gate', '--no-run').out, /TEST-C-001 .*changed/);
});

// ---- 2nd dogfood round (#56-#68) ----
function mini(spec, files = {}, cmd = null) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-m-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  for (const [f, body] of Object.entries({ '.sdd/specs/a.md': spec, 'package.json': '{}', ...files })) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  sdd(d, 'init');
  if (cmd) { const cp = path.join(d, '.sdd/config.json'); const c = JSON.parse(fs.readFileSync(cp, 'utf8')); c.testCmd = cmd; fs.writeFileSync(cp, JSON.stringify(c)); }
  return d;
}
const PASS = ['node', '-e', '0'];
const FAIL = ['node', '-e', 'console.log("AssertionError: boom");process.exit(1)'];
const setCmd = (d, cmd) => { const cp = path.join(d, '.sdd/config.json'); const c = JSON.parse(fs.readFileSync(cp, 'utf8')); c.testCmd = cmd; fs.writeFileSync(cp, JSON.stringify(c)); };

test('#56 every @verifies REQ is hash-tracked, not only the first', () => {
  const spec = (w) => `---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n| REQ-A-002 | two ${w} hold. | TEST-A-001 |\n`;
  const d = mini(spec('shall'), { 'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001 REQ-A-002\n// test body\n' }, FAIL);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
  fs.writeFileSync(path.join(d, '.sdd/specs/a.md'), spec('must not'));
  assert.match(sdd(d, 'gate', '--no-run').out, /REQ-A-002 changed in the spec/);
});

test('#57 approver name is normalized: whitespace/empty/ai variants cannot satisfy approval: human', () => {
  const d = mini('---\nfeature: a\ntier: T1\napproval: human\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n');
  for (const by of [' ai:duck', 'ai :duck', 'ai:duck ', '', ' ', 'ai', 'ａｉ:duck']) assert.notEqual(sdd(d, 'approve', 'record', 'a', '--by', by, '--review', 'ok').code, 0, JSON.stringify(by));
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'Alice').code, 0);
  const d2 = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n');
  assert.notEqual(sdd(d2, 'approve', 'record', 'a', '--by', 'ai:self ', '--review', 'ok').code, 0);
});

test('#58 deferred/test-only only count as delimited markers, not prose words', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | The system shall retry deferred jobs. | TEST-A-001 |\n| REQ-A-002 (deferred) | Later. | — |\n');
  const t = sdd(d, 'trace').out;
  assert.match(t, /REQ-A-001 has no test/);
  assert.doesNotMatch(t, /REQ-A-002 has no test/);
});

test('#59 frontmatter: trailing comments, quotes and CRLF do not downgrade T2 / approval: human', () => {
  for (const fm of ['tier: T2   # security', 'tier: "T2"', 'tier: t2']) {
    const d = mini(`---\nfeature: a\n${fm}\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n`);
    assert.match(sdd(d, 'guard').out, /Design|T2/i, fm);
    assert.notEqual(sdd(d, 'guard').code, 0, fm);
  }
  const crlf = mini('---\r\nfeature: a\r\ntier: T1\r\napproval: human   # destructive\r\n---\r\n| REQ-A-001 | x shall hold. | TEST-A-001 |\r\n');
  assert.notEqual(sdd(crlf, 'approve', 'record', 'a', '--by', 'ai:duck', '--review', 'ok').code, 0);
});

test('#60 gate/trace --changed: untracked dirs and file-less trace errors are not hidden', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n');
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i'], { cwd: d });
  fs.appendFileSync(path.join(d, '.sdd/specs/a.md'), '| REQ-A-002 | y shall hold. | TEST-A-002 |\n');
  const tr = sdd(d, 'trace', '--changed');
  assert.notEqual(tr.code, 0);
  assert.match(tr.out, /REQ-A-00[12] has no test/);
  fs.mkdirSync(path.join(d, 'newdir'));
  fs.writeFileSync(path.join(d, 'newdir/a.test.mjs'), '// @id TEST-A-001 @verifies REQ-A-001\n');
  const g = sdd(d, 'gate', '--changed', '--no-run');
  assert.match(g.out, /TEST-A-001 .*no Green recorded/);
});

test('#61 plan warns about specs missing from plan.md instead of "all features done"', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', { '.sdd/specs/b.md': '---\nfeature: b\ntier: T1\n---\n| REQ-B-001 | y shall hold. | TEST-B-001 |\n', '.sdd/plan.md': '| order | feature | depends | note |\n|---|---|---|---|\n| 1 | a | | |\n' });
  const o = sdd(d, 'plan').out;
  assert.match(o, /b: spec is not in plan\.md/);
  assert.doesNotMatch(o, /all features done/);
});

test('#62 green/refactor refuse a run where everything was skipped (vitest/jest summary)', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', { 'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001\n' }, FAIL);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, ['node', '-e', 'console.log(" Test Files  1 passed (1)\\n      Tests  1 skipped (1)")']);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-A-001').out, /REJECTED/);
});

test('#63 approval: human on a T1 spec still needs a lock', () => {
  const d = mini('---\nfeature: a\ntier: T1\napproval: human\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', { 'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001\n' }, FAIL);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REFUSED/);
  assert.match(sdd(d, 'gate', '--no-run').out, /✗ lock a: missing/);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'Alice').code, 0);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
});

test('#64 ts-jest compile errors are a load error, not a Red', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', { 'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001\n' },
    ['node', '-e', 'console.log("FAIL tests/m.test.ts\\n  Test suite failed to run\\n    error TS2305: Module has no exported member add");process.exit(1)']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*load\/compile/);
});

test('#65 prose lines are not REQs; continuation lines of a bullet REQ are hashed', () => {
  const spec = (tail) => `---\nfeature: a\ntier: T1\n---\n- REQ-A-001 When add is called,\n  the system shall return ${tail}.\n\n## Assumptions\nREQ-A-001 was spiked on 2026-01-01.\n`;
  const d = mini(spec('a+b'), { 'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001\n' }, FAIL);
  assert.doesNotMatch(sdd(d, 'trace').out, /duplicate REQ/);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  fs.writeFileSync(path.join(d, '.sdd/specs/a.md'), spec('a-b'));
  assert.match(sdd(d, 'gate', '--no-run').out, /REQ-A-001 changed in the spec/);
});

test('#66 preamble edits are detected even when a comment mentions @implements; python docstring @id scopes def lines', () => {
  const spec = '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n| REQ-A-002 | y shall hold. | TEST-A-002 |\n';
  const d = mini(spec, { 'a.test.mjs': 'const base = () => 1;\n// @id TEST-A-001 @verifies REQ-A-001\n// t1\n// @id TEST-A-002 @verifies REQ-A-002\n// t2\n// note: @implements lives in lib.mjs\n' }, FAIL);
  for (const id of ['TEST-A-001', 'TEST-A-002']) assert.equal(sdd(d, 'tdd', 'red', id).code, 0);
  setCmd(d, PASS);
  for (const id of ['TEST-A-001', 'TEST-A-002']) assert.equal(sdd(d, 'tdd', 'green', id).code, 0);
  fs.writeFileSync(path.join(d, 'a.test.mjs'), fs.readFileSync(path.join(d, 'a.test.mjs'), 'utf8').replace('=> 1', '=> 2'));
  assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);

  const py = (extra) => `import pytest\n\ndef test_a_001():\n    """@id TEST-A-001 @verifies REQ-A-001"""\n    assert 1\n\ndef test_a_002():\n    """@id TEST-A-002 @verifies REQ-A-002"""\n    assert 2\n${extra}`;
  const d2 = mini(spec, { 't_test.py': py('') }, FAIL);
  fs.renameSync(path.join(d2, 't_test.py'), path.join(d2, 'test_t.py'));
  for (const id of ['TEST-A-001', 'TEST-A-002']) assert.equal(sdd(d2, 'tdd', 'red', id).code, 0);
  setCmd(d2, PASS);
  for (const id of ['TEST-A-001', 'TEST-A-002']) assert.equal(sdd(d2, 'tdd', 'green', id).code, 0);
  fs.appendFileSync(path.join(d2, 'test_t.py'), '\n@pytest.mark.skip\ndef test_a_003():\n    """@id TEST-A-003 @verifies REQ-A-002"""\n    assert 3\n');
  const g = sdd(d2, 'gate', '--no-run').out;
  assert.doesNotMatch(g, /TEST-A-002 .*changed/);
  fs.writeFileSync(path.join(d2, 'test_t.py'), fs.readFileSync(path.join(d2, 'test_t.py'), 'utf8').replace('assert 1', 'assert 11'));
  const g2 = sdd(d2, 'gate', '--no-run').out;
  assert.match(g2, /TEST-A-001 .*changed/);
  assert.doesNotMatch(g2, /TEST-A-002 .*changed/);
});

test('#67 polyglot: dependsOn may be a file; root-owned change hint shows without root checks', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', { 'svc/x.txt': 'x', 'contract/schema.json': '{}', 'README.md': 'r' });
  const cp = path.join(d, '.sdd/config.json');
  fs.writeFileSync(cp, JSON.stringify({ testCmd: PASS, checks: [], projects: [{ root: 'svc', testCmd: PASS, dependsOn: ['contract/schema.json'], checks: [{ name: 'ok', cmd: ['node', '-e', '0'] }] }] }));
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i'], { cwd: d });
  fs.writeFileSync(path.join(d, 'contract/schema.json'), '{"a":1}');
  assert.match(sdd(d, 'gate', '--changed').out, /✓ cmd svc:ok/);
  spawnSync('git', ['checkout', 'contract/schema.json'], { cwd: d });
  fs.writeFileSync(path.join(d, 'README.md'), 'changed');
  assert.match(sdd(d, 'gate', '--changed').out, /root-owned data\/config changes: README\.md/);
});

test('#68 python tdd stub: src layout and multi-line imports', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', {
    'pyproject.toml': '[project]\nname="m"\nversion="0"\n',
    'src/pkg/__init__.py': '',
    'src/pkg/real.py': 'def ok():\n    return 1\n',
    'tests/test_a.py': 'from pkg.mod import (\n    alpha,\n    beta,\n)\nfrom pkg import real\n\ndef test_a_001():\n    """@id TEST-A-001 @verifies REQ-A-001"""\n    assert alpha() == 1\n',
  });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.ok(fs.existsSync(path.join(d, 'src/pkg/mod.py')), 'stub under src/');
  assert.ok(!fs.existsSync(path.join(d, 'pkg')), 'no stub at project root');
  const body = fs.readFileSync(path.join(d, 'src/pkg/mod.py'), 'utf8');
  assert.match(body, /def alpha/);
  assert.match(body, /def beta/);
});

test('#69 tdd stub: Rust module paths and Go types/methods/fields', { skip: ['go', 'cargo'].some((c) => spawnSync('which', [c]).status !== 0) }, () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
  const rs = mk({ 'Cargo.toml': '[package]\nname = "app04"\nversion = "0.1.0"\nedition = "2021"\n', 'tests/t.rs': 'use app04::lex::{tokenize, Tok};\nuse app04::types::check::{check, Ty};\n// @id TEST-R-001 @verifies REQ-R-001\n#[test]\nfn test_r_001() { assert_eq!(tokenize("x"), 3); let _t: Tok; assert_eq!(check(1), Ty::Int); }\n' });
  sdd(rs, 'tdd', 'stub', 'TEST-R-001');
  assert.match(read(rs, 'src/lib.rs'), /pub mod lex;\npub mod types;/);
  assert.doesNotMatch(read(rs, 'src/lib.rs'), /pub fn lex/);
  assert.match(read(rs, 'src/lex.rs'), /pub fn tokenize<A0>[\s\S]*pub struct Tok;/);
  assert.match(read(rs, 'src/types.rs'), /pub mod check;/);
  assert.match(read(rs, 'src/types/check.rs'), /pub fn check<A0>[\s\S]*pub enum Ty \{\n    Int,/);
  const go = mk({ 'go.mod': 'module m\n\ngo 1.21\n', 'm_test.go': 'package m\nimport "testing"\n// @id TEST-M-001 @verifies REQ-M-001\nfunc TestTEST_M_001(t *testing.T) {\n\to := NewOrder("x")\n\to.Add(Item{Name: "a", Qty: 2})\n\tif o.Total() != 3 { t.Fatal("x") }\n\tvar c Config\n\t_ = c\n\tif o.Count != 1 { t.Fatal("y") }\n}\n' });
  sdd(go, 'tdd', 'stub', 'TEST-M-001');
  const g = read(go, 'm.go');
  assert.match(g, /type Item struct/);
  assert.match(g, /func NewOrder\(a0 any\) \*Order/);
  assert.match(g, /func \(\*Order\) Add\(/);
  assert.match(g, /func \(\*Order\) Total\(\) int/);
  assert.equal(spawnSync('go', ['vet', './...'], { cwd: go }).status, 0);
});

// ---- dogfood round 3 (#70-#81) ----
const T1SPEC = '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n';
const T2SPEC = '---\nfeature: a\ntier: T2\napproval: human\n---\n## Design\nx\n\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n';
const jsTest = (extra = '') => `// @id TEST-A-001 @verifies REQ-A-001\ntest('TEST-A-001 x', () => {\n  assert.ok(1);\n});\n${extra}`;
const specPath = (d) => path.join(d, '.sdd/specs/a.md');

test('#71 T2 downgrade / dropping approval: human is not silently accepted', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest() }, PASS);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'alice').code, 0);
  fs.writeFileSync(specPath(d), T2SPEC.replace('approval: human\n', ''));
  const g = sdd(d, 'gate', '--no-run');
  assert.match(g.out, /policy loosened|stale|human/i);
  assert.notEqual(sdd(d, 'approve', 'record', 'a', '--by', 'ai:reviewer', '--review', 'ok').code, 0, 'AI must not re-lock a loosened spec');
  fs.rmSync(specPath(d));
  assert.match(sdd(d, 'gate', '--no-run').out, /spec removed/);
  assert.equal(sdd(d, 'approve', 'retire', 'a', '--by', 'alice').code, 0);
  assert.doesNotMatch(sdd(d, 'gate', '--no-run').out, /spec removed/);
});

test('#72 BOM keeps T2; CRLF conversion does not stale the lock', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest() }, PASS);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'alice').code, 0);
  fs.writeFileSync(specPath(d), '\ufeff' + T2SPEC.replace(/\n/g, '\r\n'));
  const out = sdd(d, 'gate', '--no-run').out;
  assert.match(out, /lock a: ok/);
});

test('#73 appending after the last test keeps its evidence', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  fs.appendFileSync(path.join(d, 'a.test.mjs'), '\n// trailing note\nfunction main() { return 1; }\n');
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
});

test('#75 vitest load failure is a load error; missing method is weak; npm noise dropped', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, ['node', '-e', 'console.log("Error: Failed to load url ./x (resolved id: ./x)");process.exit(1)']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*load\/compile/);
  setCmd(d, ['node', '-e', 'console.log("TypeError: x.run is not a function");process.exit(1)']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED|weak/i);
});

test('#77 plan: removed REQ means the feature is not done', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  sdd(d, 'tdd', 'red', 'TEST-A-001'); setCmd(d, PASS); sdd(d, 'tdd', 'green', 'TEST-A-001');
  fs.writeFileSync(specPath(d), '---\nfeature: a\ntier: T1\n---\n| REQ-A-009 | other shall hold. | TEST-A-009 |\n');
  fs.writeFileSync(path.join(d, '.sdd/plan.md'), '| order | feature | depends | note |\n|---|---|---|---|\n| 1 | a | - | x |\n');
  assert.doesNotMatch(sdd(d, 'plan').out, /\bdone\b/i);
});

test('#78 full-width （deferred） and full-width digits in REQ IDs', () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n| REQ-A-００２ | two shall hold. （deferred） | - |\n', { 'a.test.mjs': jsTest() }, PASS);
  const out = sdd(d, 'trace').out;
  assert.match(out, /REQ-A-002|\+1 deferred|deferred/);
});

test('#79 ledger conflict markers give a clean message; merge-ledger repairs', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  sdd(d, 'tdd', 'red', 'TEST-A-001');
  const f = path.join(d, '.sdd/tdd.jsonl');
  const body = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, `<<<<<<< HEAD\n${body}=======\n${body}>>>>>>> other\n`);
  const r = sdd(d, 'tdd', 'check');
  assert.match(r.out, /LEDGER CONFLICT/);
  assert.doesNotMatch(r.out, /SyntaxError/);
  assert.equal(sdd(d, 'tdd', 'merge-ledger').code, 0);
  assert.doesNotMatch(sdd(d, 'tdd', 'check').out, /LEDGER (CONFLICT|CORRUPT)/);
});

test('#81 approve record refuses generic approver names for human approval', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest() }, PASS);
  assert.notEqual(sdd(d, 'approve', 'record', 'a', '--by', 'bot').code, 0);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'alice').code, 0);
});

test('#76 tdd stub: Java ctor/enum, C header under include/, Rust workspace member crate', () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
  const j = mk({ 'FooTest.java': 'import org.junit.jupiter.api.Test;\nclass FooTest {\n  // @id TEST-J-001 @verifies REQ-J-001\n  @Test void t() { Account a = new Account("x", 5); Kind k = Kind.DEBIT; Kind m = Kind.CREDIT; }\n}\n' });
  sdd(j, 'tdd', 'stub', 'TEST-J-001');
  assert.match(read(j, 'Account.java'), /public Account\(String a0, int a1\)/);
  assert.match(read(j, 'Kind.java'), /public enum Kind \{\n    DEBIT, CREDIT/);
  const c = mk({ 'include/.keep': '', 'tests/t.c': '#include "list.h"\n// @id TEST-C-001 @verifies REQ-C-001\nint main(void) { Node *n = list_new(3); return 0; }\n' });
  sdd(c, 'tdd', 'stub', 'TEST-C-001');
  assert.ok(fs.existsSync(path.join(c, 'include/list.h')), 'header goes to include/');
  assert.ok(!fs.existsSync(path.join(c, 'tests/list.h')), 'not shadowing in tests/');
  assert.match(read(c, 'include/list.h'), /void \* list_new/);
  const r = mk({ 'Cargo.toml': '[workspace]\nmembers = ["crates/core", "crates/app"]\n', 'crates/core/Cargo.toml': '[package]\nname = "core-lib"\nversion = "0.1.0"\nedition = "2021"\n', 'crates/core/src/lib.rs': '', 'crates/app/Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n', 'crates/app/src/lib.rs': '', 'crates/app/tests/t.rs': 'use core_lib::shapes::{area, Shape};\n// @id TEST-R-001 @verifies REQ-R-001\n#[test]\nfn t() { assert_eq!(area(Shape), 3); }\n' });
  sdd(r, 'tdd', 'stub', 'TEST-R-001');
  assert.match(read(r, 'crates/core/src/lib.rs'), /pub mod shapes;/);
  assert.match(read(r, 'crates/core/src/shapes.rs'), /pub fn area/);
  assert.equal(read(r, 'crates/app/src/lib.rs'), '');
});

// ---- dogfood round 4 (#82-#89) ----
test('#82 guard/plan/status report orphan annotations; stub refuses unknown REQ; spec conflict markers flagged', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest(), 'b.test.mjs': "// @id TEST-B-001 @verifies REQ-B-001\ntest('TEST-B-001 x', () => {\n});\n" }, PASS);
  fs.writeFileSync(path.join(d, '.sdd/plan.md'), '| order | feature | depends | note |\n|---|---|---|---|\n| 1 | a | - | x |\n');
  const g = sdd(d, 'guard');
  assert.notEqual(g.code, 0);
  assert.match(g.out, /unknown REQ-B-001/);
  assert.match(sdd(d, 'plan').out, /REQ-B-001 is referenced/);
  assert.match(sdd(d, 'status').out, /ORPHAN refs 1/);
  const st = sdd(d, 'tdd', 'stub', 'TEST-B-001');
  assert.equal(st.code, 1);
  assert.match(st.out, /no spec defines/);
  fs.writeFileSync(specPath(d), `${T1SPEC}<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n`);
  assert.match(sdd(d, 'trace').out, /SPEC CONFLICT/);
});

test('#83 full-width REQ id does not stale evidence', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  sdd(d, 'tdd', 'red', 'TEST-A-001'); setCmd(d, PASS); assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  fs.writeFileSync(specPath(d), T1SPEC.replace('REQ-A-001', 'ＲＥＱ－Ａ－００１'));
  assert.match(sdd(d, 'gate', '--no-run').out, /1\/1 tests Red→Green/);
});

test('#85 Maven compiler-plugin failure is a load error, not a Red', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, ['node', '-e', 'console.log("[ERROR] Fatal error compiling: error: release version 21 not supported\\n[INFO] BUILD FAILURE");process.exit(1)']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*load\/compile/);
});

test('#84 skipped Go/JUnit test is not a Red; #86 gate shows the failing line', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, ['node', '-e', 'console.log("--- SKIP: TestX (0.00s)\\nok  \\tm\\t0.00s");process.exit(0)']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*skipped/);
  const lines = Array.from({ length: 20 }, (_, i) => `ok line ${i}`).join('\\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ checks: [{ name: 'c', cmd: ['node', '-e', `console.log("FAIL arena_reset expected 0");console.log("${lines}");process.exit(1)`] }] }));
  assert.match(sdd(d, 'gate').out, /FAIL arena_reset expected 0/);
});

test('#87 tdd stub: PHP class (no fn keyword), C opaque typedef + typed pointer param, Rust Option return', () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
  const php = mk({ 'MoneyTest.php': "<?php\nrequire __DIR__ . '/src/Money.php';\n// @id TEST-M-001 @verifies REQ-M-001\ntest('TEST-M-001', fn() => assertEq(Money::yen(5)->amount(), 5));\n" });
  sdd(php, 'tdd', 'stub', 'TEST-M-001');
  const m = read(php, 'src/Money.php');
  assert.match(m, /class Money/);
  assert.match(m, /public static function yen/);
  assert.doesNotMatch(m, /function fn\b|function assertEq/);
  const c = mk({ 'include/.keep': '', 'tests/t.c': '#include "arena.h"\n// @id TEST-C-001 @verifies REQ-C-001\nint main(void) { arena_t *a = arena_create(1024); arena_reset(a); return 0; }\n' });
  sdd(c, 'tdd', 'stub', 'TEST-C-001');
  assert.match(read(c, 'include/arena.h'), /typedef struct arena arena_t;/);
  assert.match(read(c, 'include/arena.h'), /arena_reset\(arena_t \* a0\)/);
});

test('#88 human-approved feature: implementation change after approval is flagged by gate', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest(), 'a.mjs': '// @id CODE-A-001 @implements REQ-A-001\nexport const a = 1;\n' }, PASS);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'alice').code, 0);
  assert.doesNotMatch(sdd(d, 'gate', '--no-run').out, /implementation changed since approval/);
  fs.appendFileSync(path.join(d, 'a.mjs'), 'export const b = 2;\n');
  assert.match(sdd(d, 'gate', '--no-run').out, /implementation changed since approval/);
});

test('#89 init re-run reports the kept config; call inside a multi-line assertion is not a weak Red', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': "// @id TEST-A-001 @verifies REQ-A-001\ntest('TEST-A-001 x', () => {\n  expect(\n    foo(1),\n  ).toBe(2);\n});\n" }, ['node', '-e', 'console.log("Error: not implemented: foo");process.exit(1)']);
  assert.match(sdd(d, 'init').out, /existing config kept/);
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /weak|setup call/i);
});
