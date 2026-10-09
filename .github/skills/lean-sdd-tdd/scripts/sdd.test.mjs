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
  fs.writeFileSync(rv, `spec ${hash}\nF1|high|add.mjs:1|Open\n`);
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /1 Open/);
  fs.writeFileSync(rv, 'F1|high|add.mjs:1|Closed\n');
  assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /spec hash/);
  fs.writeFileSync(rv, `spec ${hash}\nF1|high|add.mjs:1|Closed\n`);
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
  for (const line of ['| F1 | high | a.mjs:1 | Open |', '- [ ] F1 fix it', 'F1 state: Open', 'F1|high|a.mjs:1|OPEN']) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec ${hash}\n${line}\n`);
    assert.match(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').out, /Open finding/, line);
  }
  fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec ${hash}\n| F1 | high | a.mjs:1 | Closed |\n- [x] F2 done\nopen source note\n`);
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
