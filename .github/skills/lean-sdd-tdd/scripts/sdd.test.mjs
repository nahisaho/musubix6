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
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T2\n---\n| REQ-CALC-001 | When add is called, the system shall sum. | TEST-CALC-001 |\n');
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
  assert.deepEqual(gc.testCmd, ['go', 'test', './...', '-run', '{IDU}']);
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
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T2\n---\n| REQ-CALC-001 | When add is called, the system shall sum. | TEST-CALC-001 |\n');
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
  assert.match(sdd(d, 'gate', '--changed').out, /✓ cmd worker:t/);
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
