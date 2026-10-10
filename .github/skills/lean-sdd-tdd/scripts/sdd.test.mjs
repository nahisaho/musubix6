import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
const sddRaw = (d, ...a) => { const r = spawnSync('node', [SDD, '--root', d, ...a], { encoding: 'utf8', env: ENV }); return { code: r.status, out: r.stdout + r.stderr }; };
// human `approve record` needs a matching prepare (#99); tests that are not about that run prepare first
const sdd = (d, ...a) => { if (a[0] === 'approve' && a[1] === 'record' && !/^ai\s*:/i.test(String(a[a.indexOf('--by') + 1] ?? ''))) sddRaw(d, 'approve', 'prepare', a[2]); return sddRaw(d, ...a); };
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
    [{ 'pom.xml': '<project/>' }, 'mvn', /-Dtest=\*#\*\{idu\}(?!\*)/],
    [{ 'build.gradle': '' }, 'sh', / gradle -I .*--tests "\*\$0"/],
    [{ 'build.gradle.kts': '', gradlew: '' }, 'sh', / \.\/gradlew -I .*--tests "\*\$0"/],
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

function jsStubProject(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-jsstub-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"x","type":"module","scripts":{"test":"true"}}');
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  sdd(d, 'init');
  return d;
}

test('#128 tdd stub never adds methods to an existing class unless the receiver is provably that class', () => {
  const real = 'export class Store { read() { return []; } }\nexport class Other { go() { return 1; } }\n';
  const d = jsStubProject({
    'src/real.js': real,
    'test/a.test.js': [
      "import { Store, Other } from '../src/real.js';", "import { Handler } from '../src/handler.js';",
      'const make = () => new Store();',
      '/** @id TEST-A-001 @verifies REQ-A-001 */ test(\'TEST-A-001 x\', () => { const store = make(); const h = new Handler({ store });',
      "  assert.equal(h.run(), 1); assert.equal(store.read('x').length, 0); assert.equal(new Other().go(), 1); });", '',
    ].join('\n'),
  });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(fs.readFileSync(path.join(d, 'src/real.js'), 'utf8'), real);
  assert.match(fs.readFileSync(path.join(d, 'src/handler.js'), 'utf8'), /class Handler[\s\S]*run\(/);
  // a provable receiver (`new Other().stop()`) is still stubbed in the real class, append-only
  fs.writeFileSync(path.join(d, 'test/a.test.js'), fs.readFileSync(path.join(d, 'test/a.test.js'), 'utf8').replace('new Other().go()', 'new Other().stop()'));
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const after = fs.readFileSync(path.join(d, 'src/real.js'), 'utf8');
  assert.match(after, /stop\(\.\.\._args\)[\s\S]*not implemented: Other\.stop/);
  assert.doesNotMatch(after, /Other\.read|Store\.stop/);
});

test('#128 tdd stub: namespace imports, static methods, value imports and multi-line imports', () => {
  const d = jsStubProject({
    'test/n.test.ts': [
      "import * as util from '../src/util';", "import { Foo, CONFIG } from '../src/foo';",
      'import {', '  alpha,', '  type Shape,', '  beta,', "} from '../src/multi';",
      '/** @id TEST-N-001 @verifies REQ-N-001 */ test(\'TEST-N-001 x\', () => {',
      "  expect(util.slug('A b')).toBe('a-b'); expect(Foo.create(1)).toBeTruthy(); expect(CONFIG.max).toBe(3); expect(alpha(beta(1))).toBe(1); });", '',
    ].join('\n'),
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-N-001');
  assert.doesNotMatch(r.out, /no missing/);
  const rd = (f) => fs.readFileSync(path.join(d, f), 'utf8');
  assert.match(rd('src/util.ts'), /export function slug\(/);
  assert.doesNotMatch(rd('src/util.ts'), /^export \{\};/m);
  assert.match(rd('src/foo.ts'), /export class Foo[\s\S]*static create\(/);
  assert.match(rd('src/foo.ts'), /export const CONFIG: any = new Proxy[\s\S]*not implemented: CONFIG\./);
  assert.doesNotMatch(rd('src/foo.ts'), /function CONFIG/);
  assert.match(rd('src/multi.ts'), /export function alpha\([\s\S]*export function beta\(/);
  assert.match(rd('src/multi.ts'), /export type Shape = any;/);
});

test('#128 tdd stub: workspace package imports are stubbed in the package entry; unresolvable packages are reported', () => {
  const d = jsStubProject({
    'package.json': '{"name":"root","private":true,"workspaces":["packages/*"],"scripts":{"test":"true"}}',
    'packages/domain/package.json': '{"name":"@bk/domain","main":"src/index.ts"}',
    'packages/domain/src/index.ts': 'export const keep = 1;\n',
    'packages/app/test/d.test.ts': [
      "import { isTerminal } from '@bk/domain';", "import { ghost } from '@bk/ghost';",
      '/** @id TEST-D-001 @verifies REQ-D-001 */ test(\'TEST-D-001 x\', () => { expect(isTerminal(1)).toBe(true); ghost(); });', '',
    ].join('\n'),
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-D-001');
  const idx = fs.readFileSync(path.join(d, 'packages/domain/src/index.ts'), 'utf8');
  assert.match(idx, /^export const keep = 1;\n/);
  assert.match(idx, /export function isTerminal\(/);
  assert.match(r.out, /not stubbed: @bk\/ghost/);
});

const GO_OK = spawnSync('which', ['go']).status === 0;
function goStubProject(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-gostub-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.writeFileSync(path.join(d, 'go.mod'), 'module example.com/r\n\ngo 1.21\n');
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  return d;
}

test('#129 Go external test package: Err* become errors.New vars, ctor returns a zero value, stub compiles, path printed once', { skip: !GO_OK }, () => {
  const d = goStubProject({
    'calc/calc_test.go': 'package calc_test\n\nimport (\n\t"errors"\n\t"testing"\n\n\t"example.com/r/calc"\n)\n\n// @id TEST-C-001 @verifies REQ-C-001\nfunc TestC(t *testing.T) {\n\tif _, err := calc.New(0, 1, nil); !errors.Is(err, calc.ErrBad) {\n\t\tt.Fatal(err)\n\t}\n\tc, err := calc.New(1, 3, nil)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif c.Allow() != true {\n\t\tt.Fatal("no")\n\t}\n}\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-C-001');
  const body = fs.readFileSync(path.join(d, 'calc/calc.go'), 'utf8');
  assert.match(body, /var ErrBad = errors\.New\("ErrBad"\)/);
  assert.doesNotMatch(body, /const ErrBad/);
  assert.match(body, /func New\(a0, a1, a2 any\) \(\*Calc, error\) \{\n\treturn &Calc\{\}, nil/);
  assert.match(body, /func \(\*Calc\) Allow\(\)[\s\S]*not implemented: Calc\.Allow/);
  assert.doesNotMatch(body, /NewResult|func New\(\) error/);
  assert.equal((r.out.match(/calc\/calc\.go/g) ?? []).length, 1, r.out);
  assert.doesNotMatch(r.out, /NOT verified|does not compile/);
  const vet = spawnSync('go', ['vet', './calc'], { cwd: d, encoding: 'utf8' });
  assert.equal(vet.status, 0, vet.stdout + vet.stderr);
});

test('#129 Go in-package constructors return a zero value so only behaviour methods panic', { skip: !GO_OK }, () => {
  const d = goStubProject({
    'pq/pq_test.go': 'package pq\n\nimport "testing"\n\n// @id TEST-PQ-001 @verifies REQ-PQ-001\nfunc TestPQ(t *testing.T) {\n\tq := New()\n\tq.Push("low", 1)\n\tgot := q.Pop()\n\tif got != "low" {\n\t\tt.Fatal(got)\n\t}\n}\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-PQ-001');
  const body = fs.readFileSync(path.join(d, 'pq/pq.go'), 'utf8');
  assert.match(body, /func New\(\) \*Pq \{\n\treturn &Pq\{\}\n\}/);
  assert.doesNotMatch(body, /not implemented: New\b/);
  assert.match(body, /not implemented: Pq\.Push/);
  assert.doesNotMatch(r.out, /does not compile/);
  assert.equal(spawnSync('go', ['vet', './pq'], { cwd: d, encoding: 'utf8' }).status, 0);
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

test('#91 impact: REQ change lists dependent tests/REQs of other features (JS, Python, Go, C)', () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const spec = (f, id) => `---\nfeature: ${f}\ntier: T1\n---\n- ${id} x\n`;
  const js = mk({
    '.sdd/specs/a.md': spec('a', 'REQ-A-001'), '.sdd/specs/b.md': spec('b', 'REQ-B-001'),
    'a.mjs': '// @id CODE-A-001 @implements REQ-A-001\nexport const a=1;\n',
    'b.mjs': '// @id CODE-B-001 @implements REQ-B-001\nimport {a} from "./a.mjs";\nexport const b=a;\n',
    'b.test.mjs': '// @id TEST-B-001 @verifies REQ-B-001\nimport {b} from "./b.mjs";\n',
  });
  const r = sdd(js, 'impact', 'REQ-A-001');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /impl: a\.mjs/);
  assert.match(r.out, /other feature REQ-B-001 \[b\]/);
  assert.match(r.out, /b\.test\.mjs/);
  assert.equal(JSON.parse(sdd(js, 'impact', 'a.mjs', '--json').out).otherReqs[0].req, 'REQ-B-001');
  assert.equal(sdd(js, 'impact', 'REQ-NOPE-1').code, 1);

  const py = mk({
    '.sdd/specs/a.md': spec('a', 'REQ-A-001'), '.sdd/specs/b.md': spec('b', 'REQ-B-001'),
    'pkg/core.py': '# @id CODE-A-001 @implements REQ-A-001\ndef f(): return 1\n',
    'tests/test_b.py': '# @id TEST-B-001 @verifies REQ-B-001\nfrom pkg.core import f\n',
  });
  assert.match(sdd(py, 'impact', 'REQ-A-001').out, /other feature REQ-B-001/);

  const go = mk({
    '.sdd/specs/a.md': spec('a', 'REQ-A-001'), '.sdd/specs/b.md': spec('b', 'REQ-B-001'),
    'go.mod': 'module ex.com/m\n',
    'core/core.go': 'package core\n// @id CODE-A-001 @implements REQ-A-001\nfunc F() int { return 1 }\n',
    'cli/cli_test.go': 'package cli\nimport "ex.com/m/core"\n// @id TEST-B-001 @verifies REQ-B-001\nfunc TestX() { core.F() }\n',
  });
  assert.match(sdd(go, 'impact', 'REQ-A-001').out, /other feature REQ-B-001/);

  const c = mk({
    '.sdd/specs/a.md': spec('a', 'REQ-A-001'), '.sdd/specs/b.md': spec('b', 'REQ-B-001'),
    'include/arena.h': '// @id CODE-A-001 @implements REQ-A-001\nint x;\n',
    'tests/t.c': '#include "arena.h"\n// @id TEST-B-001 @verifies REQ-B-001\nint main(void){return 0;}\n',
  });
  assert.match(sdd(c, 'impact', 'REQ-A-001').out, /other feature REQ-B-001/);
});

// ---- dogfood round 5 (#92-#102) ----
test('#92 human-approved: first implementation after approval does not warn; later change does', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest(), 'a.mjs': '// @id CODE-A-001 @implements REQ-A-001\nexport const a = () => { throw new Error("not implemented"); };\n' }, FAIL);
  assert.equal(sdd(d, 'approve', 'record', 'a', '--by', 'alice').code, 0);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001', '--allow-setup-red').code, 0);
  fs.writeFileSync(path.join(d, 'a.mjs'), '// @id CODE-A-001 @implements REQ-A-001\nexport const a = () => 1;\n');
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  assert.doesNotMatch(sdd(d, 'gate', '--no-run').out, /implementation changed since approval/);
  fs.appendFileSync(path.join(d, 'a.mjs'), 'export const b = 2;\n');
  assert.match(sdd(d, 'gate', '--no-run').out, /implementation changed since approval/);
});

test('#93 impact: same-feature REQs separated, TEST target shows impl files, Rust lib.rs/Java same-package/C .c impl', () => {
  const mk = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
    spawnSync('git', ['init', '-q'], { cwd: d });
    fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
    for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    return d;
  };
  const sp = (f, ...ids) => `---\nfeature: ${f}\ntier: T1\n---\n${ids.map((i) => `- ${i} x`).join('\n')}\n`;
  const js = mk({
    '.sdd/specs/a.md': sp('a', 'REQ-A-001', 'REQ-A-002'),
    'a.mjs': '// @id CODE-A-001 @implements REQ-A-001\nexport const a=1;\n// @id CODE-A-002 @implements REQ-A-002\nexport const b=2;\n',
    'a.test.mjs': '// @id TEST-A-001 @verifies REQ-A-001\nimport {a} from "./a.mjs";\n',
  });
  const r = sdd(js, 'impact', 'REQ-A-001').out;
  assert.match(r, /same feature: 1 other REQ/);
  assert.doesNotMatch(r, /other feature/);
  const t = sdd(js, 'impact', 'TEST-A-001').out;
  assert.match(t, /impl: a\.mjs/);
  assert.doesNotMatch(t, /impl: .*test/);

  const rs = mk({
    '.sdd/specs/a.md': sp('a', 'REQ-A-001'), '.sdd/specs/b.md': sp('b', 'REQ-B-001'),
    'Cargo.toml': '[package]\nname = "m"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/lib.rs': 'pub mod a;\npub mod b;\n',
    'src/a.rs': '// @id CODE-A-001 @implements REQ-A-001\npub fn fa() {}\n',
    'src/b.rs': '// @id CODE-B-001 @implements REQ-B-001\npub fn fb() {}\n',
    'tests/b.rs': '// @id TEST-B-001 @verifies REQ-B-001\nuse m::b::fb;\n',
  });
  assert.doesNotMatch(sdd(rs, 'impact', 'REQ-A-001').out, /REQ-B-001/);

  const jv = mk({
    '.sdd/specs/a.md': sp('a', 'REQ-A-001'), '.sdd/specs/b.md': sp('b', 'REQ-B-001'),
    'src/main/java/p/Money.java': 'package p;\n// @id CODE-A-001 @implements REQ-A-001\npublic class Money {}\n',
    'src/test/java/p/RateTest.java': 'package p;\n// @id TEST-B-001 @verifies REQ-B-001\nclass RateTest { Money m; }\n',
  });
  assert.match(sdd(jv, 'impact', 'REQ-A-001').out, /other feature REQ-B-001/);

  const c = mk({
    '.sdd/specs/a.md': sp('a', 'REQ-A-001'), '.sdd/specs/b.md': sp('b', 'REQ-B-001'),
    'include/arena.h': 'int arena_x(void);\n',
    'src/arena.c': '#include "arena.h"\n// @id CODE-A-001 @implements REQ-A-001\nint arena_x(void){return 1;}\n',
    'tests/t.c': '#include "arena.h"\n// @id TEST-B-001 @verifies REQ-B-001\nint main(void){return 0;}\n',
  });
  assert.match(sdd(c, 'impact', 'REQ-A-001').out, /other feature REQ-B-001/);
});

test('#94 Go: no methods on any receivers; Red is classified by the test package, not ./...', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('go.mod', 'module ex.com/m\n\ngo 1.21\n');
  w('.sdd/specs/a.md', '---\nfeature: a\ntier: T1\n---\n- REQ-A-001 x\n- REQ-B-001 y\n');
  w('bad/bad.go', 'package bad\nfunc Broken() int { return "x" }\n');
  w('ok/ok.go', 'package ok\n// @id CODE-A-001 @implements REQ-A-001\nfunc Two() int { panic("not implemented: Two") }\n');
  w('ok/ok_test.go', 'package ok\nimport "testing"\n// @id TEST-A-001 @verifies REQ-A-001\nfunc TestTEST_A_001_two(t *testing.T) { if Two() != 2 { t.Fatalf("want 2, got %d", Two()) } }\n');
  sdd(d, 'init');
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--allow-setup-red');
  assert.equal(r.code, 0, r.out);

  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d2 });
  fs.mkdirSync(path.join(d2, '.sdd/specs'), { recursive: true });
  fs.writeFileSync(path.join(d2, 'go.mod'), 'module ex.com/m\n\ngo 1.21\n');
  fs.writeFileSync(path.join(d2, '.sdd/specs/a.md'), '---\nfeature: a\ntier: T1\n---\n- REQ-A-001 x\n');
  fs.mkdirSync(path.join(d2, 'tx'));
  fs.writeFileSync(path.join(d2, 'tx/tx_test.go'), 'package tx\nimport "testing"\n// @id TEST-A-001 @verifies REQ-A-001\nfunc TestTEST_A_001_put(t *testing.T) {\n\ttx := Begin(1)\n\ttx.Put("k", 1)\n}\n');
  sdd(d2, 'init');
  sdd(d2, 'tdd', 'stub', 'TEST-A-001');
  const stub = fs.readdirSync(path.join(d2, 'tx')).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go')).map((f) => fs.readFileSync(path.join(d2, 'tx', f), 'utf8')).join('\n');
  assert.doesNotMatch(stub, /\(\*any\)/);
  assert.equal(spawnSync('go', ['vet', './...'], { cwd: d2 }).status, 0, stub);
});

test('#95 PHP stub: existing/builtin classes are not redeclared, exception classes extend Exception; redeclare is a load error', { skip: spawnSync('which', ['php']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('.sdd/specs/c.md', '---\nfeature: c\ntier: T1\n---\n- REQ-C-001 x\n');
  w('src/Money.php', '<?php\nclass Money { public static function yen($n) { return new Money(); } }\n');
  w('CartTest.php', "<?php\nrequire __DIR__ . '/src/Money.php';\nrequire __DIR__ . '/src/Cart.php';\n// @id TEST-C-001 @verifies REQ-C-001\nfunction test_c_001() { $c = new Cart(); Money::yen(1); $d = new DateTimeImmutable('now'); expectException(CartException::class); }\n");
  sdd(d, 'init');
  const r = sdd(d, 'tdd', 'stub', 'TEST-C-001');
  assert.equal(r.code, 0, r.out);
  const cart = fs.readFileSync(path.join(d, 'src/Cart.php'), 'utf8');
  assert.match(cart, /class Cart\b/);
  assert.doesNotMatch(cart, /class Money|function DateTimeImmutable|class DateTimeImmutable/);
  assert.doesNotMatch(cart, /function DateTimeImmutable/);
  assert.equal(spawnSync('php', ['-l', path.join(d, 'src/Cart.php')]).status, 0);
});

test('#96 C stub: functions/types declared by existing headers are not redeclared', { skip: spawnSync('which', ['cc']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('.sdd/specs/c.md', '---\nfeature: c\ntier: T1\n---\n- REQ-C-001 x\n');
  w('include/base.h', '#pragma once\ntypedef struct base_t { int x; } base_t;\nint base_make(int a);\n');
  w('tests/t.c', '#include <assert.h>\n#include "base.h"\n#include "cart.h"\n/* @id TEST-C-001 @verifies REQ-C-001 */\nint main(void) { base_t b; (void)b; assert(base_make(1) == 1); assert(cart_total(2) == 2); return 0; }\n');
  fs.writeFileSync(path.join(d, 'include/base.c'), '');
  sdd(d, 'init');
  const r = sdd(d, 'tdd', 'stub', 'TEST-C-001');
  assert.equal(r.code, 0, r.out);
  const files = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '*cart.h'], { cwd: d, encoding: 'utf8' }).stdout.trim();
  const h = fs.readFileSync(path.join(d, files), 'utf8');
  assert.match(h, /cart_total/);
  assert.doesNotMatch(h, /base_make|base_t/);
});

test('#97 JS/Python class stubs get throwing methods for the methods the test calls', { skip: spawnSync('which', ['python3']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('.sdd/specs/b.md', '---\nfeature: b\ntier: T1\n---\n- REQ-B-001 x\n- REQ-B-002 y\n');
  w('b.test.mjs', "import test from 'node:test';\nimport { Book } from './book.mjs';\n// @id TEST-B-001 @verifies REQ-B-001\ntest('a', () => { const b = new Book(); b.add(1); });\n");
  w('test_p.py', "from idx import Index\n# @id TEST-B-002 @verifies REQ-B-002\ndef test_b_002():\n    i = Index()\n    i.add(1)\n    assert i.size() == 1\n");
  sdd(d, 'init');
  assert.equal(sdd(d, 'tdd', 'stub', 'TEST-B-001').code, 0);
  assert.match(fs.readFileSync(path.join(d, 'book.mjs'), 'utf8'), /add\(\.\.\._args\) \{[\s\S]*not implemented: Book\.add/);
  assert.equal(sdd(d, 'tdd', 'stub', 'TEST-B-002').code, 0);
  const py = fs.readFileSync(path.join(d, 'idx.py'), 'utf8');
  assert.match(py, /def add\(self/);
  assert.match(py, /def size\(self/);
  assert.equal(spawnSync('python3', ['-c', 'import ast,sys;ast.parse(open(sys.argv[1]).read())', path.join(d, 'idx.py')]).status, 0);
});

test('#98 pytest -k: a longer test name extending this id is excluded from the selection', { skip: spawnSync('python3', ['-m', 'pytest', '--version']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('.sdd/specs/t.md', '---\nfeature: t\ntier: T1\n---\n- REQ-T-007 a\n- REQ-T-0071 b\n');
  w('requirements.txt', '');
  w('mod.py', 'def f():\n    return 1\n');
  w('test_m.py', "from mod import f\n# @id TEST-T-007 @verifies REQ-T-007\ndef test_t_007():\n    assert f() == 1\n# @id TEST-T-0071 @verifies REQ-T-0071\ndef test_t_0071():\n    assert f() == 2\n");
  sdd(d, 'init');
  const r = sdd(d, 'tdd', 'red', 'TEST-T-007');
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /test passed/);
});

test('#99 approve record for a human spec is refused without a matching prepare; allowed after it', () => {
  const d = mini(T2SPEC, { 'a.test.mjs': jsTest() }, PASS);
  const r = sddRaw(d, 'approve', 'record', 'a', '--by', 'Alice');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /approve prepare a/);
  assert.equal(sddRaw(d, 'approve', 'prepare', 'a').code, 0);
  assert.equal(sddRaw(d, 'approve', 'record', 'a', '--by', 'Alice').code, 0);
});

test('#100 Green is accepted after reverting a wrong test edit back to an earlier Red content', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  const tp = path.join(d, 'a.test.mjs');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  fs.writeFileSync(tp, jsTest().replace('assert.ok(1)', 'assert.ok(2)'));
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  fs.writeFileSync(tp, jsTest());
  setCmd(d, PASS);
  const r = sdd(d, 'tdd', 'green', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
});

test('#102 trace +N more, invalid lowercase id suffix, test CRLF does not stale evidence, ＜test-only＞ marker', () => {
  // test CRLF conversion keeps Green
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  const tp = path.join(d, 'a.test.mjs');
  fs.writeFileSync(tp, fs.readFileSync(tp, 'utf8').replace(/\n/g, '\r\n'));
  assert.match(sdd(d, 'gate', '--no-run').out, /tdd evidence[^\n]*1\/1 tests Red→Green/);
  // lowercase suffix
  fs.writeFileSync(path.join(d, 'x.mjs'), '/** @id CODE-A-001b @implements REQ-A-001 */\nexport const x = 1;\n');
  assert.match(sdd(d, 'trace').out, /invalid @id CODE-A-001b/);
  // fullwidth angle brackets
  const e = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. ＜test-only＞ | TEST-A-001 |\n', { 'a.test.mjs': jsTest() }, PASS);
  assert.doesNotMatch(sdd(e, 'trace').out, /REQ-A-001 has no @implements/);
});

test('#103 Java/Rust stubs generate instance methods called on constructed objects', { skip: ['cargo', 'mvn'].some((c) => spawnSync('which', [c]).status !== 0) }, () => {
  // Rust
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-rsi-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'));
  fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | x | TEST-S-001 |\n');
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname = "lp"\nversion = "0.1.0"\nedition = "2021"\n');
  fs.writeFileSync(path.join(d, 'tests/t.rs'), 'use lp::Account;\n\n// @id TEST-S-001 @verifies REQ-S-001\n#[test]\nfn test_s_001() {\n    let mut a = Account::new(5);\n    a.deposit(3);\n    assert_eq!(a.balance(), 8);\n}\n');
  sdd(d, 'init');
  assert.equal(sdd(d, 'tdd', 'stub', 'TEST-S-001').code, 0);
  const lib = fs.readFileSync(path.join(d, 'src/lib.rs'), 'utf8');
  assert.match(lib, /pub fn new/);
  assert.match(lib, /pub fn balance\(&self/);
  assert.match(lib, /pub fn deposit<A0>\(&mut self/);
  const r = sdd(d, 'tdd', 'red', 'TEST-S-001');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /not implemented: Account::balance|not implemented: Account::deposit/);
  // Java
  const j = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-jvi-'));
  spawnSync('git', ['init', '-q'], { cwd: j });
  fs.mkdirSync(path.join(j, '.sdd/specs'), { recursive: true });
  fs.mkdirSync(path.join(j, 'src/test/java'), { recursive: true });
  fs.writeFileSync(path.join(j, '.sdd/specs/s.md'), '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | x | TEST-S-001 |\n');
  fs.writeFileSync(path.join(j, 'pom.xml'), '<project/>');
  fs.writeFileSync(path.join(j, 'src/test/java/AccTest.java'), 'import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\nclass AccTest {\n  // @id TEST-S-001 @verifies REQ-S-001\n  @Test void test_s_001() {\n    Account a = new Account(5);\n    a.deposit(3);\n    assertEquals(8, a.balance());\n  }\n}\n');
  sdd(j, 'init');
  assert.equal(sdd(j, 'tdd', 'stub', 'TEST-S-001').code, 0);
  const jv = fs.readFileSync(path.join(j, 'src/main/java/Account.java'), 'utf8');
  assert.match(jv, /public int balance\(\)/);
  assert.match(jv, /public \w+ deposit\(Object a0\)/);
});

test('#104 gate --changed warns when changed files are imported by another feature', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest(), 'a.mjs': '/** @id CODE-A-001 @implements REQ-A-001 */\nexport const a = 1;\n' }, PASS);
  fs.writeFileSync(path.join(d, '.sdd/specs/b.md'), '---\nfeature: b\ntier: T1\n---\n| REQ-B-001 | x | TEST-B-001 |\n');
  fs.writeFileSync(path.join(d, 'b.mjs'), "import { a } from './a.mjs';\n/** @id CODE-B-001 @implements REQ-B-001 */\nexport const b = a + 1;\n");
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d });
  fs.appendFileSync(path.join(d, 'a.mjs'), '// edit\n');
  const r = sdd(d, 'gate', '--changed', '--no-run');
  assert.match(r.out, /imported by other feature\(s\): b \(REQ-B-001\)/);
});

test('#105 Go impact: an import reaches only the files declaring the used symbols', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-goi-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('go.mod', 'module m\n\ngo 1.21\n');
  w('.sdd/specs/a.md', '---\nfeature: a\ntier: T1\n---\n- REQ-A-001 x\n');
  w('.sdd/specs/b.md', '---\nfeature: b\ntier: T1\n---\n- REQ-B-001 x\n');
  w('util/a.go', 'package util\n\n// @id CODE-A-001 @implements REQ-A-001\nfunc Alpha() int { return 1 }\n');
  w('util/b.go', 'package util\n\n// @id CODE-A-002 @implements REQ-A-001\nfunc Beta() int { return 2 }\n');
  w('app/main.go', 'package main\n\nimport "m/util"\n\n// @id CODE-B-001 @implements REQ-B-001\nfunc Run() int { return util.Beta() }\n');
  sdd(d, 'init');
  const viaA = JSON.parse(sdd(d, 'impact', 'util/a.go', '--json').out);
  const viaB = JSON.parse(sdd(d, 'impact', 'util/b.go', '--json').out);
  assert.ok(!viaA.reachedFiles.includes('app/main.go'), 'Alpha is not used by main.go');
  assert.ok(viaB.reachedFiles.includes('app/main.go'));
});

test('#106 weak Red: a setup call inside a helper is weak; `.unwrap()` act before the assertions is not', () => {
  const mk = (src) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-js-'));
    fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), '{}');
    spawnSync('git', ['init', '-q'], { cwd: d });
    fs.writeFileSync(path.join(d, '.sdd/specs/a.md'), T1SPEC);
    fs.writeFileSync(path.join(d, 'a.test.mjs'), src);
    fs.writeFileSync(path.join(d, 'lib.mjs'), "export function make() { throw new Error('not implemented: make'); }\nexport function step() { throw new Error('not implemented: step'); }\n");
    sdd(d, 'init');
    setCmd(d, ['node', '-e', "const e=new Error('not implemented: '+process.env.W);e.stack='Error: '+e.message+'\\n    at x (a.test.mjs:'+process.env.L+':1)';console.log(e.stack);process.exit(1)"]);
    return d;
  };
  // helper case: stub thrown in make() (defined outside the test), the test only calls make() then asserts on other state
  const helperSrc = "import assert from 'node:assert';\nimport { make, step } from './lib.mjs';\nfunction setup() {\n  return make();\n}\n// @id TEST-A-001 @verifies REQ-A-001\ntest('TEST-A-001', () => {\n  const s = setup();\n  assert.equal(1, 2);\n});\n";
  const d1 = mk(helperSrc);
  const r1 = spawnSync('node', [SDD, '--root', d1, 'tdd', 'red', 'TEST-A-001'], { encoding: 'utf8', env: { ...ENV, W: 'make', L: '4' } });
  assert.match(r1.stdout, /setup call|weak/i, r1.stdout);
  // act case: `step()` followed by unwrap-like last statement then the assertions
  const actSrc = "import assert from 'node:assert';\nimport { step } from './lib.mjs';\n// @id TEST-A-001 @verifies REQ-A-001\ntest('TEST-A-001', () => {\n  const t = {};\n  step(t).unwrap();\n  assert.equal(t.n, 1);\n});\n";
  const d2 = mk(actSrc);
  const r2 = spawnSync('node', [SDD, '--root', d2, 'tdd', 'red', 'TEST-A-001'], { encoding: 'utf8', env: { ...ENV, W: 'step', L: '6' } });
  assert.doesNotMatch(r2.stdout, /Red comes from setup/, r2.stdout);
});

test('#107 gate --changed lists every importing feature and also fires on a spec-only change', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest(), 'a.mjs': '/** @id CODE-A-001 @implements REQ-A-001 */\nexport const a = 1;\n' }, PASS);
  for (const f of ['b', 'c', 'd', 'e', 'f']) {
    const F = f.toUpperCase();
    fs.writeFileSync(path.join(d, `.sdd/specs/${f}.md`), `---\nfeature: ${f}\ntier: T1\n---\n| REQ-${F}-001 | x | TEST-${F}-001 |\n`);
    fs.writeFileSync(path.join(d, `${f}.mjs`), `import { a } from './a.mjs';\n/** @id CODE-${F}-001 @implements REQ-${F}-001 */\nexport const ${f} = a + 1;\n`);
  }
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d });
  fs.appendFileSync(path.join(d, 'a.mjs'), '// edit\n');
  assert.match(sdd(d, 'gate', '--changed', '--no-run').out, /other feature\(s\): b, c, d, e, f \(/);
  spawnSync('git', ['checkout', 'a.mjs'], { cwd: d });
  fs.appendFileSync(path.join(d, '.sdd/specs/a.md'), '\n');
  assert.match(sdd(d, 'gate', '--changed', '--no-run').out, /other feature\(s\): b, c, d, e, f \(/);
});

test('#108 a lone CR in the frontmatter does not downgrade approval: human', () => {
  const d = mini(T1SPEC.replace('tier: T1', 'tier: T1\napproval: human'), {}, PASS);
  const p = path.join(d, '.sdd/specs/a.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('approval: human', 'approval: human # c\r').replace(/\n/g, '\r\n'));
  assert.match(sddRaw(d, 'approve', 'prepare', 'a').out, /approval: human/);
});

test('#109 concurrent ledger appends keep the hash chain intact', async () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
  const S = fileURLToPath(new URL('./sdd.mjs', import.meta.url));
  const one = () => new Promise((res) => { const p = spawn(process.execPath, [S, '--root', d, 'tdd', 'red', 'TEST-A-001', '--weak'], { stdio: 'ignore' }); p.on('close', res); });
  await Promise.all(Array.from({ length: 8 }, one));
  const r = sddRaw(d, 'tdd', 'check');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n').length >= 2);
});

test('#110 weak Red: an assigned (tuple / :=) result that is asserted, or a match scrutinee, is the act', () => {
  const run = (body, line) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-w110-'));
    fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), '{}');
    spawnSync('git', ['init', '-q'], { cwd: d });
    fs.writeFileSync(path.join(d, '.sdd/specs/a.md'), T1SPEC);
    fs.writeFileSync(path.join(d, 'a.test.mjs'), `// @id TEST-A-001 @verifies REQ-A-001\n${body}\n`);
    sdd(d, 'init');
    setCmd(d, ['node', '-e', "const e=new Error('not implemented: '+process.env.W);e.stack='Error: '+e.message+'\\n    at x (a.test.mjs:'+process.env.L+':1)';console.log(e.stack);process.exit(1)"]);
    return spawnSync('node', [SDD, '--root', d, 'tdd', 'red', 'TEST-A-001'], { encoding: 'utf8', env: { ...ENV, W: 'step', L: String(line) } }).stdout;
  };
  assert.doesNotMatch(run('recs, rej = step(t)\nassert recs == 1', 2), /Red comes from setup/);
  assert.doesNotMatch(run('e := step(t)\nif len(e) != 1 {', 2), /Red comes from setup/);
  assert.doesNotMatch(run('match step(1).unwrap() {\n  Ok(x) => {}\n}\nassert_eq!(1, 2);', 2), /Red comes from setup/);
  assert.match(run('s = step(t)\nassert 1 == 2', 2), /Red comes from setup/);
});

test('#111 impact: python relative imports, PHP use, TS type-only edges, header owner, capped header', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-i111-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const f of ['a', 'b', 'c', 'e', 'k']) w(`.sdd/specs/${f}.md`, `---\nfeature: ${f}\ntier: T1\n---\n- REQ-${f.toUpperCase()}-001 x\n`);
  w('pkg/__init__.py', '');
  w('pkg/a.py', '# @id CODE-A-001 @implements REQ-A-001\nX = 1\n');
  w('pkg/b.py', 'from . import a\n# @id CODE-B-001 @implements REQ-B-001\nY = a.X\n');
  w('src/Core/A.php', '<?php\nnamespace P\\Core;\n// @id CODE-C-001 @implements REQ-C-001\nclass Money {}\n');
  w('src/Pay/B.php', '<?php\nnamespace P\\Pay;\nuse P\\Core\\Money;\n// @id CODE-E-001 @implements REQ-E-001\nclass Pay { function f() { return new Money(); } }\n');
  w('t/x.ts', '// @id CODE-K-001 @implements REQ-K-001\nexport type T = number;\nexport const v = 1;\n');
  w('t/y.ts', "import type { T } from './x';\nimport { type T as U } from './x';\nexport const z = 1;\n");
  sdd(d, 'init');
  assert.ok(JSON.parse(sdd(d, 'impact', 'pkg/a.py', '--json').out).reachedFiles.includes('pkg/b.py'));
  assert.ok(JSON.parse(sdd(d, 'impact', 'src/Core/A.php', '--json').out).reachedFiles.includes('src/Pay/B.php'));
  assert.ok(!JSON.parse(sdd(d, 'impact', 't/x.ts', '--json').out).reachedFiles.includes('t/y.ts'));
  const txt = sdd(d, 'impact', 'pkg/a.py').out;
  assert.match(txt, /other features: b \(1\)/);
  assert.match(txt, /pkg\/b\.py ← pkg\/a\.py/);
});

test('#112 stub: existing JS module gets missing exports/methods; helper-built objects; py constants and submodules', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-s112-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('package.json', '{}');
  w('.sdd/specs/a.md', T1SPEC);
  w('lib.mjs', 'export function old() { return 1; }\nexport class Box {\n  put() { return 1; }\n}\n');
  w('a.test.mjs', "import { old, fresh, GENESIS, Box } from './lib.mjs';\nfunction setup() { return { b: new Box() }; }\n// @id TEST-A-001 @verifies REQ-A-001\ntest('x', () => {\n  const { b } = setup();\n  b.reset();\n  assert(fresh() && GENESIS && old());\n});\n");
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const lib = fs.readFileSync(path.join(d, 'lib.mjs'), 'utf8');
  assert.match(lib, /export function old\(\) \{ return 1; \}/);
  assert.match(lib, /export function fresh\(\)/);
  assert.match(lib, /export const GENESIS = undefined/);
  assert.match(lib, /reset\(\.\.\._args\)[^]*not implemented: Box\.reset/);
  assert.equal((lib.match(/put\(\)/g) ?? []).length, 1);

  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-p112-'));
  const wp = (f, b) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: p });
  wp('.sdd/specs/a.md', T1SPEC);
  wp('pipe/__init__.py', '');
  wp('test_a.py', "from pipe import load, Journal, GENESIS\n\ndef setup():\n    return Journal(), 1\n\n# @id TEST-A-001 @verifies REQ-A-001\ndef test_x():\n    j, n = setup()\n    j.post(n)\n    load.write(1)\n    assert GENESIS\n");
  sdd(p, 'init');
  sdd(p, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(fs.readFileSync(path.join(p, 'pipe/load.py'), 'utf8').includes('def write'), true);
  const init = fs.readFileSync(path.join(p, 'pipe/__init__.py'), 'utf8');
  assert.doesNotMatch(init, /def load/);
  assert.match(init, /GENESIS = None/);
  assert.match(init, /def post\(self/);
});

test('#114/#115/#116 Rust Result + message, Java JDK wildcard/chained args/long, C unused params, Maven -am, plan equal order', { skip: ['cargo', 'mvn', 'gcc'].some((c) => spawnSync('which', [c]).status !== 0) }, () => {
  const proj = (name, spec) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), name)); spawnSync('git', ['init', '-q'], { cwd: d }); fs.mkdirSync(path.join(d, '.sdd/specs'), { recursive: true }); fs.writeFileSync(path.join(d, '.sdd/specs/s.md'), spec ?? '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | x | TEST-S-001 |\n'); return d; };
  const w = (d, f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  const r = proj('sdd-rs114-');
  w(r, 'Cargo.toml', '[package]\nname = "lp"\nversion = "0.1.0"\nedition = "2021"\n');
  w(r, 'tests/t.rs', 'use lp::{parse, Acc};\n\n// @id TEST-S-001 @verifies REQ-S-001\n#[test]\nfn test_s_001() {\n    let mut a = Acc::new(1);\n    a.add(2);\n    let v = parse("x").unwrap();\n    assert_eq!(v, 3);\n}\n');
  sdd(r, 'init');
  sdd(r, 'tdd', 'stub', 'TEST-S-001');
  const lib = fs.readFileSync(path.join(r, 'src/lib.rs'), 'utf8');
  assert.match(lib, /pub fn parse<A0>\(_a0: A0\) -> Result<i64, String>/);
  assert.match(lib, /pub fn add<A0>\(&mut self/);
  assert.match(lib, /unimplemented!\("Acc::add"\)/);
  const red = sdd(r, 'tdd', 'red', 'TEST-S-001');
  assert.doesNotMatch(red.out, /setup call "not"/);

  const c = proj('sdd-c116-');
  w(c, 'Makefile', 'test:\n\ttrue\n');
  w(c, 'test_t.c', '#include <assert.h>\n#include "c.h"\n// @id TEST-S-001 @verifies REQ-S-001\nint main(void) { assert(foo(1, 2) == 3); return 0; }\n');
  sdd(c, 'init');
  setCmd(c, ['gcc', '-Wall', '-Wextra', '-Werror', '-o', '/dev/null', 'test_t.c']);
  sdd(c, 'tdd', 'stub', 'TEST-S-001');
  const ch = fs.readdirSync(c).filter((f) => /\.h$/.test(f)).map((f) => fs.readFileSync(path.join(c, f), 'utf8')).join('');
  assert.match(ch, /\(void\)a0;\s*\(void\)a1;/);

  const j = proj('sdd-j115-');
  w(j, 'pom.xml', '<project/>');
  w(j, 'src/test/java/AccTest.java', 'import java.util.concurrent.*;\nimport org.junit.jupiter.api.Test;\nclass AccTest {\n  // @id TEST-S-001 @verifies REQ-S-001\n  @Test void test_s_001() {\n    ExecutorService e = Executors.newFixedThreadPool(8);\n    Money m = new Money(250L, "USD").times(3);\n  }\n}\n');
  sdd(j, 'init');
  sdd(j, 'tdd', 'stub', 'TEST-S-001');
  assert.ok(!fs.existsSync(path.join(j, 'src/main/java/Executors.java')));
  const mj = fs.readFileSync(path.join(j, 'src/main/java/Money.java'), 'utf8');
  assert.match(mj, /public Money\(long a0, String a1\)/);
  assert.match(mj, /times\(Object a0\)/);
  assert.match(fs.readFileSync(path.join(j, '.sdd/config.json'), 'utf8'), /"-am"/);

  const p = proj('sdd-p115-');
  w(p, '.sdd/plan.md', '| order | feature | depends |\n|---|---|---|\n| 5 | shipping | |\n| 5 | tracking | shipping |\n');
  assert.match(sdd(p, 'plan').out, /same order number/);
});

test('#113 Go stubs: external test package, chained New().M, slice results, field vs method', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-go113-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('go.mod', 'module m\n\ngo 1.21\n');
  w('.sdd/specs/s.md', '---\nfeature: s\ntier: T1\n---\n| REQ-S-001 | x | TEST-S-001 |\n| REQ-S-002 | y | TEST-S-002 |\n');
  w('core/log_test.go', 'package core_test\n\nimport (\n\t"testing"\n\n\t"m/core"\n)\n\n// @id TEST-S-001 @verifies REQ-S-001\nfunc TestS001(t *testing.T) {\n\tl := core.NewLog()\n\tl.Append(1)\n\tvar e core.Entry\n\t_ = e\n\tif core.Max != 0 {\n\t\tt.Fatal("x")\n\t}\n}\n');
  w('aud/aud_test.go', 'package aud\n\nimport "testing"\n\n// @id TEST-S-002 @verifies REQ-S-002\nfunc TestS002(t *testing.T) {\n\tif _, err := New().Record(1, ""); err != nil {\n\t\tt.Fatal(err)\n\t}\n}\n');
  sdd(d, 'init');
  sdd(d, 'tdd', 'stub', 'TEST-S-001');
  const core = fs.readdirSync(path.join(d, 'core')).filter((f) => !/_test/.test(f)).map((f) => fs.readFileSync(path.join(d, 'core', f), 'utf8')).join('');
  assert.match(core, /package core/);
  assert.match(core, /func NewLog\(\) \*Log/);
  assert.match(core, /type Entry /);
  assert.match(core, /func \(\*Log\) Append\(/);
  assert.match(core, /const Max = 0/);
  assert.equal(spawnSync('go', ['vet', './core/'], { cwd: d }).status, 0);
  sdd(d, 'tdd', 'stub', 'TEST-S-002');
  const aud = fs.readdirSync(path.join(d, 'aud')).filter((f) => !/_test/.test(f)).map((f) => fs.readFileSync(path.join(d, 'aud', f), 'utf8')).join('');
  assert.match(aud, /func New\(\) \*Aud\b/);
  assert.match(aud, /\) Record\(.*\) \(?\w*,? ?error\)?/);
});

test('#117 PHP: `use Ns\\Cls` stubs a namespaced PSR-4 file; --missing-module accepts Class not found', { skip: spawnSync('which', ['php']).status !== 0 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-php117-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  w('composer.json', '{"autoload":{"psr-4":{"Payroll\\\\":"src/"}}}');
  w('.sdd/specs/s.md', T1SPEC.replace('REQ-A-001', 'REQ-S-001').replace('TEST-A-001', 'TEST-S-001').replace('feature: a', 'feature: s'));
  w('tests/CoreTest.php', "<?php\nuse Payroll\\Core\\Money;\n// @id TEST-S-001 @verifies REQ-S-001\nfinal class CoreTest { function test_s_001() { assert(Money::of(1) === 1); } }\n");
  sdd(d, 'init');
  const out = sdd(d, 'tdd', 'stub', 'TEST-S-001').out;
  assert.match(out, /src\/Core\/Money\.php/);
  const f = fs.readFileSync(path.join(d, 'src/Core/Money.php'), 'utf8');
  assert.match(f, /namespace Payroll\\Core;/);
  assert.match(f, /class Money/);
  assert.match(f, /static function of/);
  fs.rmSync(path.join(d, 'src'), { recursive: true });
  setCmd(d, ['node', '-e', "console.log('Error: Class \"Payroll\\\\Core\\\\Money\" not found');process.exit(1)"]);
  const r = sdd(d, 'tdd', 'red', 'TEST-S-001', '--missing-module');
  assert.doesNotMatch(r.out, /REJECTED/, r.out);
});

test('#118 tdd refactor warns when the test body changed since Green', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'x');
  sdd(d, 'tdd', 'green', 'TEST-A-001');
  const f = path.join(d, 'a.test.mjs');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\)\s*;?\s*\}\);?\s*$/, ') ; void 0; });\n'));
  const r = sdd(d, 'tdd', 'refactor', 'TEST-A-001');
  assert.match(r.out, /test body changed since the last Green/, r.out);
});

test('#119 Node file-level pass with no ID match is rejected for red --characterization and green', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n// @id TEST-A-001 @verifies REQ-A-001\ntest('no id in title', () => { assert.equal(1, 2); });\n" });
  setCmd(d, ['node', '--test', '--test-name-pattern', '{id}', '{file}']);
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'x');
  assert.match(r.out, /REJECTED/, r.out);
  assert.match(r.out, /no test matched/, r.out);
});

test('#120 approve record strips zero-width chars before generic-name check', () => {
  const d = mini('---\nfeature: a\ntier: T2\napproval: human\n---\n## Design\nx\ny\n\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n', { 'a.test.mjs': jsTest() });
  sddRaw(d, 'approve', 'prepare', 'a');
  const r = sddRaw(d, 'approve', 'record', 'a', '--by', 'ai\u200b');
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /REFUSED/);
});

test('#121 stale/missing lock hint is approval-specific', () => {
  const d = mini('---\nfeature: a\ntier: T2\n---\n## Design\nx\ny\n\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n', { 'a.test.mjs': jsTest() }, PASS);
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.match(r.out, /approve record a --by ai:<reviewer>/, r.out);
  assert.doesNotMatch(r.out, /run: approve prepare/);
});

test('#122 T1 record is not claimed as locked; deleted review file makes AI lock stale', () => {
  const t1 = mini(T1SPEC, { 'a.test.mjs': jsTest() });
  assert.match(sdd(t1, 'approve', 'record', 'a', '--by', 'ai:rev', '--review', 'ok').out, /NOT lock-enforced/);
  const d = mini('---\nfeature: a\ntier: T2\n---\n## Design\nx\ny\n\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n', { 'a.test.mjs': jsTest() }, PASS);
  const tpl = sddRaw(d, 'review', 'template', 'a').out;
  fs.writeFileSync(path.join(d, '.sdd/review.md'), tpl.replace(/^[^\n]*\n(?=---)/, ''));
  const rec = sddRaw(d, 'approve', 'record', 'a', '--by', 'ai:rev', '--review', '.sdd/review.md');
  if (/^locked/m.test(rec.out)) {
    fs.rmSync(path.join(d, '.sdd/review.md'));
    assert.match(sddRaw(d, 'status').out + sddRaw(d, 'gate', '--no-run').out, /stale/);
  }
});

test('#123 pytest collection error is a load error (Red rejected)', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() });
  setCmd(d, ['node', '-e', "console.log('ERROR collecting t.py\\nAttributeError: x\\nInterrupted: 1 error during collection');process.exit(2)"]);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*load\/compile/);
});

test('#123 Julia top-level LoadError is a load error; sibling-only failure rejected', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() });
  setCmd(d, ['node', '-e', "console.log('ERROR: LoadError: not implemented: f');process.exit(1)"]);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*load\/compile/);
  setCmd(d, ['node', '-e', "console.log('Test Summary: | Pass  Fail  Total\\n  TEST-A-001  |    1     0      1\\n  TEST-A-002  |    0     1      1\\nERROR: LoadError: Some tests did not pass');process.exit(1)"]);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001').out, /REJECTED.*itself passes/);
});

test('#126 tdd arg validation: no ID is a usage error; multiple IDs all processed', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  const r = sdd(d, 'tdd', 'green');
  assert.equal(r.code, 2);
  assert.match(r.out, /usage/);
  assert.doesNotMatch(r.out, /undefined/);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization').code, 2);
  const b = sdd(d, 'tdd', 'red', 'TEST-A-001', 'TEST-A-001', '--characterization', 'x');
  assert.equal((b.out.match(/RED ok/g) ?? []).length, 2, b.out);
});

test('#134 tdd red --retest records a weak Red after the test changed', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001', '--retest', 'x').out, /REFUSED.*previous/);
  sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'x');
  assert.match(sdd(d, 'tdd', 'red', 'TEST-A-001', '--retest', 'x').out, /REFUSED.*unchanged/);
  const f = path.join(d, 'a.test.mjs');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('assert.ok(1)', 'assert.ok(2)'));
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001', '--retest').code, 2);
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--retest', 'expectation was wrong');
  assert.match(r.out, /RED ok.*\[weak\]/, r.out);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
});

const fakeRun = (d, shellScript) => fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', shellScript, 'x'] }));
const testFile = (d, body) => fs.writeFileSync(path.join(d, 'add.test.mjs'), [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { add } from './add.mjs';",
  '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
  "test('TEST-CALC-001 adds', () => {",
  ...body,
  '});',
  '',
].join('\n'));

test('#124 a bare act statement whose side effect is asserted is not a weak Red', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
  testFile(d, ['  globalThis.n = 0;', '  add(1, 2);', '  assert.equal(globalThis.n, 3);']);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /\[weak\]/, r.out);
});

test('#124 .NET NotImplementedException without a member name is attributed via the stack frame (weak Red from setup)', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  testFile(d, ['  const o = TransitionTo(1);', '  assert.equal(other(), 3);']);
  fakeRun(d, `printf '%s\\n' "System.NotImplementedException : The method or operation is not implemented." "   at Pricing.Order.TransitionTo(Int32 s) in /x/Order.cs:line 3" "   at Pricing.Tests.OrderTests.It() in /x/add.test.mjs:line 6"; exit 1`);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.match(r.out, /\[weak\].*setup call "TransitionTo"/, r.out);
});

test('#124 gate lists weak Red IDs with an actionable hint', () => {
  const d = project();
  sdd(d, 'init');
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
  testFile(d, ['  const seed = add(0, 0);', '  assert.equal(add(1, 2), 3 + seed);']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);
  impl(d, '(a, b) => a + b');
  testFile(d, ['  const seed = add(0, 0);', '  assert.equal(add(1, 2), 3 + seed);']);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  const g = sdd(d, 'gate', '--no-run').out;
  assert.match(g, /1 weak Red.*after Green.*TEST-CALC-001/s, g);
});

test('#125 failure reason shows the assertion (ctest, xUnit, Julia), not summary/stack noise', () => {
  const cases = [
    ['1 - test_s_001 (Failed)\\nk.c:9 CHECK failed: s_add(1, 2) == 3', /fails with: .*CHECK failed: s_add/],
    ['  Assert.Equal() Failure\\n  Expected: 1\\n  Actual:   2', /fails with: Assert\.Equal\(\) Failure/],
    ['System.ArgumentException : weights must sum to 1', /fails with: System\.ArgumentException : weights/],
    ['Test Failed at /x/t.jl:3\\n  Expression: f(1) == 2\\nStacktrace:\\n [1] top-level scope', /fails with: Expression: f\(1\) == 2/],
  ];
  for (const [txt, re] of cases) {
    const d = project();
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    fakeRun(d, `printf '${txt}\\n'; exit 1`);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.match(r.out, re, r.out);
  }
});

test('#125 rejected Green shows the assertion before Maven boilerplate', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const noise = Array.from({ length: 14 }, (_, i) => `[INFO] reactor line ${i}`).join('\\n');
  fakeRun(d, `printf '[ERROR]   MoneyTest.sum:12 expected: <3> but was: <2>\\n${noise}\\n[ERROR] Please refer to surefire\\n'; exit 1`);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak').code, 0);
  const r = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.match(r.out, /GREEN REJECTED/);
  assert.match(r.out, /expected: <3> but was: <2>/, r.out);
});

test('#132 .slnx is detected as .NET; test-less csproj libraries do not become projects', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.writeFileSync(path.join(d, 'R.slnx'), '<Solution />');
  const r = sddRaw(d, 'init');
  assert.doesNotMatch(r.out, /WARNING: stack not recognised/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8')).testCmd.slice(0, 2), ['dotnet', 'test']);

  const m = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: m });
  fs.mkdirSync(path.join(m, 'src/Lib'), { recursive: true });
  fs.mkdirSync(path.join(m, 'tests/T'), { recursive: true });
  fs.writeFileSync(path.join(m, 'src/Lib/Lib.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>');
  fs.writeFileSync(path.join(m, 'tests/T/T.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" /></ItemGroup></Project>');
  const o = sddRaw(m, 'init');
  const cfg = JSON.parse(fs.readFileSync(path.join(m, '.sdd/config.json'), 'utf8'));
  assert.deepEqual((cfg.projects ?? []).map((p) => p.root), ['tests/T']);
  assert.doesNotMatch(o.out, /testCmd: node/);
});

test('#132 Julia default check falls back to test/runtests.jl with an INFRA message when Pkg.test cannot resolve offline', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  fs.writeFileSync(path.join(d, 'Project.toml'), 'name = "X"\n');
  fs.mkdirSync(path.join(d, 'test'));
  fs.writeFileSync(path.join(d, 'test/runtests.jl'), '');
  sddRaw(d, 'init');
  const check = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8')).checks[0].cmd;
  const bin = path.join(d, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'julia'), '#!/bin/sh\nif [ "$2" = "-e" ]; then echo "ERROR: expected package `Test` to be registered"; exit 1; fi\necho ran-runtests "$@"\n', { mode: 0o755 });
  const r = spawnSync(check[0], check.slice(1), { cwd: d, encoding: 'utf8', env: { ...ENV, PATH: `${bin}:${ENV.PATH}` } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /INFRA.*falling back/);
  assert.match(r.stdout, /ran-runtests --project=\. test\/runtests\.jl/);
});

function tree(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
  return d;
}
const reached = (d, target) => JSON.parse(sddRaw(d, 'impact', target, '--json').out).reachedFiles;

test('#127 impact: unannotated file owned by its directory feature is not "other feature"; test file is labelled test', () => {
  const d = project();
  impl(d, '(a, b) => a + b');
  fs.writeFileSync(path.join(d, 'util.mjs'), 'export const u = 1;\n');
  fs.writeFileSync(path.join(d, 'add.mjs'), fs.readFileSync(path.join(d, 'add.mjs'), 'utf8') + "import { u } from './util.mjs';\nexport const w = u;\n");
  const r = sddRaw(d, 'impact', 'util.mjs');
  assert.doesNotMatch(r.out, /other feature/, r.out);
  const t = sddRaw(d, 'impact', 'add.test.mjs');
  assert.match(t.out, /^\s*test: add\.test\.mjs/m, t.out);
  assert.doesNotMatch(t.out, /impl: add\.test/);
});

test('#127 Rust `use alpha::x` resolves by Cargo package name, not against every crate', () => {
  const d = tree({
    'alpha/Cargo.toml': '[package]\nname = "alpha"\n', 'alpha/src/lib.rs': 'pub mod util;\n', 'alpha/src/util.rs': 'pub fn f() {}\n',
    'beta/Cargo.toml': '[package]\nname = "beta"\n', 'beta/src/lib.rs': 'use alpha::util;\npub fn g() { util::f() }\n',
    'delta/Cargo.toml': '[package]\nname = "delta"\n', 'delta/src/lib.rs': 'pub fn h() {}\n',
  });
  const r = reached(d, 'alpha/src/util.rs');
  assert.ok(r.includes('beta/src/lib.rs'), r.join());
  assert.ok(!r.includes('delta/src/lib.rs'), r.join());
});

test('#127 C includes: quoted relative to includer first, angle includes of project paths, tight .h/.c pairing', () => {
  const d = tree({
    'a/x.h': 'int a(void);\n', 'b/x.h': 'int b(void);\n', 'a/main.c': '#include "x.h"\n#include <stdio.h>\n',
    'include/kv/k.h': 'int k(void);\n', 'src/use.c': '#include <kv/k.h>\n',
    'p/dup.h': '', 'q/dup.c': '#include "dup.h"\n', 'r/dup.h': '', 's/dup.c': '',
  });
  assert.ok(reached(d, 'a/x.h').includes('a/main.c'));
  assert.ok(!reached(d, 'b/x.h').includes('a/main.c'));
  assert.ok(reached(d, 'include/kv/k.h').includes('src/use.c'));
  assert.ok(!reached(d, 'r/dup.h').includes('s/dup.c'), 'ambiguous basenames in different dirs are not paired');
});

test('#127 C# using/namespace and Julia include/using build an import graph', () => {
  const d = tree({
    'src/Lib/Calc.cs': 'namespace Lib;\npublic class Calc { }\n',
    'tests/T/CalcTests.cs': 'using Lib;\npublic class CalcTests { Calc c = new Calc(); }\n',
    'src/a.jl': 'module Ops\nf(x) = x\nend\n', 'test/t.jl': 'include("../src/a.jl")\nusing .Ops\n', 'src/b.jl': 'g(x) = x\n', 'test/u.jl': 'include("../src/b.jl")\n',
  });
  assert.ok(reached(d, 'src/Lib/Calc.cs').includes('tests/T/CalcTests.cs'));
  assert.ok(reached(d, 'src/a.jl').includes('test/t.jl'));
  assert.ok(reached(d, 'src/b.jl').includes('test/u.jl'));
});

test('#133 gate --changed scopes Go packages in a repo without commits', () => {
  const d = tree({ 'go.mod': 'module example.com/b\n\ngo 1.20\n', 'q/q.go': 'package q\n\nfunc Q() int { return 1 }\n', 'q/q_test.go': 'package q\n\nimport "testing"\n\nfunc TestQ(t *testing.T) { _ = Q() }\n' });
  sddRaw(d, 'init');
  const g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /scoped → go test example\.com\/b\/q/, g);
  assert.doesNotMatch(g, /cannot scope changes/);
});

test('#133 Maven scope includes dependents and their upstream modules (diamond), not just -am -amd', () => {
  const pom = (id, deps = [], mods = []) => `<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>${id}</artifactId><version>1</version>${mods.length ? `<packaging>pom</packaging><modules>${mods.map((m) => `<module>${m}</module>`).join('')}</modules>` : ''}<dependencies>${deps.map((x) => `<dependency><groupId>g</groupId><artifactId>${x}</artifactId><version>1</version></dependency>`).join('')}</dependencies></project>`;
  const d = tree({
    'pom.xml': pom('root', [], ['money', 'accounts', 'audit', 'journal']),
    'money/pom.xml': pom('money'), 'accounts/pom.xml': pom('accounts', ['money']), 'audit/pom.xml': pom('audit'),
    'journal/pom.xml': pom('journal', ['money', 'accounts', 'audit']),
    'accounts/src/main/java/A.java': 'class A {}\n',
  });
  sddRaw(d, 'init');
  const cfg = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  assert.ok(!cfg.checks[0].changedCmd.includes('-amd'));
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ ...cfg, checks: [{ name: 'test', cmd: ['sh', '-c', 'echo full'], changedCmd: ['echo', 'SCOPE', '{changedModulesCsv}'] }] }));
  const g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /SCOPE accounts,audit,journal,money/, g);
});

// ---- dogfood round 6 (#130 Rust/Java/C stubs, #131 PHP/C#/Julia/Python stubs) ----
const mk130 = (files) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-s130-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const [f, body] of Object.entries({ '.sdd/specs/a.md': T1SPEC, ...files })) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  return d;
};
const rd130 = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const has130 = (c) => spawnSync('which', [c]).status === 0;

test('#130 Rust: inline paths + struct literals are stubbed, only for the requested test, with an honest compile verdict', { skip: !has130('cargo') }, () => {
  const toml = '[package]\nname = "s130"\nversion = "0.1.0"\nedition = "2021"\n';
  const one = mk130({ 'Cargo.toml': toml, 'tests/t.rs': '// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn t10() {\n    let p = s130::geo::Point { x: 1, y: 2 };\n    assert_eq!(p.x, 1);\n}\n' });
  const out = sdd(one, 'tdd', 'stub', 'TEST-A-001').out;
  assert.match(out, /compile-checked/, out);
  assert.doesNotMatch(out, /Red-safe/);
  assert.match(rd130(one, 'src/geo.rs'), /pub struct Point \{\n    pub x: i64,\n    pub y: i64,/);
  assert.match(rd130(one, 'src/lib.rs'), /pub mod geo;/);
  const two = mk130({ 'Cargo.toml': toml, 'tests/t.rs': 'use s130::util::double;\n// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn t9() { assert_eq!(double(2), 4); }\n// @id TEST-A-002 @verifies REQ-A-001\n#[test]\nfn t10() {\n    let p = s130::geo::Point { x: 1, y: 2 };\n    assert_eq!(p.x, 1);\n}\n' });
  const o2 = sdd(two, 'tdd', 'stub', 'TEST-A-002').out;
  assert.ok(fs.existsSync(path.join(two, 'src/geo.rs')));
  assert.ok(!fs.existsSync(path.join(two, 'src/util.rs')), 'other tests symbols are not stubbed');
  assert.match(o2, /does not compile|could not fully stub/, 'an unverified/failed stub is never "Red-safe"');
});

test('#130 Java: typed factories, enum returns, overloads, exceptions and chained results compile', { skip: !has130('javac') }, () => {
  const d = mk130({ 'src/test/java/MoneyTest.java': [
    'public class MoneyTest {',
    '  static void assertEquals(Object a, Object b) {}',
    '  // @id TEST-A-001 @verifies REQ-A-001',
    '  static void t() {',
    '    Currency usd = Currency.of("USD");',
    '    int d = Currency.of("USD").digits();',
    '    Money a = Money.of(1, usd);',
    '    Money b = a.add(a);',
    '    Money z = Money.zero(usd);',
    '    Account acc = new Account("1000", "Cash", AccountType.ASSET, usd);',
    '    assertEquals(AccountType.ASSET, acc.type());',
    '    Chart c = new Chart();',
    '    String n = c.find("1000").name();',
    '    try { z.add(a, 1); } catch (CurrencyMismatchException e) { }',
    '  }',
    '}',
    '',
  ].join('\n') });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  assert.doesNotMatch(out, /Red-safe/);
  assert.match(out, /compile NOT verified/);
  assert.match(rd130(d, 'src/main/java/Currency.java'), /public static Currency of\(Object a0\)/);
  assert.match(rd130(d, 'src/main/java/Money.java'), /public Money add\(Object a0\)[\s\S]*public Money add\(Object a0, Object a1\)/);
  assert.match(rd130(d, 'src/main/java/CurrencyMismatchException.java'), /extends RuntimeException/);
  const files = ['src/test/java/MoneyTest.java', ...fs.readdirSync(path.join(d, 'src/main/java')).map((f) => `src/main/java/${f}`)];
  const r = spawnSync('javac', ['-d', path.join(d, 'out'), ...files.map((f) => path.join(d, f))], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('#130 C: pointer args from casts/&x/arrays, complete structs for -> access, compile-checked', { skip: !has130('cc') }, () => {
  const d = mk130({ 'include/.keep': '', 'tests/test_d.c': [
    '#include <stdint.h>', '#include <stdio.h>', '#include "d.h"',
    '// @id TEST-A-001 @verifies REQ-A-001',
    'int main(void) {',
    '  uint8_t b[4] = {1, 2, 3, 4};',
    '  size_t n = 0;',
    '  ht_t *t = ht_new();',
    '  ht_entry_t *e = ht_get(t, &n, 1);',
    '  ht_put(t, (uint8_t *)"k", 1, (const uint8_t *)"val", 3);',
    '  return d_sum(b, 4) == 10 && e->vlen == 3 ? 0 : 1;',
    '}', '',
  ].join('\n') });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  assert.match(out, /compile-checked/, out);
  const h = rd130(d, 'include/d.h');
  assert.match(h, /d_sum\(uint8_t \* a0, int a1\)/);
  assert.match(h, /ht_put\(ht_t \* a0, uint8_t \* a1, int a2, const uint8_t \* a3, int a4\)/);
  assert.match(h, /typedef struct ht_entry \{\n    long vlen;/);
  assert.equal(spawnSync('cc', ['-fsyntax-only', '-I', path.join(d, 'include'), path.join(d, 'tests/test_d.c')]).status, 0);
});

test('#131 PHP: no PHPUnit TestCase stub, catch-only exceptions extend \\Exception, instance methods stubbed', { skip: !has130('php') }, () => {
  const d = mk130({ 'composer.json': '{"autoload":{"psr-4":{"App\\\\":"src/"}}}', 'tests/RoleTest.php': [
    '<?php', 'use PHPUnit\\Framework\\TestCase;', 'use App\\Roles\\RoleHierarchy;', 'use App\\ParseException;',
    'final class RoleTest extends TestCase {',
    '  // @id TEST-A-001 @verifies REQ-A-001',
    '  public function test_a_001() {',
    '    $h = new RoleHierarchy();',
    '    $h->addRole("x");',
    '    try { $h->check(); } catch (ParseException $e) { $this->assertTrue(true); }',
    '  }', '}', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.ok(!fs.existsSync(path.join(d, 'src/Framework')), 'PHPUnit classes are never stubbed');
  assert.match(rd130(d, 'src/Roles/RoleHierarchy.php'), /public function addRole\(/);
  assert.match(rd130(d, 'src/Roles/RoleHierarchy.php'), /public function check\(/);
  assert.match(rd130(d, 'src/ParseException.php'), /class ParseException extends \\Exception/);
  for (const f of ['src/Roles/RoleHierarchy.php', 'src/ParseException.php']) assert.equal(spawnSync('php', ['-l', path.join(d, f)]).status, 0);
});

test('#131 Julia: module-wrapped stub, exception structs, no test-local or already-included names', () => {
  const d = mk130({ 'Project.toml': 'name = "X"\n', 'src/b.jl': 'helper(x) = x\n', 'test/a_tests.jl': [
    'include("../src/b.jl")', 'include("../src/a.jl")', 'using .Ops',
    'const F2(x) = x + 1',
    'f, g = pair()',
    '# @id TEST-A-001 @verifies REQ-A-001',
    '@testset "TEST-A-001" begin',
    '  @test_throws SingularError solve(F2, helper(1))',
    '  @test f(1) == 2',
    'end', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const s = rd130(d, 'src/a.jl');
  assert.match(s, /^module Ops\n/);
  assert.match(s, /export solve, pair, SingularError|export [\w, ]*SingularError/);
  assert.match(s, /struct SingularError <: Exception end/);
  assert.match(s, /solve\(args\.\.\.; kwargs\.\.\.\) = error/);
  assert.doesNotMatch(s, /F2|helper|\bg\(|\bf\(/);
  assert.match(s, /end # module Ops/);
});

test('#131 Python: only the SUT variable gets methods; pytest pythonpath = src is honored', () => {
  const d = mk130({ 'pytest.ini': '[pytest]\npythonpath = src\n', 'tests/test_m.py': [
    'from wf.eng import Eng', '', 'def make():', '    log = []', '    return Eng(log), log', '',
    '# @id TEST-A-001', '# @verifies REQ-A-001', 'def test_m():', '    eng, log = make()', '    eng.run()', '    assert log.count("x") == 1', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const s = rd130(d, 'src/wf/eng.py');
  assert.match(s, /def run\(self/);
  assert.doesNotMatch(s, /def count/);
  assert.ok(!fs.existsSync(path.join(d, 'wf/eng.py')), 'stub honors pythonpath');
});

test('#130/#131 stub messages: no "no missing relative imports" for non-JS languages, no stub/red advice loop', () => {
  const d = mk130({ 'tests/FooTest.cs': '// @id TEST-A-001 @verifies REQ-A-001\npublic class FooTest { }\n' });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  assert.doesNotMatch(out, /no missing relative imports/);
  assert.match(out, /nothing to stub/);
  const m = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  fs.writeFileSync(path.join(m, 'a.test.mjs'), jsTest().replace('assert.ok(1)', 'assert.ok(1)').replace(/^/, "import { x } from './nomod.mjs';\n"));
  setCmd(m, ['node', '-e', "console.log(\"Cannot find module './nomod.mjs'\");process.exit(1)"]);
  const r = sdd(m, 'tdd', 'red', 'TEST-A-001');
  assert.match(r.out, /stub already ran or found nothing/);
});

// ---- #150/#151 stub regressions (PHP/C#, Julia/TS/JS) ----
test('#150 PHP stub: namespace-aware project class check, class constants / enum cases via `use`', { skip: !has130('php') }, () => {
  const d = mk130({
    'composer.json': '{"autoload":{"psr-4":{"App\\\\":"src/"}}}',
    'src/Sdl/Parser.php': '<?php\nnamespace App\\Sdl;\nclass Parser { }\n',
    'tests/QTest.php': [
      '<?php', 'use App\\Query\\Parser;', 'use App\\Query\\Color;', 'use App\\Query\\Cfg;', '',
      '// @id TEST-A-001 @verifies REQ-A-001', 'final class QTest { function test_a_001() { Parser::parse("x"); $a = Color::RED->value; $b = Cfg::LIMIT; } }', '',
    ].join('\n'),
  });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  assert.match(rd130(d, 'src/Query/Parser.php'), /namespace App\\Query;[\s\S]*class Parser[\s\S]*static function parse/, out);
  assert.match(rd130(d, 'src/Query/Color.php'), /enum Color: string[\s\S]*case RED = 'RED'/);
  assert.match(rd130(d, 'src/Query/Cfg.php'), /class Cfg[\s\S]*const LIMIT/);
  fs.rmSync(path.join(d, 'src/Query'), { recursive: true });
  sdd(d, 'init');
  setCmd(d, ['node', '-e', "console.log('Error: Class \"App\\\\Query\\\\Parser\" not found');process.exit(1)"]);
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--missing-module');
  assert.doesNotMatch(r.out, /REJECTED/, r.out);
});

test('#150 C# stub: production namespace (not the test namespace), helper return types are not static, `is X` types, CS1501 members, deduped notes', { skip: spawnSync('dotnet', ['--version'], { stdio: 'ignore' }).status !== 0 }, (t) => {
  const MARK = '// sdd-stub: throwing stub generated by `tdd stub` — replace with the real implementation';
  const d = tree({
    'src/Lib/Lib.csproj': libProj(),
    'src/Lib/AuditTrail.cs': `${MARK}\nnamespace Lib;\n\npublic class AuditTrail : System.Collections.Generic.IEnumerable<string>\n{\n    public System.Collections.Generic.IEnumerator<string> GetEnumerator() => throw new System.NotImplementedException();\n    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => throw new System.NotImplementedException();\n}\n`,
    'tests/T/Lib.Tests.csproj': testProj(XUNIT, ['..\\..\\src\\Lib\\Lib.csproj']),
    'tests/T/SrcTests.cs': [
      'using Xunit;', 'using Lib;', '', 'namespace Lib.Tests;', '', 'public class SrcTests', '{',
      '    static ErrorInfo Err(string s) { var r = new Runner().Run(s); return r.Error!; }', '',
      '    /** @id TEST-A-001 @verifies REQ-A-001 */', '    [Fact]', '    public void a()', '    {',
      '        var tr = new AuditTrail();', '        tr.Append("a", "b", "c", "d");', '        object o = Err("x");', '        Assert.True(o is ErrorStmt);', '        Assert.Equal(0, new Source("abc").PosAt(0));', '    }', '}', '',
    ].join('\n'),
  });
  if (!restores(d, 'tests/T/Lib.Tests.csproj')) return t.skip('NuGet packages cannot be restored');
  const r = sddRaw(d, 'tdd', 'stub', 'TEST-A-001');
  const rd = (f) => fs.readFileSync(path.join(d, 'src/Lib', f), 'utf8');
  assert.match(rd('Source.cs'), /^namespace Lib;$/m, r.out);
  assert.doesNotMatch(rd('Source.cs'), /Tests/);
  assert.match(rd('ErrorInfo.cs'), /public class ErrorInfo/, r.out);
  assert.match(rd('ErrorStmt.cs'), /public class ErrorStmt/, r.out);
  assert.match(rd('AuditTrail.cs'), /Append\(/, r.out);
  assert.ok(!/CS1501/.test(r.out.replace(/NOT compile-checked[^\n]*/, '')) || /Append/.test(rd('AuditTrail.cs')));
});

test('#150 gate --changed without any commit says so', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  const out = sddRaw(d, 'gate', '--changed').out;
  assert.ok(!/cannot scope changes/.test(out) || /no commit yet/.test(out), out);
});

test('#151 TS stub: barrel re-exports are not shadowed, new C<T>() methods are stubbed, no Array methods invented on Box, error classes extend Error', () => {
  const d = mk130({
    'package.json': '{"name":"root","private":true,"workspaces":["packages/*"]}',
    'packages/core/package.json': '{"name":"@ot/core","main":"src/index.ts"}',
    'packages/core/src/index.ts': "export * from './ops';\n",
    'packages/core/src/ops.ts': 'export function apply(a: number) { return a; }\nexport type Op = number;\n',
    'packages/server/package.json': '{"name":"@ot/server"}',
    'packages/server/test/a.test.ts': [
      "import { it, expect } from 'vitest';", "import { apply, type Op } from '@ot/core';",
      "import { Box, Foo, ParseError } from '../src/box';",
      'function mk() { const out: number[] = []; return { b: new Box((n: number) => out.push(n)), out }; }',
      '/** @id TEST-A-001 @verifies REQ-A-001 */', "it('TEST-A-001 x', () => {", '  const { b, out } = mk();', '  b.go();',
      '  const f = new Foo<string>(1); f.run(2);', '  expect(out.map((x) => x + 1)).toEqual([2]);', '  expect(() => apply(1)).toThrow(ParseError);', '});', '',
    ].join('\n'),
  });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(rd130(d, 'packages/core/src/index.ts'), "export * from './ops';\n");
  const b = rd130(d, 'packages/server/src/box.ts');
  assert.match(b, /go\(/);
  assert.doesNotMatch(b, /\bpush\(|\bmap\(/);
  assert.match(b, /class Foo[\s\S]*run\(/);
  assert.match(b, /class ParseError extends Error/);
});

test('#151 JS stub: `import * as ns from "../src/ns.js"` does not invent an export from the path text', () => {
  const d = mk130({ 'test/a.test.mjs': ["import * as ns from '../src/ns.js';", '// @id TEST-A-001 @verifies REQ-A-001', "test('x', () => { ns.add(1, 2); });", ''].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const s = rd130(d, 'src/ns.js');
  assert.match(s, /export function add/);
  assert.doesNotMatch(s, /export const js\b/);
});

test('#151 Julia stub: appends missing functions to an existing included file, `!` names, module name follows the missing include', { skip: !has130('julia') }, () => {
  const d = mk130({ 'Project.toml': 'name = "X"\n', 'src/A.jl': 'module A\nexport f\nf() = 1\nend\n', 'test/t.jl': [
    'include("../src/A.jl")', 'include("../src/B.jl")', 'using .A', 'using .B',
    '# @id TEST-A-001 @verifies REQ-A-001', '@testset "TEST-A-001" begin', '  r = g()', '  @test next_u64!(r) == 5', 'end', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const b = rd130(d, 'src/B.jl');
  assert.match(b, /^module B\n/);
  assert.match(b, /next_u64!\(args\.\.\.; kwargs\.\.\.\) = error/);
  assert.match(b, /export [^\n]*next_u64!/);
  // existing included file: only the missing name is appended inside its module
  fs.writeFileSync(path.join(d, 'test/t.jl'), rd130(d, 'test/t.jl').replace('r = g()', 'r = g()\n  h2()'));
  fs.rmSync(path.join(d, 'src/B.jl'));
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  fs.writeFileSync(path.join(d, 'test/t.jl'), rd130(d, 'test/t.jl').replace('h2()', 'h2()\n  h3!()'));
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  const b2 = rd130(d, 'src/B.jl');
  assert.match(b2, /h3!\(args/, out);
  assert.match(b2, /export [^\n]*h3!/);
  assert.equal((b2.match(/^module B/gm) ?? []).length, 1);
  assert.equal((b2.match(/^end # module B/gm) ?? []).length, 1);
});

// ---- .NET: ProjectReference graph, scoped gate, C# stubs, NUnit/MSTest (#135 #136 #137) ----
const HAS_DOTNET = spawnSync('dotnet', ['--version'], { stdio: 'ignore' }).status === 0;
const DN = { skip: HAS_DOTNET ? false : 'dotnet SDK not installed' };
const TFM = '<TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings>';
const libProj = (refs = []) => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${TFM}</PropertyGroup>${refs.length ? `<ItemGroup>${refs.map((r) => `<ProjectReference Include="${r}" />`).join('')}</ItemGroup>` : ''}</Project>`;
const testProj = (pkgs, refs = []) => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${TFM}<IsPackable>false</IsPackable></PropertyGroup><ItemGroup>${pkgs.map(([n, v]) => `<PackageReference Include="${n}" Version="${v}" />`).join('')}${refs.map((r) => `<ProjectReference Include="${r}" />`).join('')}</ItemGroup></Project>`;
const XUNIT = [['Microsoft.NET.Test.Sdk', '17.14.1'], ['xunit', '2.9.3'], ['xunit.runner.visualstudio', '3.1.4']];
const restores = (d, proj) => spawnSync('dotnet', ['restore', proj, '--nologo', '-v', 'q'], { cwd: d, encoding: 'utf8', timeout: 240000 }).status === 0;
const gitCommit = (d) => { spawnSync('git', ['add', '-A'], { cwd: d }); spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: d }); };

test('#135 impact follows csproj ProjectReference: usings only link to referenced projects; csproj/props/solution are graph nodes', () => {
  const d = tree({
    'Directory.Build.props': '<Project />',
    'src/Lib/Lib.csproj': libProj(), 'src/Lib/Calc.cs': 'namespace Shared;\npublic class Calc { }\n',
    'src/Other/Other.csproj': libProj(), 'src/Other/Calc.cs': 'namespace Shared;\npublic class Calc { }\n',
    'tests/T/T.csproj': testProj(XUNIT, ['..\\..\\src\\Lib\\Lib.csproj']),
    'tests/T/CalcTests.cs': 'using Shared;\npublic class CalcTests { Calc c = new Calc(); }\n',
    'App.slnx': '<Solution><Project Path="src/Lib/Lib.csproj" /><Project Path="tests/T/T.csproj" /></Solution>',
  });
  const lib = reached(d, 'src/Lib/Calc.cs');
  assert.ok(lib.includes('tests/T/CalcTests.cs'), lib.join());
  assert.ok(!reached(d, 'src/Other/Calc.cs').includes('tests/T/CalcTests.cs'), 'an unreferenced project does not feed the test project');
  assert.ok(reached(d, 'src/Lib/Lib.csproj').includes('tests/T/CalcTests.cs'), 'a changed csproj reaches dependents');
  assert.ok(reached(d, 'Directory.Build.props').includes('tests/T/CalcTests.cs'), 'shared props reach every project below');
  assert.ok(reached(d, 'App.slnx').includes('src/Lib/Lib.csproj'), 'solution membership');
});

test('#135 default .NET changedCmd runs only changed test projects and test projects depending on changed projects; shared files fall back to the full run', () => {
  const d = tree({
    'App.slnx': '<Solution />',
    'src/Lib/Lib.csproj': libProj(), 'src/Lib/Calc.cs': 'namespace Lib;\npublic class Calc { }\n',
    'src/Core/Core.csproj': libProj(['..\\Lib\\Lib.csproj']), 'src/Core/C.cs': 'namespace Core;\npublic class C { }\n',
    'src/Solo/Solo.csproj': libProj(), 'src/Solo/S.cs': 'namespace Solo;\npublic class S { }\n',
    'tests/A/A.csproj': testProj(XUNIT, ['../../src/Core/Core.csproj']), 'tests/A/A.cs': 'public class A { }\n',
    'tests/B/B.csproj': testProj(XUNIT, ['../../src/Solo/Solo.csproj']), 'tests/B/B.cs': 'public class B { }\n',
    'README.md': 'x\n',
  });
  sddRaw(d, 'init');
  const cp = path.join(d, '.sdd/config.json');
  const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
  const chk = cfg.checks.find((c) => c.name === 'test');
  assert.ok(chk.changedCmd.includes('{changedTestProjects}'), JSON.stringify(chk));
  assert.match(chk.changedCmd.join(' '), /dotnet test/);
  fs.writeFileSync(cp, JSON.stringify({ ...cfg, projects: undefined, checks: [{ name: 'test', cmd: ['echo', 'FULL'], changedCmd: ['echo', 'SCOPE', '{changedTestProjects}'] }] }));
  gitCommit(d);
  fs.appendFileSync(path.join(d, 'src/Lib/Calc.cs'), '// edit\n');
  let g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /SCOPE tests\/A\/A\.csproj\b(?! tests\/B)/, g);
  assert.doesNotMatch(g, /tests\/B\/B\.csproj/, g);
  fs.appendFileSync(path.join(d, 'tests/B/B.cs'), '// edit\n');
  g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /SCOPE tests\/A\/A\.csproj tests\/B\/B\.csproj/, g);
  gitCommit(d);
  fs.appendFileSync(path.join(d, 'README.md'), 'more\n');
  g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /cannot scope changes for \{changedTestProjects\} — running the full check/, g);
  gitCommit(d);
  fs.writeFileSync(path.join(d, 'Directory.Build.props'), '<Project />');
  g = sddRaw(d, 'gate', '--changed').out;
  assert.match(g, /cannot scope changes for \{changedTestProjects\}/, g);
});

test('#135 nested .NET test projects depend on the projects they reference (transitively)', () => {
  const d = tree({
    'src/Lib/Lib.csproj': libProj(), 'src/Core/Core.csproj': libProj(['../Lib/Lib.csproj']),
    'tests/A/A.csproj': testProj(XUNIT, ['../../src/Core/Core.csproj']),
  });
  sddRaw(d, 'init');
  const cfg = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  const p = cfg.projects.find((x) => x.root === 'tests/A');
  assert.deepEqual([...p.dependsOn].sort(), ['src/Core', 'src/Lib']);
});

test('#137 build output (bin/, obj/) next to a .NET project is never scanned for @id, even without .gitignore', () => {
  const d = tree({
    'T/T.csproj': testProj(XUNIT),
    'T/obj/Debug/net10.0/Gen.cs': '// @id TEST-OBJ-001 @verifies REQ-X-001\npublic class G { }\n',
    'T/bin/Debug/net10.0/Gen2.cs': '// @id TEST-BIN-001 @verifies REQ-X-001\npublic class G2 { }\n',
    'T/Real.cs': '// @id TEST-REAL-001 @verifies REQ-X-001\npublic class R { }\n',
    'tools/bin/run.js': '// @id TEST-JS-001 @verifies REQ-X-001\n',
  });
  assert.match(sddRaw(d, 'impact', 'TEST-OBJ-001').out, /unknown target/);
  assert.match(sddRaw(d, 'impact', 'TEST-BIN-001').out, /unknown target/);
  assert.match(sddRaw(d, 'impact', 'TEST-REAL-001').out, /IMPACT TEST-REAL-001/);
  assert.match(sddRaw(d, 'impact', 'TEST-JS-001').out, /IMPACT TEST-JS-001/, 'bin/ without a project file is untouched');
});

test('#137 NUnit/MSTest attributes are not the test name: the method below @id is used for --filter', () => {
  const body = (attr) => `namespace T;\npublic class Tests\n{\n    // @id TEST-A-001 @verifies REQ-A-001\n    ${attr}\n    ${attr === '[Test]' ? '' : '[Description("x(1)")]\n    '}public void Adds_Numbers(int x) { }\n}\n`;
  for (const attr of ['[TestCase(1, 2)]', '[TestMethod]', '[DataRow(1)]', '[Test]']) {
    const d = mini(T1SPEC, { 'T/Tests.cs': body(attr) }, ['node', '-e', 'console.log("AssertionError: name=" + process.argv[1]); process.exit(1)', '{idu}']);
    const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--expect', 'name=Adds_Numbers');
    assert.equal(r.code, 0, `${attr}: ${r.out}`);
  }
});

test('#137 dotnet test gets --no-build only for a repeat run with an unchanged tree and a clean previous build', () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-fake-'));
  const log = path.join(bin, 'calls.log');
  fs.writeFileSync(path.join(bin, 'dotnet'), `#!/bin/sh\necho "$@" >> "${log}"\nif [ "$1" = "--version" ]; then echo 10.0.0; exit 0; fi\nif [ -n "$FAKE_BUILD_ERROR" ]; then echo "T.cs(1,1): error CS0103: nope"; fi\necho "Failed!  - Failed: 1, Passed: 0, Total: 1"\necho "Assert.Equal() Failure"\nexit 1\n`, { mode: 0o755 });
  const spec = '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n| REQ-A-002 | two shall hold. | TEST-A-002 |\n';
  const mk = () => mini(spec, { 'T/T.csproj': testProj(XUNIT), 'T/Tests.cs': '// @id TEST-A-001 @verifies REQ-A-001\npublic class A { }\n// @id TEST-A-002 @verifies REQ-A-002\npublic class B { }\n' }, ['dotnet', 'test', 'T', '--nologo', '--filter', 'FullyQualifiedName~{idu}']);
  const go = (d, env) => { fs.rmSync(log, { force: true }); spawnSync('node', [SDD, '--root', d, 'tdd', 'red', 'TEST-A-001', 'TEST-A-002', '--weak'], { encoding: 'utf8', env: { ...ENV, PATH: `${bin}:${process.env.PATH}`, ...env } }); return fs.readFileSync(log, 'utf8').trim().split('\n').filter((l) => /^test/.test(l)); };
  const ok = go(mk(), {});
  assert.equal(ok.length, 2, ok.join('\n'));
  assert.doesNotMatch(ok[0], /--no-build/);
  assert.match(ok[1], /^test --no-build /);
  const broken = go(mk(), { FAKE_BUILD_ERROR: '1' });
  assert.doesNotMatch(broken.join('\n'), /--no-build/, 'a failed build is never reused');
});

test('#136 C# tdd stub: diagnostics-driven throwing stubs, scoped to the requested test, compile-checked only when the build passes', DN, (t) => {
  const d = tree({
    'src/Lib/Lib.csproj': libProj(),
    'tests/T/T.csproj': testProj(XUNIT, ['..\\..\\src\\Lib\\Lib.csproj']),
    'tests/T/CalcTests.cs': [
      'using Xunit;', 'using Lib.Calc;', '', 'namespace T;', '', 'public class CalcTests', '{',
      '    /** @id TEST-A-001 @verifies REQ-A-001 */', '    [Fact]', '    public void adds()', '    {',
      '        var m = Money.Of(1m, "USD") + Money.Of(2m, "USD");', '        Assert.Equal(3m, m.Amount);', '        Assert.Equal(Mode.Up, Rounder.Pick(m.Amount));',
      '        var c = new Counter(5);', '        c.Inc();', '        c.Label = "x";', '        Assert.Throws<BadThingException>(() => c.Inc());', '    }', '',
      '    /** @id TEST-A-002 @verifies REQ-A-002 */', '    [Fact]', '    public void other()', '    {', '        Assert.Equal(1, Other.Thing());', '    }', '}', '',
    ].join('\n'),
  });
  if (!restores(d, 'tests/T/T.csproj')) return t.skip('NuGet packages cannot be restored');
  const r = sddRaw(d, 'tdd', 'stub', 'TEST-A-001');
  for (const f of ['Money', 'Mode', 'Rounder', 'Counter', 'BadThingException']) assert.ok(fs.existsSync(path.join(d, 'src/Lib', f + '.cs')), `${f}.cs\n${r.out}`);
  assert.ok(!fs.existsSync(path.join(d, 'src/Lib/Other.cs')), 'symbols of other tests are not stubbed');
  assert.doesNotMatch(r.out, /compile-checked\)/, 'the sibling test still fails to compile, so the verdict must not claim compile-checked');
  assert.match(r.out, /NOT compile-checked/);
  assert.match(r.out, /CS0103 The name 'Other'/);
  assert.match(fs.readFileSync(path.join(d, 'src/Lib/BadThingException.cs'), 'utf8'), /: System\.Exception/);
  assert.match(fs.readFileSync(path.join(d, 'src/Lib/Mode.cs'), 'utf8'), /enum Mode/);
  // single-test file: the build passes, so the verdict is compile-checked and the stubs throw at run time
  fs.writeFileSync(path.join(d, 'tests/T/CalcTests.cs'), fs.readFileSync(path.join(d, 'tests/T/CalcTests.cs'), 'utf8').replace('Other.Thing()', '1'));
  fs.writeFileSync(path.join(d, 'tests/T/CalcTests.cs'), fs.readFileSync(path.join(d, 'tests/T/CalcTests.cs'), 'utf8').replace('c.Label = "x";', 'c.Label = "x"; Assert.Equal(1, c.Total);'));
  const r2 = sddRaw(d, 'tdd', 'stub', 'TEST-A-001');
  assert.match(r2.out, /stubbed \(throwing, compile-checked\): src\/Lib\/Counter\.cs/, r2.out);
  const run = spawnSync('dotnet', ['test', 'tests/T', '--nologo', '--filter', 'FullyQualifiedName~adds'], { cwd: d, encoding: 'utf8', timeout: 240000 });
  assert.match(run.stdout, /NotImplementedException/);
});

test('#136 C# tdd stub without a project file or without a restorable build says so instead of claiming a verdict', DN, () => {
  const d = tree({ 'tests/FooTest.cs': '// @id TEST-A-001 @verifies REQ-A-001\npublic class FooTest { void X() { var a = new Missing(); } }\n' });
  assert.match(sddRaw(d, 'tdd', 'stub', 'TEST-A-001').out, /nothing to stub/);
  const e = tree({
    'T/T.csproj': testProj([['Definitely.Not.A.Package.Sdd', '9.9.9']]),
    'T/FooTest.cs': '// @id TEST-A-001 @verifies REQ-A-001\npublic class FooTest { void X() { var a = new Missing(); } }\n',
  });
  const r = sddRaw(e, 'tdd', 'stub', 'TEST-A-001');
  assert.doesNotMatch(r.out, /compile-checked\)/);
  assert.ok(!fs.existsSync(path.join(e, 'T/Missing.cs')), r.out);
});

for (const [name, pkgs, usingNs, attr, assertFail] of [
  ['NUnit', [['Microsoft.NET.Test.Sdk', '17.14.0'], ['NUnit', '4.3.2'], ['NUnit3TestAdapter', '5.0.0']], 'NUnit.Framework', '[TestCase(1)]', 'Assert.That(x + 1, Is.EqualTo(99));'],
  ['MSTest', [['Microsoft.NET.Test.Sdk', '17.14.0'], ['MSTest.TestFramework', '3.9.3'], ['MSTest.TestAdapter', '3.9.3']], 'Microsoft.VisualStudio.TestTools.UnitTesting', '[TestMethod]', 'Assert.AreEqual(99, 1);'],
]) {
  test(`#137 ${name}: red filters by @id through the test method name, and the second batch run reuses the build`, DN, (t) => {
    const cls = name === 'MSTest' ? '[TestClass]\npublic class Tests' : 'public class Tests';
    const spec = '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | one shall hold. | TEST-A-001 |\n| REQ-A-002 | two shall hold. | TEST-A-002 |\n';
    const d = mini(spec, {
      'T/T.csproj': testProj(pkgs),
      'T/Tests.cs': `using ${usingNs};\nnamespace T;\n${cls}\n{\n    // @id TEST-A-001 @verifies REQ-A-001\n    ${attr}\n    public void Adds_Numbers(${name === 'NUnit' ? 'int x' : ''}) { ${name === 'NUnit' ? assertFail : assertFail} }\n\n    // @id TEST-A-002 @verifies REQ-A-002\n    ${name === 'NUnit' ? '[Test]' : '[TestMethod]'}\n    public void Subtracts() { ${assertFail.replace('x + 1', '1')} }\n}\n`,
    }, ['dotnet', 'test', 'T', '--nologo', '--filter', 'FullyQualifiedName~{idu}']);
    if (!restores(d, 'T/T.csproj')) return t.skip(`${name} packages cannot be restored (offline?)`);
    const r = sdd(d, 'tdd', 'red', 'TEST-A-001', 'TEST-A-002');
    assert.match(r.out, /RED ok TEST-A-001/, r.out);
    assert.match(r.out, /RED ok TEST-A-002/, r.out);
    assert.doesNotMatch(r.out, /no test matched/);
  });
}

test('#138 review check: Pending/Reopened/Unresolved are open; missing file/feature are errors; approve --review missing path refused', () => {
  const d = project();
  sdd(d, 'init');
  const h = /sha256:([0-9a-f]{64})/.exec(sdd(d, 'approve', 'prepare', 'calc').out)[1];
  for (const st of ['Pending', 'Reopened', 'Unresolved']) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec: sha256:${h}\nverdict: pass\nopen: 0\n\n| ID | Sev | Where | Status |\n|---|---|---|---|\n| F1 | high | x | ${st} |\n`);
    const r = sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc');
    assert.equal(r.code, 1, `${st}: ${r.out}`);
    assert.match(r.out, /Open finding/);
  }
  assert.equal(sdd(d, 'review', 'check', '.sdd/nope.md', '--feature', 'calc').code, 2);
  assert.match(sdd(d, 'review', 'check', '.sdd/nope.md', '--feature', 'calc').out, /not found/);
  assert.match(sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'zzz').out, /unknown feature/);
  assert.equal(sdd(d, 'review', 'check', '.sdd/review.md').code, 2);
  assert.equal(sdd(d, 'review', 'template', 'zzz').code, 2);
  assert.equal(sdd(d, 'review', 'template').code, 2);
  const a = sdd(d, 'approve', 'record', 'calc', '--by', 'ai:r1', '--review', '.sdd/missing-review.md');
  assert.equal(a.code, 1, a.out);
  assert.match(a.out, /does not exist/);
});

test('#139 gate reports --retest Reds separately from characterization, listing IDs', () => {
  const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, PASS);
  sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'x');
  const f = path.join(d, 'a.test.mjs');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('assert.ok(1)', 'assert.ok(2)'));
  sdd(d, 'tdd', 'red', 'TEST-A-001', '--retest', 'expectation was wrong');
  sdd(d, 'tdd', 'green', 'TEST-A-001');
  const g = sdd(d, 'gate', '--no-run').out;
  assert.match(g, /1 retest/);
  assert.match(g, /TEST-A-001/);
  assert.doesNotMatch(g, /characterization: passed/);
});

test('#140 skipped runs (node:test ℹ skipped, PHPUnit skipped/no assertions) are not Red/Green/characterization', () => {
  for (const o of ['ℹ tests 1\nℹ pass 0\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nTEST-CALC-001', 'OK, but some tests were skipped!\nTests: 1, Assertions: 0, Skipped: 1.\ntest_calc_001']) {
    const d = project();
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'printf "%s\\n" "$0"; exit 0', o] }));
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'x');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /skipped/);
  }
});

test('#141 default node pattern is token-anchored; {idu} keeps the case used in the test file', () => {
  const d = project();
  sdd(d, 'init');
  const c = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  const re = new RegExp(c.testCmd[c.testCmd.indexOf('--test-name-pattern') + 1].replace('{id}', 'TEST-S-001'));
  assert.ok(re.test('TEST-S-001 x'));
  assert.ok(!re.test('TEST-S-0011 x'));
  const e = project();
  fs.writeFileSync(path.join(e, 'T.cs'), '// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Test] public void TEST_CALC_001_Adds() {}\n');
  fs.writeFileSync(path.join(e, 'x.csproj'), '<Project/>');
  sdd(e, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(e, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'echo "FAIL $0"; exit 1', '{idu}'] }));
  fs.writeFileSync(path.join(e, 'add.test.mjs'), '// @id TEST-CALC-001 @verifies REQ-CALC-001\n// TEST_CALC_001 Adds\n');
  assert.match(sdd(e, 'tdd', 'red', 'TEST-CALC-001').out, /fails with: FAIL TEST_CALC_001/);
});

// ---- dogfood round 6 stub fixes (#147 Python, #148 Go, #149 Rust/Java/C++) ----
test('#147 Python stub: scoped to the requested test, variable rebinding and helper-built classes attribute methods to the right class', () => {
  const d = mk130({ 'pytest.ini': '[pytest]\npythonpath = src\n', 'tests/test_m.py': [
    'from pk.m import Counter, Sub, Catalog, Column', '',
    'def make():', '    cat = Catalog()', '    cat.create_table("P", [Column("id")])', '    return cat', '',
    '# @id TEST-A-001', '# @verifies REQ-A-001', 'def test_a():', '    s = Counter()', '    s.fresh()', '    cat = make()', '    cat.table("P")', '',
    '# @id TEST-A-002', '# @verifies REQ-A-001', 'def test_b():', '    s = Sub({1: 2})', '    s.run2(1)', '    Counter().other()', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const s = rd130(d, 'src/pk/m.py');
  const cls = (n) => new RegExp(`class ${n}[^]*?(?=\\nclass |$)`).exec(s)?.[0] ?? '';
  assert.match(cls('Counter'), /def fresh\(/);
  assert.doesNotMatch(cls('Counter'), /def (run2|other)\(/, 'methods of another test are not stubbed');
  assert.doesNotMatch(cls('Sub'), /def (fresh|run2)\(/);
  assert.match(cls('Catalog'), /def table\(/);
  assert.match(cls('Catalog'), /def create_table\(/);
  assert.doesNotMatch(cls('Column'), /def table\(/, 'helper returning Catalog does not leak onto Column');
  const e = mk130({ 'pytest.ini': '[pytest]\npythonpath = src\n', 'tests/test_m.py': [
    'from pk.m import Counter, Sub', '',
    '# @id TEST-A-003', '# @verifies REQ-A-001', 'def test_a():', '    s = Counter()', '    s.fresh()', '    s = Sub({1: 2})', '    s.run2(1)', '',
  ].join('\n') });
  sdd(e, 'tdd', 'stub', 'TEST-A-003');
  const t = rd130(e, 'src/pk/m.py');
  assert.match(/class Sub[^]*/.exec(t)[0], /def run2\(/);
  assert.doesNotMatch(/class Sub[^]*/.exec(t)[0], /def fresh\(/, 'a rebound variable belongs to its latest class');
});

test('#148 Go stub: field-selector receivers, honest message, New() returns the named type, scoped to the requested test, struct literal fields', { skip: !has130('go') }, () => {
  const d = mk130({
    'go.mod': 'module example.com/r\n\ngo 1.21\n',
    'calc/calc_test.go': [
      'package calc_test', '', 'import (', '\t"testing"', '', '\t"example.com/r/calc"', ')', '',
      'type rig struct{ c *calc.Calc }', '', 'func put(s *calc.Store, k string) { s.Put(k) }', '',
      '/** @id TEST-A-001 @verifies REQ-A-001 */', 'func TestTEST_A_001_add(t *testing.T) {',
      '\tr := &rig{c: calc.New()}', '\tm := calc.Msg{From: 1, To: 2}', '\tput(calc.New(), "a")', '\tif r.c.Add(2, 3) != 5 || m.From != 1 {', '\t\tt.Fatal("bad")', '\t}', '}', '',
      '/** @id TEST-A-002 @verifies REQ-A-001 */', 'func TestTEST_A_002_mode(t *testing.T) {', '\tif calc.Mode != calc.ModeFast {', '\t\tt.Fatal("bad")', '\t}', '}', '',
    ].join('\n'),
  });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  assert.doesNotMatch(out, /nothing to stub/, out);
  const files = fs.readdirSync(path.join(d, 'calc')).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  const s = files.map((f) => rd130(d, `calc/${f}`)).join('\n');
  assert.match(s, /func \(\*Calc\) Add\(a0, a1 any\)|func \(\*Calc\) Add\(\w+ \w+, \w+ \w+\)/, 'field-selector call keeps its arguments');
  assert.match(s, /type Msg struct \{[^}]*From[^}]*To/, 'all struct literal fields');
  assert.match(s, /func New\(\) \*(Calc|Store)/);
  assert.doesNotMatch(s, /type Calc[A-Z]|Mode/, 'symbols of other tests are not stubbed');
  assert.match(out, /compile-checked|stubbed/, out);
});

test('#149 Rust stub: Type::new(..).unwrap() returns a Result, None-compared calls return Option', { skip: !has130('cargo') }, () => {
  const d = mk130({ 'Cargo.toml': '[package]\nname = "d"\nversion = "0.1.0"\nedition = "2021"\n', 'tests/t.rs': [
    'use d::Tree;', '// @id TEST-A-001 @verifies REQ-A-001', '#[test]', 'fn t() {', '    let mut t = Tree::new(4).unwrap();', '    assert_eq!(t.insert(1, 2), None);', '    assert_eq!(t.get(1), Some(2));', '}', '',
  ].join('\n') });
  const out = sdd(d, 'tdd', 'stub', 'TEST-A-001').out;
  const s = rd130(d, 'src/lib.rs');
  assert.match(s, /fn new<A0>\(_a0: A0\) -> Result<Self, String>/, s);
  assert.match(s, /fn insert[^\n]*-> Option<i64>/, s);
  assert.match(s, /fn get[^\n]*-> Option<i64>/, s);
  assert.match(out, /compile-checked/, out);
});

test('#149 Java stub: commas in string literals, String returns, chained static factories, own stubs are extended', { skip: !has130('javac') }, () => {
  const d = mk130({ 'src/test/java/RTest.java': [
    'public class RTest {', '  static void assertEquals(Object a, Object b) {}',
    '  // @id TEST-A-001 @verifies REQ-A-001', '  static void t1() {', '    assertEquals(3, Tok.count("a, b"));', '    assertEquals("y", Util.lower("Y"));', '    Object o = Analyzer.standard().analyze("x");', '  }',
    '  // @id TEST-A-002 @verifies REQ-A-001', '  static void t2() {', '    assertEquals(1, Tok.count("q"));', '    assertEquals(2, Tok.name());', '  }', '}', '',
  ].join('\n') });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const tok = rd130(d, 'src/main/java/Tok.java');
  assert.match(tok, /count\(Object a0\)/);
  assert.doesNotMatch(tok, /count\(Object a0, Object a1\)/);
  assert.match(rd130(d, 'src/main/java/Util.java'), /static String lower\(Object a0\)/);
  assert.match(rd130(d, 'src/main/java/Analyzer.java'), /static StandardResult standard\(\)/);
  assert.match(rd130(d, 'src/main/java/StandardResult.java'), /analyze\(/);
  const o2 = sdd(d, 'tdd', 'stub', 'TEST-A-002').out;
  assert.doesNotMatch(o2, /hold real code/, o2);
  assert.match(rd130(d, 'src/main/java/Tok.java'), /name\(\)/, 'a generated stub is extended');
});

test('#149 C++ stub: namespaced classes get class stubs (not functions per variable) and a failed stub exits non-zero', { skip: !has130('g++') }, () => {
  const d = mk130({ 'tests/b.cpp': [
    '#include "lsm/bloom.hpp"', '// @id TEST-A-001 @verifies REQ-A-001', 'int main() {', '  lsm::BloomFilter f(1000, 0.01);', '  f.add("a");', '  return f.contains("a") ? 0 : 1;', '}', '',
  ].join('\n') });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const h = fs.readdirSync(d, { recursive: true }).find((f) => /bloom\.hpp$/.test(f));
  const s = rd130(d, h);
  assert.match(s, /namespace lsm \{/, s);
  assert.match(s, /class BloomFilter/);
  assert.match(s, /add\(A&&\.\.\.\)/);
  assert.doesNotMatch(s, /inline int f\(/, 'variables are not functions');
  assert.equal(r.code, 0, r.out);
});

const writeAll = (d, files) => { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } };

test('#144 a helper between tests does not stale the previous test; unchanged-since-Refactor warns once', () => {
  const d = project();
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const T = (helper, extra = '') => [
    "import { test } from 'node:test';", "import assert from 'node:assert/strict';", "import { add } from './add.mjs';",
    '/** @id TEST-CALC-001 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-001 adds', () => assert.equal(add(1, 2), 3));", '',
    `const helper = ${helper};`,
    '/** @id TEST-CALC-002 @verifies REQ-CALC-001 */',
    "test('TEST-CALC-002 adds', () => assert.equal(add(helper, 2), 3));", extra, '',
  ].join('\n');
  fs.writeFileSync(path.join(d, 'add.test.mjs'), T(1));
  impl(d, '(a, b) => a - b');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  impl(d, '(a, b) => a + b');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'add.test.mjs'), T(5, "describe_like();\n"));
  const g = sdd(d, 'gate', '--no-run');
  assert.doesNotMatch(g.out, /TEST-CALC-001: test changed since last/);
  // Refactor after a real change warns once; a second Refactor with the test unchanged is silent
  fs.writeFileSync(path.join(d, 'add.test.mjs'), T(5).replace("add(1, 2), 3)", "add(1, 2), 3, 'sum')"));
  assert.match(sdd(d, 'tdd', 'refactor', 'TEST-CALC-001').out, /test body changed since the last Green/);
  assert.doesNotMatch(sdd(d, 'tdd', 'refactor', 'TEST-CALC-001').out, /test body changed/);
});

test('#145 impact reaches Python submodule imports, Go methods-only files, subdir go.mod, JSON contracts and shared unannotated files', () => {
  const d = project();
  writeAll(d, {
    'crdt/__init__.py': '', 'crdt/lwwmap.py': 'class M: pass\n', 'tests/test_zz.py': 'from crdt import lwwmap\n',
    'g/go.mod': 'module example.com/m\n', 'g/a/t.go': 'package a\ntype T struct{}\nfunc New() *T { return nil }\n', 'g/a/m.go': 'package a\nfunc (t *T) M() int { return 1 }\n',
    'g/b/b.go': 'package b\nimport "example.com/m/a"\nfunc F() int { return a.New().M() }\n',
    'g/contract/c.go': 'package contract\nfunc C() {}\n', 'g/r/r.go': 'package r\nimport "example.com/m/contract"\nfunc R() { contract.C() }\n',
    'contract/states.json': '{}', 'api/s.ts': 'import t from "../contract/states.json";\nexport const x = t;\n',
  });
  const reach = (f) => JSON.parse(sdd(d, 'impact', f, '--json').out).reachedFiles;
  assert.ok(reach('crdt/lwwmap.py').includes('tests/test_zz.py'));
  assert.ok(reach('g/a/m.go').includes('g/b/b.go'));
  assert.ok(reach('g/contract/c.go').includes('g/r/r.go'));
  assert.ok(reach('contract/states.json').includes('api/s.ts'));
});

test('#146 spec Test column, pytest autodetect, unknown flags, batch tdd ID validation', () => {
  const d = project();
  const spec = path.join(d, '.sdd/specs/calc.md');
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('REQ-CALC-001 |', 'REQ-CALC-001 | TEST-CALC-099 |'));
  const t = sdd(d, 'trace');
  assert.match(t.out, /spec lists TEST-CALC-099 but no such test/);
  const p = project();
  writeAll(p, { 'tests/test_x.py': 'def test_x(): pass\n' });
  sdd(p, 'init');
  assert.match(fs.readFileSync(path.join(p, '.sdd/config.json'), 'utf8'), /pytest/);
  const g = sdd(d, 'gate', '--changd');
  assert.equal(g.code, 2);
  assert.match(g.out, /unknown flag.*--changd/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['true'], projects: [{ root: 'api', testCmd: ['true'], dependsOn: ['./contrct'] }] }));
  assert.match(sdd(d, 'gate', '--no-run').out, /dependsOn "\.\/contrct" does not exist/);
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const r = sdd(d, 'tdd', 'refactor', 'TEST-CALC-001', 'TEST-NOPE-9');
  assert.equal(r.code, 2);
  assert.match(r.out, /nothing was run/);
});

// ---- #142 / #143 (dogfood-6): runner verdicts and weak-Red heuristic ----
const fakeOut = (d, text, exit = 1, extra = {}) => {
  fs.writeFileSync(path.join(d, 'out.txt'), text);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', `cat out.txt; exit ${exit}`, 'x'], ...extra }));
};
const approved = () => { const d = project(); sdd(d, 'approve', 'record', 'calc', '--by', 'tester'); return d; };

test('#143 a timed-out run is neither Red nor Green', () => {
  const d = approved();
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ schemaVersion: 1, testCmd: ['sh', '-c', 'sleep 5', 'x'], timeoutMs: 300 }));
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /REJECTED.*timed out/, r.out);
});

test('#143 a crashed forked JVM is reported as a crash, not "no test matched"', () => {
  const d = approved();
  fakeOut(d, '[ERROR] There was an error in the forked process\njava.lang.OutOfMemoryError: Requested array size exceeds VM limit\nTests run: 0, Failures: 0, Errors: 0, Skipped: 0\n');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /REJECTED.*crashed/, r.out);
  assert.doesNotMatch(r.out, /no test matched/);
});

test('#143 several .NET test projects: a project without a match does not reject a genuine Red/Green', () => {
  const d = approved();
  const out = (res) => `Failed TEST_CALC_001 [1 ms]\n${res} - Failed: ${res === 'Failed!' ? 1 : 0}, Passed: ${res === 'Failed!' ? 0 : 1}, Skipped: 0, Total: 1, Duration: 1 ms - A.Tests.dll (net8.0)\nNo test matches the given testcase filter \`FullyQualifiedName~test_calc_001\` in /x/B.Tests.dll\n`;
  fakeOut(d, out('Failed!'));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /RED ok/);
  fakeOut(d, out('Passed!'), 0);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /GREEN ok/);
});

test('#143 Julia whole-file runner: a testset that never ran is not Red; a passing testset is Green despite a failing sibling', () => {
  const d = approved();
  const summary = (rows) => `Test Summary: | Pass  Fail  Total  Time\n${rows}\n`;
  fakeOut(d, summary('TEST-OTHER-001  |    1     1      2  0.1s'));
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /never ran/, r.out);
  fakeOut(d, summary('TEST-CALC-001  |    1            1  0.1s\nTEST-OTHER-001  |    1     1      2  0.1s'));
  sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'x');
  fakeOut(d, summary('TEST-CALC-001  |    1            1  0.1s\nTEST-OTHER-001  |    1     1      2  0.1s'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /GREEN (ok|REJECTED)/);
});

test('#143 Red reason is shown for NUnit "Expected is" and PHPUnit custom fail() messages', () => {
  for (const [o, re] of [['  Expected is <System.String[4]> with 4 elements, actual is <System.String[0]>\n  Values differ at index [0]\n', /fails with: Expected is <System\.String\[4\]>/], ['There was 1 failure:\n\n1) CalcTest::test_calc_001\nstep name accepted: ""\n\n/x/CalcTest.php:9\n', /fails with: step name accepted/]]) {
    const d = approved();
    fakeOut(d, o);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.match(r.out, re, r.out);
  }
});

test('#143 rejected run keeps the Rust assertion message and left/right values', () => {
  const d = approved();
  fakeOut(d, "running 1 test\nthread 'x' panicked at src/lib.rs:3:5:\nassertion `left == right` failed\n  left: 51\n right: 50\nnote: run with `RUST_BACKTRACE=1`\nfailures:\ntest result: FAILED. 0 passed; 1 failed\nerror: test failed, to rerun pass `--test x`\n");
  sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  fakeOut(d, "running 1 test\nthread 'x' panicked at src/lib.rs:3:5:\nassertion `left == right` failed\n  left: 51\n right: 50\nnote: run with `RUST_BACKTRACE=1`\nfailures:\ntest result: FAILED. 0 passed; 1 failed\nerror: test failed, to rerun pass `--test x`\n");
  const g = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.match(g.out, /left: 51/, g.out);
  assert.match(g.out, /right: 50/, g.out);
});

test('#142 weak Red: Assert.X (.NET), chained/tuple/derived/helper-wrapped asserted results and dotted stub names are not setup', () => {
  const cases = [
    ['  const p = add(0);', '  Assert.AreEqual(1, p.Line);'],
    ['  const v = add(0);', '  assert(4.0 <= v && v <= 8.0);'],
    ['  const r = add(0);', '  assert.deepEqual([r.x, r.y], [1, 2]);'],
    ['  const toks = add(0);', '  const got = [...toks, "x"];', '  assert.deepEqual(got, ["a"]);'],
    ['  const r = add(1);', '  assert.deepEqual(obj(r), { a: 1 });'],
  ];
  for (const body of cases) {
    const d = approved();
    fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
    testFile(d, body);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /\[weak\]/, `${body.join(' | ')}\n${r.out}`);
  }
  // an assertion that also calls other code keeps a stubbed setup operand weak
  const d = approved();
  fs.writeFileSync(path.join(d, 'add.mjs'), "export const add = () => { throw new Error('not implemented: add'); };\n");
  testFile(d, ['  const seed = add(0, 0);', '  Assert.AreEqual(other(1, 2), 3 + seed);']);
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\].*setup call "add"/);
  // `Class.method` / `Class->method` stub messages name the method, not the class
  const e = approved();
  testFile(e, ['  const b = make();', '  b.go();', '  assert.equal(b.n, 1);']);
  fakeOut(e, 'Error: not implemented: Box.go\n    at go (add.test.mjs:7:5)\n');
  assert.doesNotMatch(sdd(e, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\]/);
  testFile(e, ['  const b = make();', '  b.go();', '  assert.equal(b.n, 1);']);
  fakeOut(e, 'not implemented in here\n');
  assert.doesNotMatch(sdd(e, 'tdd', 'red', 'TEST-CALC-001').out, /setup call "(in|here)"/);
});

test('#142 weak Red: Go panic stub in test setup and C# static initializer are weak; Go reason shows the panic', () => {
  const d = approved();
  testFile(d, ['  const c = New();', '  assert.equal(other(), 3);']);
  fakeOut(d, '--- FAIL: TestCalc (0.00s)\npanic: nyi: New [recovered]\n\ngoroutine 7 [running]:\nexample.com/x.New(...)\n\t/x/calc.go:3 +0x1\nexample.com/x.TestCalc(0xc0)\n\t/x/add.test.mjs:6 +0x2\n');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.match(r.out, /fails with: panic: nyi: New/, r.out);
  assert.match(r.out, /\[weak\].*setup call "New"/, r.out);
  const e = approved();
  testFile(e, ['  assert.equal(add(1, 2), 3);']);
  fakeOut(e, 'System.TypeInitializationException: The type initializer for \'T\' threw an exception.\n ---> System.NotImplementedException : The method or operation is not implemented.\n   at P.Satisfy(Func`2 f) in /x/P.cs:line 3\n');
  assert.match(sdd(e, 'tdd', 'red', 'TEST-CALC-001').out, /\[weak\].*setup call "Satisfy"/);
});
