import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SDD = process.env.SDD_SCRIPT_UNDER_TEST ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'sdd.mjs');
const work = fs.mkdtempSync(path.join(process.cwd(), '.sdd-test-work-'));
process.env.TMPDIR = work;
process.env.GIT_CEILING_DIRECTORIES = work;
after(() => fs.rmSync(work, { recursive: true, force: true }));

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

test('#157 pytest descriptive and suffixed names cannot borrow sibling failures', { skip: spawnSync('python3', ['-m', 'pytest', '--version']).status !== 0 }, () => {
  for (const name of ['test_calc_001_target', 'test_descriptive_target']) {
    const d = project();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    fs.writeFileSync(path.join(d, 'pytest.ini'), '[pytest]\n');
    fs.writeFileSync(path.join(d, 'test_calc.py'), `# @id TEST-CALC-001 @verifies REQ-CALC-001\ndef ${name}():\n    assert True\n\n# @id TEST-CALC-0011 @verifies REQ-CALC-001\ndef ${name}1_sibling():\n    assert False, "sibling only"\n`);
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /test passed/);
    assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
    fs.writeFileSync(path.join(d, 'test_calc.py'), fs.readFileSync(path.join(d, 'test_calc.py'), 'utf8').replace('assert True', 'assert False, "target only"'));
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    assert.match(red.out, /target only/);
    assert.doesNotMatch(red.out, /sibling only/);
  }
});

test('#158 Python submodule stubs use selected calls and local aliases', () => {
  for (const clause of ['api', 'api as renamed']) {
    const d = project();
    const local = clause.includes(' as ') ? 'renamed' : 'api';
    fs.rmSync(path.join(d, 'add.test.mjs'));
    fs.mkdirSync(path.join(d, 'scope_demo'));
    fs.writeFileSync(path.join(d, 'scope_demo/__init__.py'), '');
    fs.writeFileSync(path.join(d, 'test_calc.py'), `from scope_demo import ${clause}\n# @id TEST-CALC-001 @verifies REQ-CALC-001\ndef test_calc_001():\n    assert ${local}.first() == 1\n# @id TEST-CALC-002 @verifies REQ-CALC-001\ndef test_calc_002():\n    assert ${local}.unrelated() == 1\n`);
    const r = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
    assert.equal(r.code, 0, r.out);
    const api = fs.readFileSync(path.join(d, 'scope_demo/api.py'), 'utf8');
    assert.match(api, /def first/);
    assert.doesNotMatch(api, /unrelated/);
    assert.equal(fs.readFileSync(path.join(d, 'scope_demo/__init__.py'), 'utf8'), '');
  }
});

test('#158 Python missing-module accepts only a directly declared absent project import', { skip: spawnSync('python3', ['-m', 'pytest', '--version']).status !== 0 }, () => {
  const d = project();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  fs.writeFileSync(path.join(d, 'pytest.ini'), '[pytest]\n');
  fs.writeFileSync(path.join(d, 'test_calc.py'), 'from missing_calc_project import calculate\n# @id TEST-CALC-001 @verifies REQ-CALC-001\ndef test_calc_001():\n    assert calculate() == 1\n');
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--missing-module');
  assert.equal(red.code, 0, red.out);
  assert.doesNotMatch(red.out, /\[weak\]/);
  fs.writeFileSync(path.join(d, 'missing_calc_project.py'), 'import unrelated_missing_dependency\n');
  const bad = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--missing-module');
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /load\/compile error/);
});

for (const [kind, before, after] of [
  ['import binding', 'from oracle import wrong as value', 'from oracle import right as value'],
  ['decorator above comment', '@pytest.mark.parametrize(\n    "value", [0]\n)\n# @id TEST-CALC-002 @verifies REQ-CALC-001\ndef test_calc_002(value):\n    assert value == 1', '@pytest.mark.parametrize(\n    "value", [1]\n)\n# @id TEST-CALC-002 @verifies REQ-CALC-001\ndef test_calc_002(value):\n    assert value == 1'],
  ['trailing transitive oracle helper', 'def expected():\n    return oracle()\n\ndef oracle():\n    return 2', 'def expected():\n    return oracle()\n\ndef oracle():\n    return 1'],
  ['multiline docstring signature', 'def test_calc_002(\n    value=False,\n):\n    """@id TEST-CALC-002 @verifies REQ-CALC-001"""\n    assert value is True', 'def test_calc_002(\n    value=True,\n):\n    """@id TEST-CALC-002 @verifies REQ-CALC-001"""\n    assert value is True'],
]) {
  test(`#159 Python hash locks ${kind}`, () => {
    const d = project();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    const base = '# @id TEST-CALC-001 @verifies REQ-CALC-001\ndef test_calc_001():\n    assert True\n\n';
    const target = '# @id TEST-CALC-002 @verifies REQ-CALC-001\ndef test_calc_002():\n    assert value() == expected()\n\n';
    const body = kind === 'import binding' ? before + '\n' + base + target : base + (kind.includes('oracle') ? target + before : before) + '\n';
    fs.writeFileSync(path.join(d, 'test_calc.py'), body);
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['node', '-e', 'console.log("AssertionError: target");process.exit(1)'], checks: [] }));
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-002');
    assert.equal(red.code, 0, red.out);
    fs.writeFileSync(path.join(d, 'test_calc.py'), body.replace(before, after));
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['node', '-e', '0'], checks: [] }));
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-002');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
  });
}

test('#159 Python sibling additions preserve evidence, but shared oracle data changes stale it', () => {
  const d = project();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  const body = '# @id TEST-CALC-001 @verifies REQ-CALC-001\ndef test_calc_001():\n    assert actual() == EXPECTED\n\nEXPECTED = 2\n';
  fs.writeFileSync(path.join(d, 'test_calc.py'), body);
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['node', '-e', 'process.exit(1)'], checks: [] }));
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.appendFileSync(path.join(d, 'test_calc.py'), '\n@pytest.mark.parametrize("x", [1])\n# @id TEST-CALC-002 @verifies REQ-CALC-001\ndef test_calc_002(x):\n    assert x == 1\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['node', '-e', '0'], checks: [] }));
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
  fs.writeFileSync(path.join(d, 'test_calc.py'), fs.readFileSync(path.join(d, 'test_calc.py'), 'utf8').replace('EXPECTED = 2', 'EXPECTED = 1'));
  assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
});

test('#160 Go impact follows same-package production symbols and module-root imports', () => {
  const d = project();
  writeAll(d, {
    'go.mod': 'module example.org/core\n',
    'helper.go': 'package core\nfunc hash() int { return 1 }\n',
    'api.go': 'package core\nfunc Run() int { return hash() }\n',
    'unused.go': 'package core\nfunc Unused() int { return 0 }\n',
    'client/client.go': 'package client\nimport core "example.org/core"\nfunc Value() int { return core.Run() }\n',
    'client/client_test.go': 'package client\nimport "testing"\nfunc TestValue(t *testing.T) { if Value() != 1 { t.Fatal("wrong") } }\n',
  });
  const r = sdd(d, 'impact', 'helper.go', '--json');
  assert.equal(r.code, 0, r.out);
  const reached = JSON.parse(r.out).reachedFiles;
  for (const f of ['api.go', 'client/client.go', 'client/client_test.go']) assert.ok(reached.includes(f), `${f}: ${r.out}`);
  assert.ok(!reached.includes('unused.go'), r.out);
});

test('#160 Go impact follows promoted methods and unnamed local alias receivers (issue comment)', () => {
  const d = project();
  writeAll(d, {
    'go.mod': 'module example.org/model\n',
    'model/base.go': 'package model\ntype Base struct{}\n',
    'model/method.go': 'package model\nfunc (b *Base) Value() int { return 7 }\n',
    'model/shell.go': 'package model\ntype Shell struct { Base }\nfunc NewShell() *Shell { return &Shell{} }\n',
    'model/alias.go': 'package model\ntype Alias = Base\n',
    'model/alias_method.go': 'package model\nfunc (Alias) Count() int { return 7 }\n',
    'client/client.go': 'package client\nimport "example.org/model/model"\nfunc Value() int { return model.NewShell().Value() }\nfunc Count() int { return (model.Base{}).Count() }\n',
    'client/client_test.go': 'package client\nfunc TestValue() { Value(); Count() }\n',
  });
  for (const seed of ['model/method.go', 'model/alias_method.go']) {
    const r = sdd(d, 'impact', seed, '--json');
    const reached = JSON.parse(r.out).reachedFiles;
    for (const f of ['client/client.go', 'client/client_test.go']) assert.ok(reached.includes(f), `${seed} -> ${f}: ${r.out}`);
  }
});

test('#160 Go local replace paths resolve per importer and preserve subpackage suffixes', () => {
  const d = project();
  writeAll(d, {
    'go.mod': 'module example.org/app\nrequire imported.local/sdk v0.0.0\nreplace (\n imported.local/sdk => ./libs/shared\n)\n',
    'libs/shared/go.mod': 'module original.local/sdk\n',
    'libs/shared/counter/counter.go': 'package counter\nfunc Count() int { return 1 }\n',
    'consumer/consumer.go': 'package consumer\nimport "imported.local/sdk/counter"\nfunc Value() int { return counter.Count() }\n',
    'consumer/consumer_test.go': 'package consumer\nfunc TestValue() { Value() }\n',
    'other/go.mod': 'module example.org/other\n',
    'other/other.go': 'package other\nimport "imported.local/sdk/counter"\nfunc Value() int { return counter.Count() }\n',
  });
  const r = sdd(d, 'impact', 'libs/shared/counter/counter.go', '--json');
  const reached = JSON.parse(r.out).reachedFiles;
  for (const f of ['consumer/consumer.go', 'consumer/consumer_test.go']) assert.ok(reached.includes(f), r.out);
  assert.ok(!reached.includes('other/other.go'), r.out);
});

test('#161 Go external stubs preserve real colliding files and use the declared package', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = project();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  const real = 'package runtime\n// real production code\nfunc Keep() int { return 73 }\n';
  writeAll(d, {
    'go.mod': 'module example.org/stub\n',
    'internal/runtimev1/runtimev1_stub.go': real,
    'internal/runtimev1/runtimev1_stub2.go': 'package runtime\nfunc KeepToo() int { return 42 }\n',
    'tests/probe_test.go': 'package runtime_test\nimport (\n "testing"\n rt "example.org/stub/internal/runtimev1"\n)\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nfunc TestTEST_CALC_001(t *testing.T) { if rt.NewGauge().Value() != 1 { t.Fatal("wrong") } }\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(path.join(d, 'internal/runtimev1/runtimev1_stub.go'), 'utf8'), real);
  assert.match(r.out, /compile-checked/);
  assert.doesNotMatch(r.out, /still does not compile/);
  const files = fs.readdirSync(path.join(d, 'internal/runtimev1'));
  const generated = files.filter((f) => !['runtimev1_stub.go', 'runtimev1_stub2.go'].includes(f));
  assert.equal(generated.length, 1, r.out);
  assert.match(fs.readFileSync(path.join(d, 'internal/runtimev1', generated[0]), 'utf8'), /^package runtime\b/);
  const build = spawnSync('go', ['test', './...','-run', '^$'], { cwd: d, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
});

test('#161 init checks independent nested Go modules even below another module', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = project();
  writeAll(d, {
    'go.mod': 'module example.org/root\n',
    'root.go': 'package root\n',
    'child/go.mod': 'module example.org/child\n',
    'child/child_test.go': 'package child\nimport "testing"\nfunc TestFailure(t *testing.T) { t.Fatal("nested Go module must be checked") }\n',
    'child/grandchild/go.mod': 'module example.org/grandchild\n',
    'child/grandchild/grandchild.go': 'package grandchild\n',
  });
  const init = sdd(d, 'init');
  assert.equal(init.code, 0, init.out);
  const cfg = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
  assert.deepEqual((cfg.projects ?? []).map((p) => p.root), ['child', 'child/grandchild']);
  assert.ok(cfg.checks.some((c) => c.cmd[0] === 'go'));
  const gate = sdd(d, 'gate');
  assert.equal(gate.code, 1, gate.out);
  assert.match(gate.out, /✗ cmd child:test/);
});

test('#161 Go TestMain early exits cannot provide Red, characterization, Green or Refactor', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = project();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  writeAll(d, {
    'go.mod': 'module example.org/setup\n',
    'probe_test.go': 'package setup\nimport ("testing"; "os")\nfunc TestMain(m *testing.M) { if os.Getenv("SDD_SETUP_EXIT") != "" { if os.Getenv("SDD_SETUP_EXIT") == "fail" { os.Exit(1) }; os.Exit(0) }; os.Exit(m.Run()) }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nfunc TestTEST_CALC_001(t *testing.T) { if os.Getenv("SDD_TARGET_PASS") == "" { t.Fatal("target assertion") } }\n',
  });
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const run = (exit, ...args) => {
    const r = spawnSync('node', [SDD, '--root', d, 'tdd', ...args], { encoding: 'utf8', env: { ...ENV, SDD_SETUP_EXIT: exit } });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  for (const args of [['red', 'TEST-CALC-001'], ['red', 'TEST-CALC-001', '--weak'], ['red', 'TEST-CALC-001', '--characterization', 'setup must still run test']]) {
    const r = run(args.includes('--characterization') ? 'pass' : 'fail', ...args);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no test matched|never ran/);
  }
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  const green = run('pass', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 1, green.out);
  const passed = spawnSync('node', [SDD, '--root', d, 'tdd', 'green', 'TEST-CALC-001'], { encoding: 'utf8', env: { ...ENV, SDD_TARGET_PASS: '1' } });
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  assert.equal(run('pass', 'refactor', 'TEST-CALC-001').code, 1);
});

test('#162 Go annotated subtests cannot borrow failures from siblings or the parent', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  for (const json of [false, true]) {
    const d = project();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    writeAll(d, {
      'go.mod': 'module example.org/subtest\n',
      'probe_test.go': 'package subtest\nimport "testing"\nfunc TestTEST_CALC_001(t *testing.T) {\n t.Run("TEST_CALC_001", func(t *testing.T) {\n // @id TEST-CALC-001 @verifies REQ-CALC-001\n if 1 != 1 { t.Fatal("target assertion") }\n })\n t.Run("unrelated", func(t *testing.T) { t.Fatal("sibling only") })\n t.Fatal("parent only")\n}\n',
    });
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['go', 'test', './...', ...(json ? ['-json'] : []), '-run', '{IDU}(_|$)'], checks: [] }));
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /itself passes|test passed/);
    assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
  }
});

test('#162 Go nested subtest selection is hierarchical and supports comments before t.Run', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = project();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  writeAll(d, {
    'go.mod': 'module example.org/subtest\n',
    'probe_test.go': 'package subtest\nimport ("testing"; "os")\nfunc TestTable(t *testing.T) {\n t.Run("group one", func(t *testing.T) {\n // @id TEST-CALC-001 @verifies REQ-CALC-001\n t.Run("case.+", func(t *testing.T) { if os.Getenv("SDD_TARGET_PASS") == "" { t.Fatal("selected target") } })\n t.Run("caseXX", func(t *testing.T) { t.Fatal("wrong regex sibling") })\n })\n t.Run("other", func(t *testing.T) { t.Fatal("wrong top sibling") })\n}\n',
  });
  sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /selected target/);
  assert.doesNotMatch(r.out, /wrong.*sibling/);
  const green = spawnSync('node', [SDD, '--root', d, 'tdd', 'green', 'TEST-CALC-001'], { encoding: 'utf8', env: { ...ENV, SDD_TARGET_PASS: '1' } });
  assert.equal(green.status, 0, green.stdout + green.stderr);
});

test('#162 Go unresolved dynamic and skipped annotated subtests cannot use parent evidence', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  for (const dynamic of [false, true]) {
    const d = project();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    writeAll(d, {
      'go.mod': 'module example.org/subtest\n',
      'probe_test.go': `package subtest\nimport "testing"\nfunc TestTEST_CALC_001(t *testing.T) {\n name := "target"\n _ = name\n t.Run(${dynamic ? 'name' : '"target"'}, func(t *testing.T) {\n // @id TEST-CALC-001 @verifies REQ-CALC-001\n ${dynamic ? 't.Fatal("dynamic failure")' : 't.Skip("skip target")'}\n })\n t.Fatal("parent failure")\n}\n`,
    });
    sdd(d, 'approve', 'record', 'calc', '--by', 'tester');
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no test matched|never ran/);
  }
});

test('#152 nested --root scopes Git changes to the root and runs project checks', () => {
  const repo = project();
  const d = path.join(repo, 'nested app');
  fs.mkdirSync(d);
  for (const f of ['.sdd', 'add.test.mjs']) fs.renameSync(path.join(repo, f), path.join(d, f));
  fs.writeFileSync(path.join(d, '.sdd/specs/calc.md'), '---\nfeature: calc\ntier: T1\n---\n| REQ-CALC-001 | sum | TEST-CALC-001 |\n');
  impl(d, '(a, b) => a + b');
  fs.mkdirSync(path.join(d, 'src'));
  fs.writeFileSync(path.join(d, 'src/quoted "name".mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(repo, 'outside.mjs'), 'export const unrelated = 1;\n');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({
    testCmd: ['node', '--test', '--test-name-pattern', '{id}', '{file}'],
    checks: [{ name: 'nested', cwd: 'src', cmd: ['node', '-e', 'process.exit(1)'] }],
  }));
  const gate = sdd(d, 'gate', '--changed');
  assert.equal(gate.code, 1, gate.out);
  assert.match(gate.out, /0\/1 tests Red→Green/);
  assert.match(gate.out, /no Green recorded/);
  assert.match(gate.out, /✗ cmd nested/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({
    checks: [{ name: 'paths', cmd: ['node', '-e', 'process.exit(1)'], changedCmd: ['node', '-e', 'console.log(process.argv.slice(1).join("|"));process.exit(1)', '{changedFiles}'] }],
  }));
  const paths = sdd(d, 'gate', '--changed');
  assert.match(paths.out, /src\/quoted "name"\.mjs/);
  assert.doesNotMatch(paths.out, /outside\.mjs|nested app\//);
});

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

test('#155 unresolved review statuses with explanatory suffixes block check and approval', () => {
  const d = project();
  const hash = sdd(d, 'approve', 'prepare', 'calc').out.match(/sha256:([0-9a-f]{64})/)[1];
  for (const status of ['Open (awaiting fix)', 'OPEN: follow up', '**Open** — fix required', 'Pending (review)', 'In progress - incomplete', 'Blocked: dependency']) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `spec: sha256:${hash}\nverdict: pass\nopen: 0\n| R1 | high | add.mjs:1 | ${status} |\n`);
    for (const args of [
      ['review', 'check', '.sdd/review.md', '--feature', 'calc'],
      ['approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md'],
    ]) {
      const r = sdd(d, ...args);
      assert.equal(r.code, 1, `${status}: ${r.out}`);
      assert.match(r.out, /1 Open/);
    }
  }
  assert.equal(fs.existsSync(path.join(d, '.sdd/approvals.json')), false);
});

test('#155 review spec hash must be a matching header, not a substring anywhere in prose', () => {
  const d = project();
  const hash = sdd(d, 'approve', 'prepare', 'calc').out.match(/sha256:([0-9a-f]{64})/)[1];
  const wrong = '0'.repeat(64);
  for (const header of [
    `spec: sha256:${wrong}\nArtifact hash: ${hash}`,
    `Artifact hash: ${hash}`,
    `spec: sha256:${hash.slice(0, 12)}${wrong.slice(12)}`,
    `spec: sha256:${hash.slice(0, 11)}`,
    `spec: sha256:${hash}\nspec: sha256:${wrong}`,
  ]) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `${header}\nverdict: pass\nopen: 0\n`);
    const check = sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc');
    assert.equal(check.code, 1, check.out);
    assert.match(check.out, /spec hash/);
    assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'ai:duck', '--review', '.sdd/review.md').code, 1);
  }
  for (const header of [`spec: sha256:${hash}`, `spec: sha256:${hash.slice(0, 12)}`, `spec ${hash}`]) {
    fs.writeFileSync(path.join(d, '.sdd/review.md'), `${header}\nverdict: pass\nopen: 0\n`);
    assert.equal(sdd(d, 'review', 'check', '.sdd/review.md', '--feature', 'calc').code, 0, header);
  }
});

test('#155 passing characterization Red reports passing evidence, not a failure footer', () => {
  const d = project();
  assert.equal(sdd(d, 'approve', 'record', 'calc', '--by', 'tester').code, 0);
  impl(d, '(a, b) => a + b');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'existing golden fixture');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /fails with|duration_ms/);
  assert.match(r.out, /characterization: existing golden fixture.*test passed/);
  assert.match(r.out, /\[weak\]/);
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

test('#153 JS/TS stubs infer only selected-test methods and imports', () => {
  for (const ext of ['js', 'ts']) {
    const real = 'export class Worker { run() { return 1; } }\n';
    const d = jsStubProject({
      [`src/worker.${ext}`]: real,
      [`test/a.test.${ext}`]: [
        `import { Worker } from '../src/worker.${ext}';`,
        "import * as boxes from '../src/box';",
        '/** @id TEST-A-001 @verifies REQ-A-001 */',
        "test('TEST-A-001', () => { new Worker().run(); new boxes.Box().first(); });",
        '/** @id TEST-A-002 @verifies REQ-A-001 */',
        "test('TEST-A-002', async () => { new Worker().stop(); new boxes.Box().second(); const { extra } = await import('../src/sibling'); extra(); });",
      ].join('\n'),
    });
    const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
    assert.equal(r.code, 0, r.out);
    assert.equal(fs.readFileSync(path.join(d, `src/worker.${ext}`), 'utf8'), real);
    const box = fs.readFileSync(path.join(d, `src/box.${ext}`), 'utf8');
    assert.match(box, /first\(/);
    assert.doesNotMatch(box, /second\(/);
    assert.equal(fs.existsSync(path.join(d, `src/sibling.${ext}`)), false);
  }
});

test('#153 factory return values are not instances of the factory class', () => {
  const real = 'export class Registry { create() { return new Child(); } }\nexport class Child { get() { return 1; } }\n';
  const d = jsStubProject({
    'src/registry.js': real,
    'test/a.test.js': [
      "import { Registry } from '../src/registry.js';",
      'const make = () => new Registry().create();',
      '/** @id TEST-A-001 @verifies REQ-A-001 */',
      "test('TEST-A-001', () => { const child = new Registry().create(); child.get(); const other = make(); other.get(); });",
    ].join('\n'),
  });
  assert.equal(sdd(d, 'tdd', 'stub', 'TEST-A-001').code, 0);
  assert.equal(fs.readFileSync(path.join(d, 'src/registry.js'), 'utf8'), real);
});

test('#153 a missing workspace export entry is created, including conditional subpath exports', () => {
  for (const [exports, spec, file] of [
    ['./src/index.ts', '@repro/lib', 'src/index.ts'],
    [{ import: './src/main.ts' }, '@repro/lib', 'src/main.ts'],
    [{ '.': { import: './src/index.mjs' }, './math': { default: './src/math.mjs' } }, '@repro/lib/math', 'src/math.mjs'],
  ]) {
    const d = jsStubProject({
      'packages/lib/package.json': JSON.stringify({ name: '@repro/lib', exports }),
      'test/a.test.ts': `import { add } from '${spec}';\n/** @id TEST-A-001 @verifies REQ-A-001 */\ntest('TEST-A-001', () => { add(1, 2); });\n`,
    });
    const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
    assert.equal(r.code, 0, r.out);
    assert.match(fs.readFileSync(path.join(d, 'packages/lib', file), 'utf8'), /export function add/);
    assert.doesNotMatch(r.out, /no missing|not stubbed/);
  }
});

test('#153 assert.rejects/throws subjects are ordinary classes; matcher constructors extend Error', () => {
  const d = jsStubProject({
    'test/a.test.js': [
      "import { Worker, Boom, Fault } from '../src/worker.js';",
      '/** @id TEST-A-001 @verifies REQ-A-001 */',
      "test('TEST-A-001', async () => { await assert.rejects(new Worker().run(), /failure/);",
      "assert.throws(() => new Worker().run(), Boom); await assert.rejects(async () => new Worker().run(), Fault); });",
    ].join('\n'),
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  const text = fs.readFileSync(path.join(d, 'src/worker.js'), 'utf8');
  assert.match(text, /class Worker \{/);
  assert.match(text, /class Boom extends Error/);
  assert.match(text, /class Fault extends Error/);
});

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
  cfg.checks = [{ name: 'test', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'] }];
  cfg.projects = [{ root: 'worker', checks: [{ name: 't', cmd: ['node', '-e', '0'], changedCmd: ['node', '-e', '0'] }] }];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  git('add', '-A'); git('commit', '-qm', 'base');
  w('worker/a.py', 'x = 2\n');
  const a = sdd(d, 'gate', '--changed').out;
  assert.match(a, /cmd test: all changed files are inside nested projects/);
  assert.match(a, /✓ cmd worker:t/);
  git('commit', '-qam', 'a');
  w('contract/s.json', '["x"]\n');
  const b = sdd(d, 'gate', '--changed').out;
  assert.match(b, /✓ cmd test/);
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

test('#154 an ID-bearing filename is not proof of an executed Node test (spec and TAP)', () => {
  for (const reporter of ['spec', 'tap']) {
    const d = mini(T1SPEC, { 'TEST-A-001.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n// @id TEST-A-001 @verifies REQ-A-001\ntest('TEST-A-001 x', () => assert.equal(1, 2));\n" });
    const cmd = ['node', '--test', `--test-reporter=${reporter}`, '--test-name-pattern', '{id}', '{file}'];
    setCmd(d, cmd);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
    setCmd(d, cmd.map((x) => x === '{id}' ? 'MATCHES-NOTHING' : x));
    for (const sub of ['green', 'red']) {
      const r = sdd(d, 'tdd', sub, 'TEST-A-001', '--characterization', 'no implementation needed');
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /no test matched/, r.out);
    }
    const ledger = fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n');
    assert.equal(ledger.length, 1, 'rejected no-match runs write no evidence');
  }
});

test('#154 TODO-only Node assertions cannot establish Red, Green or Refactor evidence', () => {
  for (const reporter of ['spec', 'tap']) {
    const d = mini(T1SPEC, {
      'a.test.mjs': [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import fs from 'node:fs';",
        '/** @id TEST-A-001 @verifies REQ-A-001 */',
        "test('TEST-A-001 assertion', { todo: fs.existsSync('.sdd/todo') }, () => assert.equal(fs.existsSync('.sdd/pass'), true));",
      ].join('\n'),
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'));
    cfg.testCmd = ['node', '--test', `--test-reporter=${reporter}`, '--test-name-pattern', '{id}', '{file}'];
    cfg.checks = [{ name: 'test', cmd: ['node', '--test', `--test-reporter=${reporter}`, 'a.test.mjs'] }];
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify(cfg));
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
    fs.writeFileSync(path.join(d, '.sdd/pass'), '');
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
    fs.writeFileSync(path.join(d, '.sdd/todo'), '');
    for (const failing of [false, true]) {
      if (failing) fs.rmSync(path.join(d, '.sdd/pass'));
      for (const sub of ['red', 'green', 'refactor']) {
        const r = sdd(d, 'tdd', sub, 'TEST-A-001', '--characterization', 'TODO cannot count');
        assert.equal(r.code, 1, r.out);
      }
      const gate = sdd(d, 'gate');
      assert.equal(gate.code, 2, gate.out);
      assert.match(gate.out, /INCOMPLETE/);
    }
    assert.equal(fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n').length, 2);
  }
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

test('#156 pytest skipped/xfail-only runs cannot establish evidence or full gate PASS', { skip: spawnSync('python3', ['-m', 'pytest', '--version']).status !== 0 }, () => {
  for (const [verdict, verbosity] of [['skip', '-q'], ['xfail', '-q'], ['skip', '-qq'], ['xfail', '-qq']]) {
    const d = mini(T1SPEC.replace('one shall hold.', 'one shall hold. (test-only)'), {
      'test_a.py': [
        'from pathlib import Path',
        'import pytest',
        '# @id TEST-A-001 @verifies REQ-A-001',
        'def test_a_001():',
        '    if Path(".sdd/nonexecuted").exists():',
        `        pytest.${verdict}("not a passing assertion")`,
        '    assert Path(".sdd/pass").exists()',
      ].join('\n'),
    });
    const cp = path.join(d, '.sdd/config.json');
    const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
    cfg.testCmd = ['python3', '-m', 'pytest', verbosity, '{file}', '-k', '{idu}'];
    cfg.checks = [{ name: 'test', cmd: ['python3', '-m', 'pytest', verbosity, 'test_a.py'] }];
    fs.writeFileSync(cp, JSON.stringify(cfg));
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
    fs.writeFileSync(path.join(d, '.sdd/pass'), '');
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
    fs.writeFileSync(path.join(d, '.sdd/nonexecuted'), '');
    for (const sub of ['red', 'green', 'refactor']) {
      const r = sdd(d, 'tdd', sub, 'TEST-A-001', '--characterization', 'cannot implement a skipped test');
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /no test matched|skipped/);
    }
    const gate = sdd(d, 'gate');
    assert.equal(gate.code, 2, gate.out);
    assert.match(gate.out, /INCOMPLETE/);
    assert.equal(fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n').length, 2);
  }
});

test('#156 pytest nonexecution summaries are recognized without rejecting mixed passing runs', () => {
  for (const summary of [
    '1 skipped in 0.01s',
    '1 xfailed in 0.01s',
    '================== 1 skipped, 2 xfailed, 1 warning in 0.02s ==================',
    'ssx                                                                      [100%]',
  ]) {
    const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, ['node', '-e', `console.log(${JSON.stringify(summary)})`]);
    const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'skipped suite');
    assert.equal(r.code, 1, r.out);
    assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
  }
  for (const summary of [
    '1 passed, 2 skipped, 1 xfailed in 0.01s',
    '1 xpassed, 1 skipped in 0.01s',
    '1 skipped in 0.01s\n1 passed in 0.02s',
    '.sx                                                                      [100%]',
  ]) {
    const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
    setCmd(d, ['node', '-e', `console.log(${JSON.stringify(summary)})`]);
    const r = sdd(d, 'tdd', 'green', 'TEST-A-001');
    assert.equal(r.code, 0, r.out);
  }
});

test('#156 a scoped pytest skipped-only check falls back to the full check', () => {
  const d = mini(T1SPEC.replace('one shall hold.', 'one shall hold. (test-only)'), { 'a.test.mjs': jsTest() }, FAIL);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  setCmd(d, PASS);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
  const cp = path.join(d, '.sdd/config.json');
  const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
  cfg.checks = [{
    name: 'test',
    cmd: ['node', '-e', 'console.log("1 passed in 0.01s")'],
    changedCmd: ['node', '-e', 'console.log("1 skipped in 0.01s")'],
  }];
  fs.writeFileSync(cp, JSON.stringify(cfg));
  const r = sdd(d, 'gate', '--changed');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /scoped run.*running the full check/);
});

test('#156 fatal Python errors and signal-terminated runners are rejected even with --weak', () => {
  for (const cmd of [
    ['node', '-e', 'console.log("Fatal Python error: Aborted\\nAssertionError: not evidence");process.exit(1)'],
    ['node', '-e', 'process.kill(process.pid, "SIGTERM")'],
  ]) {
    const d = mini(T1SPEC, { 'a.test.mjs': jsTest() }, FAIL);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
    setCmd(d, PASS);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-A-001').code, 0);
    setCmd(d, cmd);
    for (const sub of ['red', 'green', 'refactor']) {
      const r = sdd(d, 'tdd', sub, 'TEST-A-001', '--weak');
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /runner process crashed/);
    }
    assert.equal(fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n').length, 2);
  }
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

const batch2Source = (file, body) => {
  const d = approved();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  fs.mkdirSync(path.dirname(path.join(d, file)), { recursive: true });
  fs.writeFileSync(path.join(d, file), body);
  return d;
};
const batch2Run = (d, runner, body, cmd, ...args) => {
  const bin = path.join(d, 'tools');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, runner), '#!/bin/sh\n' + body, { mode: 0o755 });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: cmd, checks: [] }));
  const r = spawnSync('node', [SDD, '--root', d, ...args], { encoding: 'utf8', env: { ...ENV, PATH: `${bin}:${ENV.PATH}` } });
  return { code: r.status, out: r.stdout + r.stderr };
};

for (const [issue, label, file, pre, deps, changed] of [
  [206, 'Cargo dev-dependency', 'client/tests/t.rs', 'use oracle::expected;', {
    'Cargo.toml': '[workspace]\nmembers=["client","oracle"]\nresolver="2"\n',
    'client/Cargo.toml': '[package]\nname="client"\nversion="0.1.0"\n[dev-dependencies]\noracle={path="../oracle"}\n',
    'client/src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn value() -> i32 { 0 }\n',
    'oracle/Cargo.toml': '[package]\nname="oracle"\nversion="0.1.0"\n',
    'oracle/src/lib.rs': 'mod deep;\npub use deep::expected;\n',
    'oracle/src/deep.rs': 'pub fn expected() -> i32 { 7 }\n',
  }, 'oracle/src/deep.rs'],
  [208, 'Maven module CSV', 'worker/src/test/java/probe/T.java', 'package probe;\nclass T {\n@CsvFileSource(files="oracle.csv")', { 'pom.xml': '<project/>', 'worker/pom.xml': '<project/>', 'worker/oracle.csv': '7,7\n' }, 'worker/oracle.csv'],
  [208, 'Gradle module CSV', 'engine/src/test/java/probe/T.java', 'package probe;\nclass T {\n@CsvFileSource(files={"oracle.csv"})', { 'build.gradle': '', 'engine/build.gradle.kts': '', 'engine/oracle.csv': '7,7\n' }, 'engine/oracle.csv'],
  [208, 'fully qualified MethodSource', 'tests/probe/T.java', 'package probe;\nclass T {\n@MethodSource({"oracle.Expected#cases"})', { 'tests/oracle/Expected.java': 'package oracle;\nclass Expected { static int cases() { return Deep.value(); } }\n', 'tests/oracle/Deep.java': 'package oracle;\nclass Deep { static int value() { return 7; } }\n' }, 'tests/oracle/Deep.java'],
  [210, 'joined GCC include', 'tests/t.cpp', '', { 'build/compile_commands.json': JSON.stringify([{ directory: '.', file: 'tests/t.cpp', arguments: ['c++', '-includetests/oracle.hpp', '-c', 'tests/t.cpp'] }]), 'tests/oracle.hpp': '#define EXPECTED 7\n' }, 'tests/oracle.hpp'],
  [210, 'joined GCC imacros', 'tests/t.cpp', '', { 'build/compile_commands.json': JSON.stringify([{ directory: '.', file: 'tests/t.cpp', arguments: ['c++', '-imacrostests/oracle.hpp', '-c', 'tests/t.cpp'] }]), 'tests/oracle.hpp': '#define EXPECTED 7\n' }, 'tests/oracle.hpp'],
  [210, 'transitive TU compiler context', 'tests/t.cpp', '#include "bridge.hpp"', { 'build/compile_commands.json': JSON.stringify([{ directory: '.', file: 'tests/t.cpp', arguments: ['c++', '-I', 'headers', '-DORACLE_HEADER="oracle.hpp"', '-c', 'tests/t.cpp'] }]), 'tests/bridge.hpp': '#include ORACLE_HEADER\n', 'headers/oracle.hpp': '#define EXPECTED 7\n' }, 'headers/oracle.hpp'],
  [211, 'fully qualified PHP static class', 'tests/T.php', '<?php\nnamespace Tests;\nclass T {\npublic function expected() { return \\Probe\\Oracle\\Expected::value(); }', { 'src/Expected.php': '<?php\nnamespace Probe\\Oracle;\nclass Expected { public static function value() { return 7; } }\n' }, 'src/Expected.php'],
  [211, 'fully qualified PHP constructor', 'tests/T.php', '<?php\nnamespace Tests;\nclass T {\npublic function expected() { return new \\Probe\\Oracle\\Expected(); }', { 'src/Expected.php': '<?php\nnamespace Probe\\Oracle;\nclass Expected { public int $value = 7; }\n' }, 'src/Expected.php'],
  [211, 'aliased PHP function', 'tests/T.php', '<?php\nnamespace Tests;\nuse function Probe\\Oracle\\height as expectedHeight;\nclass T {', { 'src/functions.php': '<?php\nnamespace Probe\\Oracle;\nfunction height() { return 7; }\n' }, 'src/functions.php'],
  [211, 'grouped PHP functions', 'tests/T.php', '<?php\nnamespace Tests;\nuse function Probe\\Oracle\\{height as expectedHeight, width};\nclass T {', { 'src/functions.php': '<?php\nnamespace Probe\\Oracle;\nfunction height() { return 7; }\nfunction width() { return 1; }\n' }, 'src/functions.php'],
  [211, 'mixed grouped PHP function', 'tests/T.php', '<?php\nnamespace Tests;\nuse Probe\\Oracle\\{function height as expectedHeight};\nclass T {', { 'src/functions.php': '<?php\nnamespace Probe\\Oracle;\nfunction height() { return 7; }\n' }, 'src/functions.php'],
  [212, 'MSTest assembly initialize', 'tests/T.cs', 'namespace Tests;\nclass T {', { 'tests/Hooks.cs': 'namespace Support;\nclass Hooks { [Microsoft.VisualStudio.TestTools.UnitTesting.AssemblyInitializeAttribute]\npublic static void Init() { int expected = 7; } }\n' }, 'tests/Hooks.cs'],
  [212, 'MSTest aliased assembly cleanup', 'tests/T.cs', 'namespace Tests;\nclass T {', { 'tests/Hooks.cs': 'using finish = Microsoft.VisualStudio.TestTools.UnitTesting.AssemblyCleanupAttribute;\nnamespace Support;\nclass Hooks { [finish]\npublic static void Cleanup() { int expected = 7; } }\n' }, 'tests/Hooks.cs'],
  [212, 'lowercase C# type alias', 'tests/T.cs', 'using check = Probe.Oracle;\nnamespace Tests;\nclass T {', { 'src/Oracle.cs': 'namespace Probe;\nclass Oracle { public static int Expected => 7; }\n' }, 'src/Oracle.cs'],
]) {
  test(`#${issue} ${label} changes and deletions invalidate oracle evidence`, () => {
    const target = '// @id TEST-CALC-001 @verifies REQ-CALC-001\n' + (file.endsWith('.rs') ? '#[test]\nfn test_calc_001() { assert_eq!(expected(), 2); }\n' : file.endsWith('.php') ? 'public function test_calc_001(): void { self::assertSame(2, expectedHeight()); }\n}\n' : file.endsWith('.java') ? '@Test\nvoid test_calc_001() { assertTrue(true); }\n}\n' : file.endsWith('.cs') ? '[TestMethod]\nvoid test_calc_001() { Assert.AreEqual(2, check.Expected); }\n}\n' : 'void test_calc_001() { CHECK(EXPECTED); }\n');
    const d = batch2Source(file, pre + '\n' + target);
    writeAll(d, deps);
    fakeOut(d, 'AssertionError: oracle');
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, changed), deps[changed].replace('7', '2'));
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
    fs.rmSync(path.join(d, changed));
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1);
  });
}

for (const marker of ['const DOC: &str = "#[cfg(test)]";', '// #[cfg(test)]', 'const DOC: &str = r#"#[cfg(test)]"#;']) {
  test(`#206 literal/comment cfg(test) does not hide a preceding oracle: ${marker}`, () => {
    const body = 'fn expected() -> i32 { 7 }\n' + marker + '\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(expected(), 2); }\n';
    const d = batch2Source('tests/t.rs', body);
    fakeOut(d, 'AssertionError: target');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, 'tests/t.rs'), body.replace('{ 7 }', '{ 2 }'));
    fakeOut(d, 'pass', 0);
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
  });
}

for (const binding of ['shared.workspace=true', 'shared={workspace=true}', '[dependencies.shared]\nworkspace=true']) {
  test(`#207 Cargo inherited alias impact resolves ${binding}`, () => {
    const d = approved();
    writeAll(d, {
      'Cargo.toml': '[workspace]\nmembers=["base","client"]\n[workspace.dependencies]\nshared={package="actual-base",path="base"}\n',
      'base/Cargo.toml': '[package]\nname="actual-base"\nversion="0.1.0"\n',
      'base/src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn value() -> i32 { 7 }\n',
      'client/Cargo.toml': '[package]\nname="client"\nversion="0.1.0"\n[dependencies]\n' + binding + '\n',
      'client/src/lib.rs': 'use shared::value;\n// @id CODE-CLIENT-001 @implements REQ-CLIENT-001\npub fn compute() -> i32 { value() }\n',
      'client/tests/t.rs': 'use client::compute;\n// @id TEST-CLIENT-001 @verifies REQ-CLIENT-001\n#[test]\nfn test_client_001() { assert_eq!(compute(), 7); }\n',
      '.sdd/specs/client.md': '---\nfeature: client\ntier: T1\n---\nREQ-CLIENT-001: When called, the system shall compute.\n',
    });
    const result = sdd(d, 'impact', 'REQ-CALC-001', '--json');
    assert.equal(result.code, 0, result.out);
    const impact = JSON.parse(result.out);
    assert.ok(impact.reachedFiles.includes('client/src/lib.rs'), result.out);
    assert.ok(impact.reachedFiles.includes('client/tests/t.rs'), result.out);
    assert.ok(impact.otherReqs.some((o) => o.req === 'REQ-CLIENT-001'), result.out);
  });
}

test('#207 Rust raw identifier modules retain exact scopes and ordinary module filenames', { skip: !has130('cargo') }, () => {
  const d = batch2Source('src/type.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(crate::answer(), 7); }\n');
  writeAll(d, { 'Cargo.toml': '[package]\nname="raw-probe"\nversion="0.1.0"\nedition="2021"\n', 'src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn answer() -> i32 { 0 }\n#[cfg(test)] mod r#type;\n' });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '{idu}'], checks: [] }));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  fs.writeFileSync(path.join(d, 'src/lib.rs'), rd130(d, 'src/lib.rs').replace('{ 0 }', '{ 7 }'));
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
});

test('#207 cfg-exclusive identical Rust module owner tuples deduplicate', { skip: !has130('cargo') }, () => {
  const d = batch2Source('src/cases.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(crate::answer(), 7); }\n');
  writeAll(d, { 'Cargo.toml': '[package]\nname="cfg-probe"\nversion="0.1.0"\nedition="2021"\n', 'src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn answer() -> i32 { 0 }\n#[cfg(all(test,unix))]\n#[path="cases.rs"] mod platform;\n#[cfg(all(test,windows))]\n#[path="cases.rs"] mod platform;\n' });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '--lib', '{idu}'], checks: [] }));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  fs.writeFileSync(path.join(d, 'src/lib.rs'), rd130(d, 'src/lib.rs').replace('{ 0 }', '{ 7 }'));
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
});

test('#209 JUnit default interface tests resolve concrete runtime owners and reject ambiguity', () => {
  const d = batch2Source('tests/probe/Contract.java', 'package probe;\ninterface Contract {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test\ndefault void test_calc_001() { assertEquals(1, 2); }\n}\n');
  writeAll(d, { 'tests/probe/ContractTest.java': 'package probe;\nclass ContractTest implements Contract {}\n' });
  const red = batch2Run(d, 'mvn', 'printf "%s\\n" "$@" > args.txt\necho "SDD-TEST probe.ContractTest test_calc_001 FAILURE"\necho "AssertionError: contract"\nexit 1\n', ['mvn', 'test', '-Dtest={idu}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  assert.match(rd130(d, 'args.txt'), /-Dtest=probe.ContractTest#test_calc_001/);
  writeAll(d, { 'tests/probe/OtherTest.java': 'package probe;\nclass OtherTest implements Contract {}\n' });
  const ambiguous = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(ambiguous.code, 1, ambiguous.out);
  assert.match(ambiguous.out, /Java.*ownership.*ambiguous|ambiguous.*Java.*owner/i);
  assert.doesNotMatch(ambiguous.out, /no test matched/);
});

test('#210 compiler macro contexts do not leak across translation units', () => {
  const d = batch2Source('tests/one.cpp', '#include "bridge.hpp"\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { CHECK(EXPECTED); }\n');
  writeAll(d, {
    'tests/two.cpp': '#include "bridge.hpp"\n// @id TEST-CALC-002 @verifies REQ-CALC-001\nvoid test_calc_002() { CHECK(EXPECTED); }\n',
    'tests/bridge.hpp': '#include ORACLE_HEADER\n',
    'headers/one.hpp': '#define EXPECTED 7\n', 'headers/two.hpp': '#define EXPECTED 8\n',
    'build/compile_commands.json': JSON.stringify(['one', 'two'].map((n) => ({ directory: '.', file: `tests/${n}.cpp`, arguments: ['c++', '-Iheaders', `-DORACLE_HEADER="${n}.hpp"`] }))),
  });
  fakeOut(d, 'AssertionError: target');
  for (const id of ['TEST-CALC-001', 'TEST-CALC-002']) assert.equal(sdd(d, 'tdd', 'red', id).code, 0);
  fakeOut(d, 'pass', 0);
  for (const id of ['TEST-CALC-001', 'TEST-CALC-002']) assert.equal(sdd(d, 'tdd', 'green', id).code, 0);
  fs.writeFileSync(path.join(d, 'headers/two.hpp'), '#define EXPECTED 9\n');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-002').code, 1);
});

test('#212 assembly lifecycle support is restricted to the owning MSTest project', () => {
  const d = batch2Source('tests/T.cs', 'namespace Tests;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[TestMethod]\nvoid test_calc_001() { Assert.IsTrue(true); }\n}\n');
  writeAll(d, {
    'tests/Tests.csproj': '<Project Sdk="Microsoft.NET.Sdk"/>',
    'other/Other.csproj': '<Project Sdk="Microsoft.NET.Sdk"/>',
    'tests/Hooks.cs': 'namespace Hooks;\nclass Init { [AssemblyInitialize] public static void Seed() { int expected = 7; } }\n',
    'other/Hooks.cs': 'namespace Hooks;\nclass Init { [AssemblyInitialize] public static void Seed() { int expected = 8; } }\n',
  });
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  fs.writeFileSync(path.join(d, 'other/Hooks.cs'), rd130(d, 'other/Hooks.cs').replace('8', '9'));
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'tests/Hooks.cs'), rd130(d, 'tests/Hooks.cs').replace('7', '2'));
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1);
});

for (const [label, file, pre, deps, changed] of [
  ['Rust Unicode path', 'tests/t.rs', '#[path = "expected\\u{2e}rs"] mod oracle;', { 'tests/expected.rs': 'pub fn expected() -> i32 { 7 }\n' }, 'tests/expected.rs'],
  ['Rust intervening attribute', 'tests/t.rs', '#[path = "expected.rs"]\n#[allow(dead_code)]\nmod oracle;', { 'tests/expected.rs': 'pub fn expected() -> i32 { 7 }\n' }, 'tests/expected.rs'],
  ['C++ macro', 'tests/t.cpp', '#define ORACLE_FILE "oracle.hpp"\n#include ORACLE_FILE', { 'tests/oracle.hpp': '#define EXPECTED 7\n' }, 'tests/oracle.hpp'],
  ['C++ fragment', 'tests/t.cpp', '#include "support.inc"', { 'tests/support.inc': '#include "oracle.hpp"\n', 'tests/oracle.hpp': '#define EXPECTED 7\n' }, 'tests/oracle.hpp'],
  ['C++ forced include', 'tests/t.cpp', '', { 'build/compile_commands.json': JSON.stringify([{ directory: '.', file: 'tests/t.cpp', arguments: ['c++', '-include', 'tests/oracle.hpp', '-c', 'tests/t.cpp'] }]), 'tests/oracle.hpp': '#define EXPECTED 7\n' }, 'tests/oracle.hpp'],
  ['C++ include-path forced fragment', 'tests/t.cpp', '', { 'build/compile_commands.json': JSON.stringify([{ directory: '.', file: 'tests/t.cpp', arguments: ['c++', '-I', 'headers', '-include', 'support.inc', '-c', 'tests/t.cpp'] }]), 'headers/support.inc': '#include "oracle.hpp"\n', 'headers/oracle.hpp': '#define EXPECTED 7\n' }, 'headers/oracle.hpp'],
  ['Java same package', 'src/test/java/probe/T.java', 'package probe;\nclass T {\nOracle expected;', { 'src/test/java/probe/Oracle.java': 'package probe;\nclass Oracle { int expected() { return 7; } }\n' }, 'src/test/java/probe/Oracle.java'],
  ['Java CSV resource', 'src/test/java/probe/T.java', 'package probe;\nclass T {\n@CsvFileSource(resources = "/oracle.csv")', { 'src/test/resources/oracle.csv': '7,7\n' }, 'src/test/resources/oracle.csv'],
  ['Java CSV file', 'src/test/java/probe/T.java', 'package probe;\nclass T {\n@CsvFileSource(files = "oracle.csv")', { 'oracle.csv': '7,7\n' }, 'oracle.csv'],
  ['PHP same namespace', 'tests/T.php', '<?php\nnamespace Probe;\nclass T {\npublic function helper() { return Oracle::expected(); }', { 'tests/Oracle.php': '<?php\nnamespace Probe;\nclass Oracle { public static function expected() { return 7; } }\n' }, 'tests/Oracle.php'],
  ['xUnit string collection', 'tests/T.cs', 'namespace Probe;\n[Collection("billing")]\nclass T {', { 'tests/Fixture.cs': 'namespace Probe;\n[CollectionDefinition("billing")]\nclass Billing : ICollectionFixture<Setup> {}\nclass Setup { int oracle = 7; }\n' }, 'tests/Fixture.cs'],
  ['NUnit namespace setup', 'tests/T.cs', 'namespace Probe.Inner;\nclass T {', { 'tests/Fixture.cs': 'namespace Probe;\n[SetUpFixture]\nclass Setup { [OneTimeSetUp] void Init() { int oracle = 7; } }\n' }, 'tests/Fixture.cs'],
  ['Julia joinpath', 'test/t.jl', 'include(joinpath(@__DIR__, "support", "oracle.jl"))', { 'test/support/oracle.jl': 'expected() = 7\n' }, 'test/support/oracle.jl'],
  ['Julia qualified include', 'test/t.jl', 'Base.include(@__MODULE__, "oracle.jl")', { 'test/oracle.jl': 'expected() = 7\n' }, 'test/oracle.jl'],
]) {
  test(`#199 ${label} protects changed and deleted oracle dependencies`, () => {
    const target = file.endsWith('.jl') ? '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test value() == expected()\nend\n'
      : '// @id TEST-CALC-001 @verifies REQ-CALC-001\n' + (file.endsWith('.rs') ? '#[test]\nfn test_calc_001() { assert!(true); }\n' : file.endsWith('.php') ? 'public function test_calc_001(): void { self::assertTrue(true); }\n}\n' : file.endsWith('.java') ? '@Test\nvoid test_calc_001() { assertTrue(true); }\n}\n' : file.endsWith('.cs') ? '[Test]\nvoid test_calc_001() { Assert.True(true); }\n}\n' : 'void test_calc_001() { CHECK(1); }\n');
    const d = batch2Source(file, pre + '\n' + target);
    writeAll(d, deps);
    fakeOut(d, 'AssertionError: oracle');
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, changed), deps[changed].replace('7', '2'));
    assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
    fs.rmSync(path.join(d, changed));
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1);
  });
}

for (const [file, pre] of [['t.cpp', '#include ORACLE_UNKNOWN'], ['t.jl', 'include(oracle_path())'], ['T.java', 'class T {\n@CsvFileSource(resources = RESOURCE)']]) {
  test(`#199 ${file} unresolved oracle input refuses evidence`, () => {
    const target = file.endsWith('.jl') ? '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test true\nend\n' : '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() {}\n';
    const d = batch2Source(file, pre + '\n' + target);
    fakeOut(d, 'AssertionError: oracle');
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 1, red.out);
    assert.match(red.out, /unresolved.*oracle/i);
    assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
  });
}

test('#204 Julia character literals preserve sibling isolation and selected-body protection', () => {
  const body = "# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset \"TEST-CALC-001\" begin\n@test '(' == '('\n@test '\\'' == '\\''\n@test value() == 2\nend\n# @id TEST-OTHER-001 @verifies REQ-CALC-001\n@testset \"TEST-OTHER-001\" begin\n@test 4 == 4\nend\n";
  const d = batch2Source('t.jl', body);
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 't.jl'), body.replace('4 == 4', '5 == 5'));
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 't.jl'), body.replace('value() == 2', 'value() == 3'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#203 PHP readonly classes retain cross-feature impact edges', () => {
  const d = approved();
  writeAll(d, {
    'src/Value.php': '<?php\nnamespace Probe;\n// @id CODE-VALUE-001 @implements REQ-CALC-001\nfinal readonly class Value {}\n',
    'src/Reader.php': '<?php\nnamespace Client;\nuse Probe\\Value;\nclass Reader {}\n',
  });
  const result = sdd(d, 'impact', 'src/Value.php', '--json');
  assert.equal(result.code, 0, result.out);
  assert.ok(JSON.parse(result.out).reachedFiles.includes('src/Reader.php'), result.out);
});

test('#205 generic NUnit parameterized TRX rows aggregate without accepting longer siblings', () => {
  const d = batch2Source('T.cs', 'namespace Probe;\n[TestFixture(typeof(int))]\nclass Generic<T> {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[TestCase(1)]\n[TestCase(2)]\npublic void test_calc_001(int value) { Assert.AreEqual(value, Actual(value)); }\n}\n');
  writeAll(d, { 'T.csproj': '<Project/>' });
  const trx = (outcome) => `<TestRun><TestDefinitions><UnitTest id="one"><TestMethod className="Probe.Generic&lt;System.Int32&gt;" name="test_calc_001(1)"/></UnitTest><UnitTest id="two"><TestMethod className="Probe.Generic&lt;System.Int32&gt;" name="test_calc_001(2)"/></UnitTest><UnitTest id="sibling"><TestMethod className="Probe.Generic&lt;System.Int32&gt;" name="test_calc_001_extra(2)"/></UnitTest></TestDefinitions><Results><UnitTestResult testId="one" outcome="Passed"/><UnitTestResult testId="two" outcome="${outcome}"/><UnitTestResult testId="sibling" outcome="Failed"/></Results></TestRun>`;
  const run = (outcome, exit, ...args) => batch2Run(d, 'dotnet', `mkdir -p .sdd/results\nprintf '%s' '${trx(outcome)}' > .sdd/results/sdd-target.trx\necho "Expected is <2>"\nexit ${exit}\n`, ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], ...args);
  const red = run('Failed', 1, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  assert.equal(run('Failed', 1, 'tdd', 'green', 'TEST-CALC-001').code, 1);
  assert.equal(run('Passed', 0, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.equal(run('Failed', 1, 'tdd', 'refactor', 'TEST-CALC-001').code, 1);
});

test('#200 Rust include-owned tests retain lexical modules and reject ambiguous executables', { skip: !has130('cargo') }, () => {
  const body = '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(crate::answer(), 7); }\n';
  const d = batch2Source('support/cases.rs', body);
  writeAll(d, {
    'Cargo.toml': '[package]\nname="include-probe"\nversion="0.1.0"\nedition="2021"\n',
    'src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn answer() -> i32 { 0 }\n#[cfg(test)] mod embedded { include!("../support/cases.rs"); }\n',
  });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '{idu}'], checks: [] }));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  const entry = JSON.parse(rd130(d, '.sdd/tdd.jsonl').trim().split('\n')[0]);
  assert.equal(entry.weak, undefined);
  writeAll(d, { 'src/main.rs': 'fn main() {}\nfn answer() -> i32 { 8 }\n#[cfg(test)] mod embedded { include!("../support/cases.rs"); }\n' });
  const ambiguous = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(ambiguous.code, 1, ambiguous.out);
  assert.match(ambiguous.out, /ownership is ambiguous/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '--lib', '{idu}'], checks: [] }));
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'src/lib.rs'), rd130(d, 'src/lib.rs').replace('{ 0 }', '{ 7 }'));
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
});

test('#202 Git-less Cargo members receive imported missing-module stubs without replacing libraries', { skip: !has130('cargo') }, () => {
  const d = batch2Source('consumer/tests/probe.rs', 'use subject::fresh::count;\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(count(), 3); }\n');
  writeAll(d, {
    'Cargo.toml': '[workspace]\nmembers=["subject","consumer"]\nresolver="2"\n',
    'subject/Cargo.toml': '[package]\nname="subject"\nversion="0.1.0"\nedition="2021"\n',
    'subject/src/lib.rs': 'pub fn existing() -> i32 { 1 }\n',
    'consumer/Cargo.toml': '[package]\nname="consumer"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nsubject={path="../subject"}\n',
    'consumer/src/lib.rs': 'pub fn preserved() -> i32 { 2 }\n',
  });
  fs.rmSync(path.join(d, '.git'), { recursive: true });
  const stub = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(stub.code, 0, stub.out);
  assert.match(rd130(d, 'subject/src/fresh.rs'), /pub fn count/);
  assert.match(rd130(d, 'subject/src/lib.rs'), /pub fn existing[\s\S]*pub mod fresh;/);
  assert.equal(rd130(d, 'consumer/src/lib.rs'), 'pub fn preserved() -> i32 { 2 }\n');
});

test('#200 workspace-root included annotations resolve through package and target selection', { skip: !has130('cargo') }, () => {
  const d = batch2Source('support/cases.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(crate::answer(), 7); }\n');
  writeAll(d, {
    'Cargo.toml': '[workspace]\nmembers=["one","two"]\nresolver="2"\n',
    'one/Cargo.toml': '[package]\nname="one"\nversion="0.1.0"\nedition="2021"\n',
    'two/Cargo.toml': '[package]\nname="two"\nversion="0.1.0"\nedition="2021"\n',
    'one/src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn answer() -> i32 { 7 }\n#[cfg(test)] mod embedded { include!("../../support/cases.rs"); }\n',
    'two/src/lib.rs': 'pub fn answer() -> i32 { 0 }\n#[cfg(test)] mod embedded { include!("../../support/cases.rs"); }\n',
  });
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '{idu}'], checks: [] }));
  const ambiguous = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(ambiguous.code, 1, ambiguous.out);
  assert.match(ambiguous.out, /ownership is ambiguous/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '-p', 'one', '--lib', '{idu}'], checks: [] }));
  const passing = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(passing.code, 1, passing.out);
  assert.match(passing.out, /test passed/);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['cargo', 'test', '-p', 'two', '--lib', '{idu}'], checks: [] }));
  const failing = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(failing.code, 0, failing.out);
});

for (const [version, option] of [['12.5.38', '--do-not-cache-result'], ['13.3.9', '--do-not-cache-result'], ['13.4.1', '--do-not-record-test-run-history'], ['14.0.0', '--do-not-record-test-run-history']]) {
  test(`#203 PHPUnit ${version} autodetect uses compatible result-history option`, () => {
    const d = approved();
    writeAll(d, { 'composer.json': '{}', 'vendor/bin/phpunit': `#!/bin/sh\necho 'PHPUnit ${version}'\n` });
    fs.chmodSync(path.join(d, 'vendor/bin/phpunit'), 0o755);
    const init = sdd(d, 'init');
    assert.equal(init.code, 0, init.out);
    const cfg = JSON.parse(rd130(d, '.sdd/config.json'));
    assert.ok(cfg.testCmd.includes(option));
    assert.ok(cfg.checks[0].cmd.includes(option));
  });
}

test('#204 aliased standard Julia nested testsets expose passing and failing targets', { skip: !has130('julia') }, () => {
  const body = 'import Test as JT\nJT.@testset "outer" begin\n# @id TEST-CALC-001 @verifies REQ-CALC-001\nJT.@testset "TEST-CALC-001" begin\nJT.@test 1 == 2\nend\nend\n';
  const d = batch2Source('t.jl', body);
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['julia', '--compile=min', '--project=.', '{file}'], checks: [] }));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  // Characterization proves passing nested visibility independently of assertion-body changes.
  fs.writeFileSync(path.join(d, 't.jl'), body.replace('1 == 2', '2 == 2'));
  const passing = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'alias visibility');
  assert.equal(passing.code, 0, passing.out);
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
});

for (const [file, pre, subject, stub, implementation] of [
  ['src/test/java/probe/T.java', 'package probe;\nimport static probe.Subject.value;\nclass T {', 'src/main/java/probe/Subject.java', 'package probe;\npublic class Subject { public static int value() { return 0; } }\n', 'package probe;\n// @id CODE-CALC-001 @implements REQ-CALC-001\npublic class Subject { public static int value() { return 7; } }\n'],
  ['test/t.jl', 'include("../src/answer.jl")', 'src/answer.jl', 'value() = 0\n', '# @id CODE-CALC-001 @implements REQ-CALC-001\nvalue() = 7\n'],
]) {
  test(`#201 ${file} handwritten subject promotion diagnoses ownership, never silently drops an oracle`, () => {
    const target = file.endsWith('.jl') ? '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test value() == 7\nend\n' : '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { value(); }\n}\n';
    const d = batch2Source(file, pre + '\n' + target);
    writeAll(d, { [subject]: stub });
    fakeOut(d, 'AssertionError: subject');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, subject), implementation);
    fakeOut(d, 'pass', 0);
    const rejected = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(rejected.code, 1, rejected.out);
    assert.match(rejected.out, /production ownership changed since Red/);
    assert.match(rejected.out, /Annotate handwritten production subjects before Red/);
    fs.writeFileSync(path.join(d, subject), implementation.replace('7', '0'));
    fakeOut(d, 'AssertionError: subject');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, subject), implementation);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  });
}

for (const [label, file, body, manifests, subject, implementation] of [
  ['Java', 'src/test/java/probe/T.java', 'package probe;\nimport probe.Subject;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { Subject.value(); }\n}\n', {}, 'src/main/java/probe/Subject.java', 'package probe;\n// @id CODE-CALC-001 @implements REQ-CALC-001\npublic class Subject { public static int value() { return 7; } }\n'],
  ['PHP', 'tests/T.php', '<?php\nuse Probe\\Subject;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001(): void { Subject::value(); }\n}\n', { 'composer.json': JSON.stringify({ autoload: { 'psr-4': { 'Probe\\': 'src/' } } }) }, 'src/Subject.php', '<?php\nnamespace Probe;\n// @id CODE-CALC-001 @implements REQ-CALC-001\nclass Subject { public static function value() { return 7; } }\n'],
  ['Julia', 'test/t.jl', 'include("../src/answer.jl")\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test value() == 7\nend\n', {}, 'src/answer.jl', '# @id CODE-CALC-001 @implements REQ-CALC-001\nvalue() = 7\n'],
]) {
  test(`#201 generated ${label} subjects are production before Red and survive implementation`, () => {
    const d = batch2Source(file, body);
    writeAll(d, manifests);
    const stub = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
    assert.equal(stub.code, 0, stub.out);
    assert.match(rd130(d, subject), /@id CODE-CALC-001-STUB-\d+ @implements REQ-CALC-001/);
    fakeOut(d, 'AssertionError: not implemented');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, subject), implementation);
    fakeOut(d, 'pass', 0);
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 0, green.out);
    assert.equal(rd130(d, file), body);
  });
}

test('#201 generated C# subject replacement preserves evidence and actual test contents', () => {
  const body = 'using Good;\nnamespace Tests;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { var t = new Token(); }\n}\n';
  const d = batch2Source('Tests/T.cs', body);
  writeAll(d, { 'Core/Core.csproj': '<Project/>', 'Tests/Tests.csproj': '<Project><ItemGroup><ProjectReference Include="../Core/Core.csproj"/></ItemGroup></Project>' });
  const diagnostic = 'Tests/T.cs(4,47): error CS0246: The type or namespace name \'Token\' could not be found';
  const stub = batch2Run(d, 'dotnet', `if [ "$1" = "--version" ]; then echo 10.0; exit 0; fi\nif [ -f Core/Token.cs ]; then exit 0; fi\necho "${diagnostic}"\nexit 1\n`, ['true'], 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(stub.code, 0, stub.out);
  assert.match(rd130(d, 'Core/Token.cs'), /@id CODE-CALC-001-STUB-\d+ @implements REQ-CALC-001/);
  fakeOut(d, 'AssertionError: not implemented');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'Core/Token.cs'), 'namespace Good;\n// @id CODE-CALC-001 @implements REQ-CALC-001\npublic class Token {}\n');
  fakeOut(d, 'pass', 0);
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
  assert.equal(rd130(d, 'Tests/T.cs'), body);
});

for (const [label, file, body, deps, changed] of [
  ['Rust raw string', 'tests/t.rs', 'const ORACLE: &str = include_str!(r#"oracle.txt"#);', { 'tests/oracle.txt': '7' }, 'tests/oracle.txt'],
  ['Rust concat manifest env', 'tests/t.rs', 'const ORACLE: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/oracle.txt"));', { 'Cargo.toml': '[package]\nname="probe"\nversion="0.1.0"\n', 'oracle.txt': '7' }, 'oracle.txt'],
  ['Rust nested path', 'tests/t.rs', 'mod nest {\n#[path = "support.rs"] mod helper;\n}', { 'tests/nest/support.rs': 'pub fn expected() -> i32 { 7 }\n' }, 'tests/nest/support.rs'],
  ['C++ angle header', 'tests/t.cpp', '#include <oracle.hpp>', { 'support/oracle.hpp': '#include <deep.hpp>\n', 'support/deep.hpp': '#define ORACLE 7\n' }, 'support/deep.hpp'],
  ['Java inherited support', 'tests/T.java', 'class T extends Base {\n', { 'tests/Base.java': 'class Base extends Root {}\n', 'tests/Root.java': 'class Root {\n@BeforeEach\nvoid seed() { oracle = 7; }\n}\n' }, 'tests/Root.java'],
  ['PHP inherited support', 'tests/T.php', '<?php\nrequire __DIR__ . "/Base.php";\nclass T extends Base {\n', { 'tests/Base.php': '<?php\nrequire __DIR__ . "/Root.php";\nclass Base extends Root {}\n', 'tests/Root.php': '<?php\nclass Root {\nprotected function setUp(): void { $this->oracle = 7; }\n}\n' }, 'tests/Root.php'],
  ['C# inherited support', 'tests/T.cs', 'class T : Base {\n', { 'tests/Base.cs': 'class Base : Root {}\n', 'tests/Root.cs': 'class Root {\n[SetUp]\nvoid Seed() { oracle = 7; }\n}\n' }, 'tests/Root.cs'],
  ['Julia include closure', 'test/t.jl', 'include("support/oracle.jl")', { 'test/support/oracle.jl': 'include("deep.jl")\n', 'test/support/deep.jl': 'expected() = 7\n' }, 'test/support/deep.jl'],
]) {
  test(`#189 ${label} changes/deletions stale transitive oracle evidence`, () => {
    const julia = file.endsWith('.jl');
    const target = julia ? '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test value() == expected()\nend\n' : '// @id TEST-CALC-001 @verifies REQ-CALC-001\n' + (file.endsWith('.rs') ? '#[test]\nfn test_calc_001() { assert!(true); }\n' : file.endsWith('.php') ? 'public function test_calc_001(): void { self::assertTrue(true); }\n}\n' : file.endsWith('.java') ? '@Test\nvoid test_calc_001() { assertTrue(true); }\n}\n' : file.endsWith('.cs') ? '[Test]\nvoid test_calc_001() { Assert.True(true); }\n}\n' : 'void test_calc_001() { CHECK(1); }\n');
    const d = batch2Source(file, body + '\n' + target);
    writeAll(d, deps);
    fakeOut(d, 'AssertionError: oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, changed), deps[changed].replace('7', '2'));
    assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
    fs.writeFileSync(path.join(d, changed), deps[changed]);
    fs.rmSync(path.join(d, changed));
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1);
  });
}

for (const [ext, setup] of [
  ['java', '@Seed\nvoid initializeOracle() { oracle = 7; }\n'],
  ['php', '#[BeforeFixture(\npriority: 0\n)]\nprotected function initializeOracle(): void { $this->oracle = 7; }\n'],
  ['cs', '[NUnit.Framework.SetUp]\nvoid InitializeOracle() { oracle = 7; }\n'],
  ['cs', '[TestInitializeAttribute]\nvoid InitializeOracle() { oracle = 7; }\n'],
  ['cs', '[Init]\nvoid InitializeOracle() { oracle = 7; }\n'],
]) {
  test(`#190 ${ext} lifecycle spelling ${setup.split('\n')[0]} protects callbacks`, () => {
    const pre = ext === 'java' ? '@BeforeEach\n@interface Seed {}\nclass T {\n' : ext === 'php' ? '<?php\nuse PHPUnit\\Framework\\Attributes\\Before as BeforeFixture;\nclass T {\n' : 'using Init = Microsoft.VisualStudio.TestTools.UnitTesting.TestInitializeAttribute;\nclass T {\n';
    const target = ext === 'php' ? 'public function test_calc_001(): void { self::assertSame(1, $this->oracle); }' : ext === 'java' ? '@Test\nvoid test_calc_001() { assertEquals(1, oracle); }' : '[Test]\nvoid test_calc_001() { Assert.AreEqual(1, oracle); }';
    const body = pre + setup + '// @id TEST-CALC-001 @verifies REQ-CALC-001\n' + target + '\n}\n';
    const d = batch2Source(`T.${ext}`, body);
    fakeOut(d, 'AssertionError: oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, `T.${ext}`), body.replace('oracle = 7', 'oracle = 1'));
    fakeOut(d, 'pass', 0);
    assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
  });
}

test('#190 sibling nested Java callbacks are isolated but enclosing callbacks stay protected', () => {
  const body = 'class T {\n@BeforeEach\nvoid outer() { int shared = 7; }\n@Nested\nclass Target {\n@BeforeEach\nvoid seed() { int target = 7; }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test\nvoid test_calc_001() { assertTrue(true); }\n}\n@Nested\nclass Other {\n@BeforeEach\nvoid other() { int unrelated = 7; }\n}\n}\n';
  const d = batch2Source('T.java', body);
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('unrelated = 7', 'unrelated = 9'));
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('shared = 7', 'shared = 9'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#190 same-file nested inherited Java callbacks preserve full declaring identities', () => {
  const body = 'class Outer {\nstatic class Base {\n@BeforeEach\nvoid seed() { int oracle = 7; }\n}\n@Nested\nclass Target extends Base {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test\nvoid test_calc_001() { assertTrue(true); }\n}\n}\n';
  const d = batch2Source('T.java', body);
  fakeOut(d, 'AssertionError: oracle');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('oracle = 7', 'oracle = 1'));
  fakeOut(d, 'pass', 0);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#189 Rust unresolved include expressions explicitly refuse evidence', () => {
  const d = batch2Source('tests/t.rs', 'const EXPECTED: &str = include_str!(env!("UNRESOLVED_ORACLE"));\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert!(true); }\n');
  fakeOut(d, 'AssertionError: oracle');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /unresolved Rust include oracle/);
  assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
});

test('#195 private PHP test-like helpers remain reachable oracles', () => {
  const body = '<?php\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001(): void { self::assertSame(1, $this->test_oracle()); }\nprivate function test_oracle(): int { return 7; }\n}\n';
  const d = batch2Source('T.php', body);
  fakeOut(d, 'AssertionError: oracle');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.php'), body.replace('return 7', 'return 1'));
  fakeOut(d, 'pass', 0);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#196 absolute review files with spaces receive the same validation and stale locks', () => {
  const d = project();
  const template = sdd(d, 'review', 'template', 'calc').out;
  fs.writeFileSync(path.join(d, 'review pending.md'), template);
  for (const review of ['review pending.md', path.join(d, 'review pending.md')]) {
    const r = sdd(d, 'approve', 'record', 'calc', '--by', 'ai:reviewer', '--review', review);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /acceptable review file/);
  }
  fs.writeFileSync(path.join(d, 'review pass.md'), template.replace('verdict: pending', 'verdict: pass'));
  const r = sdd(d, 'approve', 'record', 'calc', '--by', 'ai:reviewer', '--review', path.join(d, 'review pass.md'));
  assert.equal(r.code, 0, r.out);
  assert.equal(sdd(d, 'review', 'check', path.join(d, 'review pass.md'), '--feature', 'calc').code, 0);
  fs.appendFileSync(path.join(d, 'review pass.md'), '\nchanged\n');
  assert.match(sdd(d, 'guard', 'calc').out, /stale/);
});

test('#198 Julia keyword symbols do not absorb sibling test blocks', () => {
  const body = '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test :begin == Symbol("begin")\nend\n# @id TEST-OTHER-001 @verifies REQ-CALC-001\n@testset "TEST-OTHER-001" begin\n@test 2 == 2\nend\n';
  const d = batch2Source('t.jl', body);
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 't.jl'), body.replace('2 == 2', '3 == 3'));
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
});

test('#191 Cargo importer-local aliases and every Julia comma import reach dependents', () => {
  for (const [files, source, dependent] of [
    [{ 'source/Cargo.toml': '[package]\nname="source-pkg"\nversion="0.1.0"\n[lib]\nname="logic"\n',
      'source/src/lib.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn answer() -> i32 { 7 }\n',
      'client/Cargo.toml': '[package]\nname="client"\nversion="0.1.0"\n[dependencies]\nrenamed = { package = "source-pkg", path = "../source" }\n',
      'client/src/lib.rs': 'use renamed::*;\n// @id CODE-CLIENT-001 @implements REQ-CALC-001\npub fn value() -> i32 { answer() }\n' }, 'source/src/lib.rs', 'client/src/lib.rs'],
    [{ 'src/Shared.jl': 'module Shared\n# @id CODE-CALC-001 @implements REQ-CALC-001\nfunction value()\n7\nend\nend\n',
      'src/Client.jl': 'module Client\nusing LinearAlgebra, ..Shared\n# @id CODE-CLIENT-001 @implements REQ-CALC-001\nfunction compute()\nvalue()\nend\nend\n' }, 'src/Shared.jl', 'src/Client.jl'],
  ]) {
    const d = approved();
    writeAll(d, files);
    const result = sdd(d, 'impact', source, '--json');
    assert.equal(result.code, 0, result.out);
    assert.ok(JSON.parse(result.out).reachedFiles.includes(dependent), result.out);
  }
});

test('#192 Java wildcard imports never shadow existing project bindings', () => {
  const d = batch2Source('src/test/java/probe/tests/T.java', 'package probe.tests;\nimport probe.api.*;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { Counter.value(); }\n}\n');
  writeAll(d, { 'src/main/java/probe/api/Counter.java': 'package probe.api;\npublic class Counter { public static int value() { return 42; } }\n' });
  const r = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.existsSync(path.join(d, 'src/main/java/probe/tests/Counter.java')), false, r.out);
});

test('#192 PHP grouped aliases resolve the same PSR-4 stub destination', { skip: !has130('php') }, () => {
  const d = batch2Source('tests/T.php', '<?php\nuse Probe\\{Evaluator as Checker};\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001() { self::assertSame(2, Checker::sum(1, 1)); }\n}\n');
  writeAll(d, { 'composer.json': '{"autoload":{"psr-4":{"Probe\\\\":"src/"}}}' });
  const r = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.match(rd130(d, 'src/Evaluator.php'), /namespace Probe;|class Evaluator/);
});

test('#192 C# unreferenced same-named types cannot suppress a missing visible type', () => {
  const d = batch2Source('Tests/T.cs', 'using Good;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic void test_calc_001() { var t = new Token(); }\n}\n');
  writeAll(d, { 'Tests/Tests.csproj': '<Project><ProjectReference Include="../Core/Core.csproj"/></Project>',
    'Core/Core.csproj': '<Project/>', 'Other/Other.csproj': '<Project/>', 'Other/Token.cs': 'namespace Unrelated;\npublic class Token {}\n' });
  const diagnostic = 'Tests/T.cs(4,47): error CS0246: The type or namespace name \'Token\' could not be found';
  const r = batch2Run(d, 'dotnet', `if [ "$1" = "--version" ]; then echo 10.0; exit 0; fi\nif [ -f Core/Token.cs ]; then exit 0; fi\necho "${diagnostic}"\nexit 1\n`, ['true'], 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.match(rd130(d, 'Core/Token.cs'), /namespace Good/);
  assert.equal(rd130(d, 'Other/Token.cs'), 'namespace Unrelated;\npublic class Token {}\n');
});

test('#193 CTest names with spaces own C++ pretty-function assertion aborts', () => {
  const d = batch2Source('test.cpp', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { oracle(); }\nvoid oracle() { assert(false); }\nvoid unrelated() { assert(false); }\n');
  const output = (functionName) => `1/1 Test #1: suite test_calc_001 case .... Subprocess aborted***Exception: 0.01 sec\ntest.cpp:4: void ${functionName}(): Assertion \`false' failed.\n`;
  fakeOut(d, output('oracle'));
  // Custom runners can also select a literal CTest registration.
  const r = batch2Run(d, 'ctest', 'cat out.txt; exit 1\n', ['ctest', '-R', 'suite test_calc_001 case'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  fakeOut(d, output('unrelated'));
  const crash = batch2Run(d, 'ctest', 'cat out.txt; exit 1\n', ['ctest', '-R', 'suite test_calc_001 case'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(crash.code, 1, crash.out);
  assert.match(crash.out, /crashed/);
});

test('#194 C++20 CMake standard is used by a no-op stub syntax check', { skip: !has130('c++') }, () => {
  const d = batch2Source('test.cpp', '#include <concepts>\ntemplate<std::integral T> T same(T x) { return x; }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001() { same(1); }\n');
  writeAll(d, { 'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(probe CXX)\nset(CMAKE_CXX_STANDARD 20)\nadd_executable(probe test.cpp)\n' });
  const r = sdd(d, 'tdd', 'stub', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /does not compile/);
});

test('#195 PHPUnit same-named methods cannot borrow another declaring class failure', () => {
  const d = batch2Source('T.php', '<?php\nclass Other {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function testSame(): void { self::assertTrue(true); }\n}\nclass Actual {\npublic function testSame(): void { self::assertTrue(false); }\n}\n');
  fakeOut(d, 'There was 1 failure:\n1) Actual::testSame\nFailed asserting true\nTests: 1, Assertions: 1, Failures: 1.');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
});

test('#197 exact .NET method selection aggregates all runtime display-name rows', () => {
  const d = batch2Source('T.cs', 'namespace Probe;\nclass T {\nconst string Label = "constant row";\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[DataTestMethod]\n[DataRow(1, DisplayName = "visible row")]\n[DataRow(2, DisplayName = Label)]\npublic void test_calc_001(int value) { Assert.AreEqual(value, Actual(value)); }\n}\n');
  writeAll(d, { 'T.csproj': '<Project/>' });
  const run = (...args) => batch2Run(d, 'dotnet', 'cat out.txt; exit "$(cat exit.txt)"\n', ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], ...args);
  fs.writeFileSync(path.join(d, 'out.txt'), 'Failed visible row [1 ms]\nFailed constant row [1 ms]\nAssert.AreEqual failed. Expected:<2>. Actual:<0>\nTotal tests: 2\nFailed: 2\n');
  fs.writeFileSync(path.join(d, 'exit.txt'), '1');
  assert.equal(run('tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'out.txt'), 'Passed visible row [1 ms]\nFailed constant row [1 ms]\nAssert.AreEqual failed. Expected:<2>. Actual:<1>\nTotal tests: 2\nPassed: 1\nFailed: 1\n');
  const green = run('tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 1, green.out);
  assert.match(green.out, /test failed/);
  fs.writeFileSync(path.join(d, 'out.txt'), 'Passed visible row [1 ms]\nPassed constant row [1 ms]\nTotal tests: 2\nPassed: 2\n');
  fs.writeFileSync(path.join(d, 'exit.txt'), '0');
  assert.equal(run('tdd', 'green', 'TEST-CALC-001').code, 0);
});

test('#197 NUnit TestCaseSource runtime SetName belongs to the exact filtered method', () => {
  const d = batch2Source('T.cs', 'namespace Probe;\nclass T {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[TestCaseSource(nameof(Cases))]\npublic void test_calc_001(int value) { Assert.AreEqual(2, value); }\nIEnumerable Cases() { yield return new TestCaseData(1).SetName("source custom case"); }\n}\n');
  writeAll(d, { 'T.csproj': '<Project/>' });
  const r = batch2Run(d, 'dotnet', 'echo "Failed source custom case [1 ms]"\necho "Expected is <2>"\necho "Total tests: 1"\necho "Failed: 1"\nexit 1\n', ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
});

test('#197 constructed generic NUnit fixtures use TRX method ownership, not impossible equality', () => {
  const d = batch2Source('T.cs', 'namespace Probe;\n[TestFixture(typeof(int))]\nclass Generic<T> {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Test]\npublic void test_calc_001() { Assert.AreEqual(1, 2); }\n}\n');
  writeAll(d, { 'T.csproj': '<Project/>' });
  const trx = '<TestRun><TestDefinitions><UnitTest id="target"><TestMethod className="Probe.Generic&lt;System.Int32&gt;" name="test_calc_001"/></UnitTest><UnitTest id="sibling"><TestMethod className="Probe.Generic&lt;System.Int32&gt;" name="test_calc_001_extra"/></UnitTest></TestDefinitions><Results><UnitTestResult testId="target" outcome="Failed"/><UnitTestResult testId="sibling" outcome="Passed"/></Results></TestRun>';
  const r = batch2Run(d, 'dotnet', `printf "%s\\n" "$@" > args.log\nmkdir -p .sdd/results\nprintf '%s' '${trx}' > .sdd/results/sdd-target.trx\necho "Failed custom generic case [1 ms]"\necho "Expected is <1>"\nexit 1\n`, ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.match(rd130(d, 'args.log'), /FullyQualifiedName~Probe.Generic&FullyQualifiedName~\.test_calc_001/);
  const missing = batch2Run(d, 'dotnet', 'echo "Failed custom generic case [1 ms]"; exit 1\n', ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(missing.code, 1, missing.out);
  assert.match(missing.out, /generic .NET fixtures require observable TRX/);
});

test('#197 real NUnit constructed fixtures and SetName rows retain runtime method ownership', { skip: !has130('dotnet') }, (t) => {
  const d = batch2Source('T.cs', 'using NUnit.Framework;\nnamespace Probe;\n[TestFixture(typeof(int))]\npublic class Generic<T> {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Test]\npublic void test_calc_001() { Assert.That(Actual.Value(), Is.EqualTo(1)); }\n}\npublic class SourceCases {\n// @id TEST-SOURCE-001 @verifies REQ-CALC-001\n[TestCaseSource(nameof(Cases))]\npublic void test_source_001(int value) { Assert.That(Actual.Value(), Is.EqualTo(value)); }\npublic static System.Collections.IEnumerable Cases() { yield return new TestCaseData(1).SetName("source custom case"); }\n}\n');
  writeAll(d, { 'T.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><RollForward>Major</RollForward><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1"/><PackageReference Include="NUnit" Version="4.3.2"/><PackageReference Include="NUnit3TestAdapter" Version="5.0.0"/></ItemGroup></Project>',
    'Actual.cs': 'namespace Probe;\n// @id CODE-CALC-001 @implements REQ-CALC-001\npublic static class Actual { public static int Value() => 0; }\n' });
  if (!restores(d, 'T.csproj')) return t.skip('NUnit packages cannot be restored');
  fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], checks: [] }));
  for (const id of ['TEST-CALC-001', 'TEST-SOURCE-001']) {
    const red = sdd(d, 'tdd', 'red', id);
    assert.equal(red.code, 0, red.out + '\n' + rd130(d, '.sdd/results/sdd-target.trx'));
  }
  fs.writeFileSync(path.join(d, 'Actual.cs'), rd130(d, 'Actual.cs').replace('=> 0', '=> 1'));
  for (const id of ['TEST-CALC-001', 'TEST-SOURCE-001']) {
    const green = sdd(d, 'tdd', 'green', id);
    assert.equal(green.code, 0, green.out + '\n' + rd130(d, '.sdd/results/sdd-target.trx'));
  }
});

test('#198 direct Julia runner exposes qualified standard macro/type nested summaries', { skip: !has130('julia') }, () => {
  for (const enclosing of ['Test.@testset "outer"', '@testset Test.DefaultTestSet "outer"']) {
    const d = batch2Source('test.jl', 'using Test\n' + enclosing + ' begin\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test true\nend\nend\n');
    fs.writeFileSync(path.join(d, '.sdd/config.json'), JSON.stringify({ testCmd: ['julia', '--compile=min', '--project=.', '{file}'], checks: [] }));
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'visibility');
    assert.equal(r.code, 0, r.out);
  }
});

for (const [file, body, deps] of [
  ['tests/t.rs', 'mod support;\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(value(), support::expected()); }\n',
    { 'tests/support/mod.rs': 'mod deep;\npub fn expected() -> i32 { deep::oracle() }\n', 'tests/support/deep.rs': 'pub fn oracle() -> i32 { 7 }\n' }],
  ['tests/t.c', '#include "oracle.h"\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { assert(actual() == EXPECTED); }\n',
    { 'tests/oracle.h': '#include "deep.h"\n#define EXPECTED ORACLE\n', 'tests/deep.h': '#define ORACLE 7\n#include "oracle.h"\n' }],
]) {
  test(`#181 ${file} transitive external oracle hashes reject changed Red and stale Green`, () => {
    const d = batch2Source(file, body);
    writeAll(d, deps);
    fakeOut(d, 'AssertionError: external oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    const oracle = Object.keys(deps).at(-1);
    fs.writeFileSync(path.join(d, oracle), deps[oracle].replace('7', '0'));
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
  });
}

test('#181 C oracle headers protect root-local expectations but not annotated production', () => {
  const d = batch2Source('t.c', '#include "oracle.h"\n#include "subject.h"\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { assert(actual() == EXPECTED); }\n');
  writeAll(d, { 'oracle.h': '#define EXPECTED 7\n', 'subject.h': '// @id CODE-CALC-001 @implements REQ-CALC-001\nint actual(void);\n' });
  fakeOut(d, 'AssertionError: oracle');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.appendFileSync(path.join(d, 'subject.h'), '// production changed\n');
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'oracle.h'), '#define EXPECTED 0\n');
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#181 Rust path modules lock executable oracles across a real Cargo Red and Green', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[package]\nname="oracle181"\nversion="0.1.0"\nedition="2021"\n',
    'src/lib.rs': '// @id CODE-A-001 @implements REQ-A-001\npub fn actual() -> i32 { 0 }\n',
    'tests/t.rs': '#[path="custom/oracle.rs"]\nmod support;\n// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001() { assert_eq!(oracle181::actual(), support::expected()); }\n',
    'tests/custom/oracle.rs': 'pub fn expected() -> i32 { 7 }\n',
  });
  const red = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(red.code, 0, red.out);
  fs.writeFileSync(path.join(d, 'src/lib.rs'), rd130(d, 'src/lib.rs').replace('{ 0 }', '{ 7 }'));
  const green = sdd(d, 'tdd', 'green', 'TEST-A-001');
  assert.equal(green.code, 0, green.out);
  fs.writeFileSync(path.join(d, 'tests/custom/oracle.rs'), 'pub fn expected() -> i32 { 0 }\n');
  fs.writeFileSync(path.join(d, 'src/lib.rs'), rd130(d, 'src/lib.rs').replace('{ 7 }', '{ 0 }'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-A-001').out, /changed since Red/);
});

test('#181 binary include_bytes oracle changes cannot collide through UTF-8 replacement characters', () => {
  const d = batch2Source('tests/t.rs', 'const EXPECTED: &[u8] = include_bytes!("oracle.bin");\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert_eq!(actual(), EXPECTED); }\n');
  fs.writeFileSync(path.join(d, 'tests/oracle.bin'), Buffer.from([0xff, 0xfe]));
  fakeOut(d, 'AssertionError: bytes');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'tests/oracle.bin'), Buffer.from([0xff, 0xff]));
  fakeOut(d, 'pass', 0);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#182 root, grouped and nested Rust glob imports retain conservative downstream impact', () => {
  for (const clause of ['*', '{*}', 'exports::*', '{exports::*}']) {
    const d = batch2Source('low/tests/t.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() {}\n');
    writeAll(d, {
      'low/Cargo.toml': '[package]\nname="low"\nversion="0.1.0"\n',
      'high/Cargo.toml': '[package]\nname="high"\nversion="0.1.0"\n[dependencies]\nlow={path="../low"}\n',
      'low/src/lib.rs': 'pub mod exports;\npub use exports::*;\n',
      'low/src/exports.rs': '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn value() -> i32 { 1 }\n',
      'high/src/lib.rs': `use low::${clause};\n// @id CODE-HIGH-001 @implements REQ-HIGH-001\npub fn consume() -> i32 { value() }\n`,
      'high/tests/client.rs': 'use high::consume;\n// @id TEST-HIGH-001 @verifies REQ-HIGH-001\n#[test]\nfn test_high_001() { assert_eq!(consume(), 1); }\n',
      '.sdd/specs/high.md': '---\nfeature: high\ntier: T1\n---\n| REQ-HIGH-001 | consume | TEST-HIGH-001 |\n',
    });
    const impact = sdd(d, 'impact', 'REQ-CALC-001', '--json');
    assert.equal(impact.code, 0, impact.out);
    assert.match(impact.out, /high\/src\/lib.rs/, clause);
    assert.match(impact.out, /TEST-HIGH-001/, clause);
  }
});

test('#183 Rust raw string and byte raw string braces preserve exact inline modules', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[package]\nname="raw183"\nversion="0.1.0"\nedition="2021"\n',
    'src/lib.rs': 'mod tests {\nconst RAW: &str = r#""}"#;\nconst BYTES: &[u8] = br##""}}"##;\nconst PLAIN: &str = r"{";\n// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001() { assert_eq!(RAW.len()+BYTES.len()+PLAIN.len(), 0, "raw target assertion"); }\n}\n',
  });
  const red = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /raw target assertion/);
});

for (const [ext, container, expected, runner] of [
  ['java', 'class Outer { @Nested class Inner {', 'probe.Outer$Inner.test_calc_001', 'mvn'],
  ['cs', 'class Outer { class Inner {', 'probe.Outer+Inner.test_calc_001', 'dotnet'],
  ['cs', 'record RecordTests {', 'probe.RecordTests.test_calc_001', 'dotnet'],
  ['cs', 'record class Outer { record Inner {', 'probe.Outer+Inner.test_calc_001', 'dotnet'],
]) {
  test(`#183 ${ext} ${container} uses runtime-qualified selection and attribution`, () => {
    const cls = expected.slice(0, -'.test_calc_001'.length);
    const source = `${ext === 'java' ? 'package probe;' : 'namespace probe;'}\n${container}\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n${ext === 'java' ? '@Test' : '[Fact]'}\npublic void test_calc_001() { assert(false); }\n${container.includes('Inner') ? '}' : ''}\n}\n`;
    const d = batch2Source(`T.${ext}`, source);
    const cmd = runner === 'mvn' ? ['mvn', 'test', '-Dtest=*#*{idu}'] : ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'];
    const output = runner === 'mvn' ? `SDD-TEST ${cls} test_calc_001 FAILURE\nexpected: <2> but was: <1>` : `Failed ${expected} [1 ms]\nAssert.True() Failure`;
    const red = batch2Run(d, runner, `printf "%s\\n" "$@" > args.log\ncat <<'OUT'\n${output}\nOUT\nexit 1\n`, cmd, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    const args = fs.readFileSync(path.join(d, 'args.log'), 'utf8');
    assert.ok(args.includes(runner === 'mvn' ? `-Dtest=${cls}#test_calc_001` : `FullyQualifiedName=${expected}`), args);
  });
}

test('#183 Maven successful build without fresh target results rejects all TDD evidence', () => {
  const d = batch2Source('T.java', 'package probe;\nclass Outer {\n@Nested class Inner {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test\nvoid test_calc_001() { assertEquals(2,1); }\n}\n}\n');
  const cmd = ['mvn', 'test', '-Dtest=*#*{idu}'];
  const run = (body, ...args) => batch2Run(d, 'mvn', body, cmd, 'tdd', ...args);
  const red = run('echo "[INFO] BUILD SUCCESS"\n', 'red', 'TEST-CALC-001', '--characterization', 'unexecuted');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /no test matched|never ran/);
  assert.equal(run('echo \'SDD-TEST probe.Outer$Inner test_calc_001 FAILURE\'\necho "expected: <2> but was: <1>"\nexit 1\n', 'red', 'TEST-CALC-001').code, 0);
  for (const sub of ['green', 'red']) {
    assert.equal(run('echo "[INFO] BUILD SUCCESS"\n', sub, 'TEST-CALC-001', ...(sub === 'red' ? ['--characterization', 'none'] : [])).code, 1);
  }
  assert.equal(run('echo \'SDD-TEST probe.Outer$Inner test_calc_001 SUCCESS\'\n', 'green', 'TEST-CALC-001').code, 0);
  assert.equal(run('echo "[INFO] BUILD SUCCESS"\n', 'refactor', 'TEST-CALC-001').code, 1);
});

test('#184 inline qualified JUnit annotations preserve sibling hash isolation and helpers', () => {
  const body = 'class Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@org.junit.jupiter.api.Test void test_calc_001() { assertEquals(expected(),actual()); }\n@Test void sibling() { assertTrue(true); }\nint expected() { return 7; }\n}\n';
  const d = batch2Source('T.java', body);
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('assertTrue(true)', 'assertEquals(4,2+2)'));
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('return 7', 'return 0'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

for (const attr of ['Before', 'After', 'BeforeClass', 'AfterClass', 'PreCondition', 'PostCondition', '\\PHPUnit\\Framework\\Attributes\\Before', 'Prime']) {
  test(`#184 PHPUnit ${attr} lifecycle attribute protects oracle hashes`, () => {
    const body = `<?php\nuse PHPUnit\\Framework\\Attributes\\Before as Prime;\nclass Target {\n#[${attr}]\npublic function primeOracle(): void { $this->oracle = 7; }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001(): void { self::assertSame($this->oracle, actual()); }\npublic function unrelated(): void { $n = 99; }\n}\n`;
    const d = batch2Source('T.php', body);
    fakeOut(d, 'AssertionError: oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    fs.writeFileSync(path.join(d, 'T.php'), body.replace('$n = 99', '$n = 100'));
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, 'T.php'), body.replace('oracle = 7', 'oracle = 0'));
    assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
  });
}

test('#184 grouped PHP import aliases and combined attributes protect lifecycle callbacks', () => {
  const body = '<?php\nuse PHPUnit\\Framework\\Attributes\\{Before as Prime, After as Finish};\nclass Target {\n#[Unrelated, Prime]\npublic function primeOracle(): void { $this->oracle = 7; }\n#[Finish] public function finishOracle(): void { $this->done = true; }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001(): void { self::assertSame($this->oracle, actual()); }\n}\n';
  const d = batch2Source('T.php', body);
  fakeOut(d, 'AssertionError: oracle');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.php'), body.replace('oracle = 7', 'oracle = 0'));
  fakeOut(d, 'pass', 0);
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
});

test('#185 overloaded JUnit methods in one class fail closed, unrelated classes are allowed', () => {
  const body = 'package probe;\nclass Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test void test_calc_001() { assertTrue(true); }\n@ParameterizedTest\nvoid test_calc_001(int n) { assertEquals(2,n); }\n}\nclass Other { void test_calc_001(String n) {} }\n';
  const d = batch2Source('T.java', body);
  const cmd = ['mvn', 'test', '-Dtest=*#*{idu}'];
  const output = 'echo "SDD-TEST probe.Target test_calc_001 SUCCESS"\necho "SDD-TEST probe.Target test_calc_001(int)[1] FAILURE"\necho "expected: <2> but was: <3>"\nexit 1\n';
  const red = batch2Run(d, 'mvn', output, cmd, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /overload|ambiguous.*method|unique.*method/i);
  assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
  fs.writeFileSync(path.join(d, 'T.java'), body.replace('void test_calc_001(int n)', 'void other(int n)'));
  const control = batch2Run(d, 'mvn', output, cmd, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(control.code, 1, control.out);
  assert.match(control.out, /itself passes|test passed/);
});

test('#185 solution-root .NET runner selects annotated test owning csproj', () => {
  const d = batch2Source('A/T.cs', 'namespace Probe;\nclass SharedTests {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Fact]\npublic void Calculates() { Assert.True(true); }\n}\n');
  writeAll(d, {
    'A/A.csproj': '<Project><PropertyGroup><IsTestProject>true</IsTestProject></PropertyGroup></Project>',
    'B/B.csproj': '<Project><PropertyGroup><IsTestProject>true</IsTestProject></PropertyGroup></Project>',
    'B/T.cs': 'namespace Probe;\nclass SharedTests { public void Calculates() { Assert.True(false); } }\n',
    'Probe.sln': '',
  });
  const red = batch2Run(d, 'dotnet', `printf "%s\\n" "$@" > args.log
echo "Passed Probe.SharedTests.Calculates [1 ms]"
if ! printf "%s\\n" "$@" | grep -q 'A/A.csproj'; then
  echo "Failed Probe.SharedTests.Calculates [1 ms]"
  echo "Assert.True() Failure"
  exit 1
fi
`, ['dotnet', 'test', '--nologo', '--filter', 'FullyQualifiedName~{idu}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /test passed/);
  assert.match(fs.readFileSync(path.join(d, 'args.log'), 'utf8'), /A\/A.csproj/);
  assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
});

test('#186 C standard assert in a reachable transitive helper is strong Red, unrelated helpers cannot excuse crashes', () => {
  const d = batch2Source('T.c', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { check(); }\nvoid check(void) { oracle(0); }\nvoid oracle(int n) { assert(n==1); }\nvoid unrelated(void) { assert(0); }\n');
  const output = (fn) => `1/1 Test #1: test_calc_001 ... Subprocess aborted***Exception: 0.1 sec\nT: T.c:4: ${fn}: Assertion \`n == 1' failed.\n`;
  fakeOut(d, output('oracle'));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', 'Assertion');
  assert.equal(red.code, 0, red.out);
  assert.doesNotMatch(red.out, /\[weak\]/);
  fakeOut(d, output('unrelated'));
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak').out, /crashed/);
});

for (const registration of ['group.test_calc_001', 'group/test_calc_001', 'group.test_calc_001.case+1']) {
  test(`#186 unique punctuation CTest registration ${registration} is escaped and anchored`, () => {
    const d = batch2Source('T.c', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { CHECK(0); }\n');
    const red = batch2Run(d, 'ctest', `if [ "$1" = "--show-only=json-v1" ]; then
echo '{"tests":[{"name":"${registration}"},{"name":"group.test_calc_0011"}]}'
exit 0
fi
printf "%s\\n" "$@" > args.log
echo "1/1 Test #1: ${registration} ... ***Failed"
echo "CHECK failed: target"
exit 1
`, ['ctest', '-R', '{idu}'], 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    const regex = fs.readFileSync(path.join(d, 'args.log'), 'utf8').split('\n')[1];
    assert.ok(new RegExp(regex).test(registration), regex);
    assert.ok(!new RegExp(regex).test(registration + '1'), regex);
    if (registration.includes('.')) assert.ok(!new RegExp(regex).test(registration.replace('.', 'X')), regex);
  });
}

test('#187 Julia --expect is confined to selected target failure diagnostics', () => {
  const d = batch2Source('T.jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test 2 == 3\nend\n');
  const text = 'TEST-CALC-001: Test Failed at T.jl:4\nExpression: 2 == 3\nEvaluated: 2 == 3\nTEST-SIBLING-001: Test Failed at T.jl:9\nExpression: "SIBLING_ONLY_SENTINEL" == "other"\nTest Summary: | Fail Total Time\nTEST-CALC-001 | 1 1 0.1s\nTEST-SIBLING-001 | 1 1 0.1s\n';
  fakeOut(d, text);
  const wrong = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', 'SIBLING_ONLY_SENTINEL');
  assert.equal(wrong.code, 1, wrong.out);
  assert.match(wrong.out, /wrong reason|does not contain/);
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', '2 == 3');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /fails with: Expression: 2 == 3/);
});

test('#187 Julia nested failure diagnostics use annotated source ownership, not sibling messages', () => {
  const d = batch2Source('T.jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@testset "detail" begin\n@test 2 == 3\nend\nend\n# @id TEST-SIBLING-001 @verifies REQ-CALC-001\n@testset "TEST-SIBLING-001" begin\n@test false\nend\n');
  fakeOut(d, 'detail: Test Failed at T.jl:5\nExpression: 2 == 3\nother: Test Failed at T.jl:10\nExpression: SIBLING_SENTINEL\nTest Summary: | Fail Total Time\nTEST-CALC-001 | 1 1 0.1s\n detail | 1 1 0.1s\nTEST-SIBLING-001 | 1 1 0.1s\n');
  const wrong = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', 'SIBLING_SENTINEL');
  assert.equal(wrong.code, 1, wrong.out);
  assert.match(wrong.out, /does not contain/);
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', '2 == 3');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /fails with: Expression: 2 == 3/);
});

test('#187 hyphen-extended Julia IDs cannot supply skipped target execution', () => {
  const d = batch2Source('T.jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test_skip false\nend\n');
  const run = (status) => fakeOut(d, `Test Summary: | ${status} Broken Total Time\nTEST-CALC-001 | 0 1 1 0.1s\nTEST-CALC-001-OTHER | 1 0 1 0.1s\n`, status === 'Pass' ? 0 : 1);
  run('Fail');
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /skipped/);
  run('Pass');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'skipped').code, 1);
  assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
});

test('#187 hyphen-extended passing Julia sibling cannot supply Green or Refactor for a skipped target', () => {
  const d = batch2Source('T.jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\nif skip_target()\n@test_skip false\nelse\n@test actual() == 1\nend\nend\n');
  fakeOut(d, 'Test Summary: | Fail Total Time\nTEST-CALC-001 | 1 1 0.1s\n');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'Test Summary: | Pass Total Time\nTEST-CALC-001 | 1 1 0.1s\n', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'Test Summary: | Pass Broken Total Time\nTEST-CALC-001 | 0 1 1 0.1s\nTEST-CALC-001-OTHER | 1 0 1 0.1s\n', 0);
  for (const sub of ['green', 'refactor']) {
    const result = sdd(d, 'tdd', sub, 'TEST-CALC-001');
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /no test matched/);
  }
});

test('#187 passing Julia changed-target retest stays weak despite a failing sibling', () => {
  const body = 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test actual() == 1\nend\n';
  const d = batch2Source('T.jl', body);
  fakeOut(d, 'Test Summary: | Fail Total Time\nTEST-CALC-001 | 1 1 0.1s\n');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'Test Summary: | Pass Total Time\nTEST-CALC-001 | 1 1 0.1s\nTest Summary: | Fail Total Time\nTEST-SIBLING-001 | 1 1 0.1s\n');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(path.join(d, 'T.jl'), body.replace('@test actual() == 1', '@test actual() == 1\n@test actual() > 0'));
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--retest', 'Add positivity oracle');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /\[weak\].*|retest/);
  const last = JSON.parse(rd130(d, '.sdd/tdd.jsonl').trim().split('\n').at(-1));
  assert.equal(last.weakWhy, 'retest');
  assert.equal(last.retest, 'Add positivity oracle');
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
});

test('#188 Julia verbosity transform leaves custom testset constructors unchanged', { skip: !has130('julia') }, () => {
  const d = mk130({
    'Project.toml': 'name="Fixture"\n',
    'test/t.jl': `using Test
struct CompactSet <: Test.AbstractTestSet
    inner::Test.DefaultTestSet
    CompactSet(desc) = new(Test.DefaultTestSet(desc; verbose=true))
end
Test.record(t::CompactSet, x) = Test.record(t.inner, x)
Test.finish(t::CompactSet) = Test.finish(t.inner)
# @id TEST-A-001 @verifies REQ-A-001
@testset CompactSet "TEST-A-001" begin
    @test false
end
`,
  });
  const red = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /Expression: false/);
});

test('#188 custom Julia script launcher preserves the selected file argument', () => {
  const d = batch2Source('test/t.jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test false\nend\n');
  writeAll(d, { 'test/runner.jl': 'include(abspath(ARGS[1]))\n' });
  const red = batch2Run(d, 'julia', 'printf "%s\\n" "$@" > args.log\necho "TEST-CALC-001: Test Failed at test/t.jl:4"\necho "Expression: false"\necho "Test Summary: | Fail Total Time"\necho "TEST-CALC-001 | 1 1 0.1s"\nexit 1\n',
    ['julia', '--compile=min', '--project=.', 'test/runner.jl', '{file}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  assert.equal(fs.readFileSync(path.join(d, 'args.log'), 'utf8'), '--compile=min\n--project=.\ntest/runner.jl\ntest/t.jl\n');
});

test('#171 Cargo selects the owning integration binary and package', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[package]\nname="owner171"\nversion="0.1.0"\nedition="2021"\n',
    'src/lib.rs': '',
    'tests/target.rs': '// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001() { assert!(true); }\n',
    'tests/sibling.rs': '#[test]\nfn test_a_001() { assert!(false, "wrong binary"); }\n',
  });
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /test passed/);
  assert.doesNotMatch(r.out, /wrong binary/);
  fs.writeFileSync(path.join(d, 'tests/target.rs'), rd130(d, 'tests/target.rs').replace('#[test]', '#[test]\n#[ignore]'));
  const skipped = sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'ignored');
  assert.equal(skipped.code, 1, skipped.out);
  assert.match(skipped.out, /skipped|no test matched/);
});

test('#171 Rust outcome attribution does not merge identical names across executable headers', () => {
  const d = batch2Source('tests/target.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert!(true); }\n');
  fakeOut(d, 'Running tests/target.rs (target/debug/deps/target-abcd)\ntest test_calc_001 ... ignored\nRunning tests/sibling.rs (target/debug/deps/sibling-abcd)\ntest test_calc_001 ... ok\n', 0);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'ignored').code, 1);
  fakeOut(d, 'Running tests/target.rs (target/debug/deps/target-abcd)\ntest test_calc_001 ... ok\nRunning tests/sibling.rs (target/debug/deps/sibling-abcd)\ntest test_calc_001 ... FAILED\nassertion failed: wrong binary\n');
  assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /itself passes/);
});

for (const runner of ['mvn', 'gradle']) {
  test(`#171 ${runner} exact class selection and disabled-target attribution`, () => {
    const d = batch2Source('tests/TargetTest.java', 'package probe;\nclass TargetTest {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Disabled\n@Test\npublic void test_calc_001() { assertEquals(1, 0); }\n}\n');
    const cmd = runner === 'mvn' ? ['mvn', 'test', '-Dtest=*#*{idu}'] : ['sh', '-c', 'gradle test --tests "*$0"', '{idu}'];
    const result = batch2Run(d, runner, 'printf "%s\\n" "$@" > args.log\nprintf "%s\\n" "SDD-TEST probe.TargetTest test_calc_001 SKIPPED" "SDD-TEST probe.OtherTest test_calc_001 SUCCESS" "Tests run: 2, Failures: 0, Skipped: 1"\n', cmd, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'disabled');
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /skipped|no test matched/);
    const args = fs.readFileSync(path.join(d, 'args.log'), 'utf8');
    assert.match(args, runner === 'mvn' ? /-Dtest=probe.TargetTest#test_calc_001/ : /probe.TargetTest.test_calc_001/);
  });
}

test('#171 Maven uses fresh exact-class XML, never stale reports or sibling results', () => {
  const d = batch2Source('tests/TargetTest.java', 'package probe;\nclass TargetTest {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n@Test\npublic void test_calc_001() { assertEquals(1, 0); }\n}\n');
  const reports = path.join(d, 'target/surefire-reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'stale.xml'), '<testsuite><testcase classname="probe.TargetTest" name="test_calc_001"><failure/></testcase></testsuite>');
  const runXml = (xml, exit) => batch2Run(d, 'mvn', `mkdir -p target/surefire-reports
cat > target/surefire-reports/current.xml <<'XML'
${xml}
XML
echo "Tests run: 2, Failures: ${exit}, Errors: 0, Skipped: 1"
exit ${exit}
`, ['mvn', 'test', '-Dtest=*#*{idu}'], 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'fixture');
  const skipped = runXml('<testsuite><testcase classname="probe.TargetTest" name="test_calc_001"><skipped/></testcase><testcase classname="probe.OtherTest" name="test_calc_001"/></testsuite>', 0);
  assert.equal(skipped.code, 1, skipped.out);
  assert.equal(fs.existsSync(path.join(reports, 'stale.xml')), false);
  const passed = runXml('<testsuite><testcase classname="probe.TargetTest" name="test_calc_001"/><testcase classname="probe.OtherTest" name="test_calc_001"><failure>assertion failed</failure></testcase></testsuite>', 1);
  assert.equal(passed.code, 1, passed.out);
  assert.match(passed.out, /itself passes/);
});

test('#171 Cargo workspace siblings cannot supply a same-named target Red', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[workspace]\nmembers=["owner", "sibling"]\nresolver="2"\n',
    'owner/Cargo.toml': '[package]\nname="owner171"\nversion="0.1.0"\nedition="2021"\n',
    'owner/src/lib.rs': '',
    'owner/tests/target.rs': '// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001() { assert!(true); }\n',
    'sibling/Cargo.toml': '[package]\nname="sibling171"\nversion="0.1.0"\nedition="2021"\n',
    'sibling/src/lib.rs': '',
    'sibling/tests/target.rs': '#[test]\nfn test_a_001() { assert!(false, "wrong package"); }\n',
  });
  const red = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /test passed/);
  assert.doesNotMatch(red.out, /wrong package/);
});

test('#172 out-of-line Rust modules retain exact module qualification', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[package]\nname="modules172"\nversion="0.1.0"\nedition="2021"\n',
    'src/lib.rs': '#[cfg(test)]\nmod tests;\n',
    'src/tests.rs': '// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001() { assert!(false, "out of line target"); }\n',
  });
  const red = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(red.code, 0, red.out);
  assert.match(red.out, /out of line target/);
});

test('#172 C# character literals cannot pop enclosing class qualification', () => {
  const d = batch2Source('T.cs', "namespace Fixture;\nclass Target {\nconst char Close = '}';\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Test]\npublic void test_calc_001() { Assert.True(true); }\n}\n");
  const r = batch2Run(d, 'dotnet', 'printf "%s\\n" "$@" > args.log\necho "Passed Fixture.Target.test_calc_001 [1 ms]"\necho "Total tests: 1"\necho "Passed: 1"\n', ['dotnet', 'test', '--filter', 'FullyQualifiedName~{idu}'], 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'data');
  assert.equal(r.code, 0, r.out);
  assert.match(fs.readFileSync(path.join(d, 'args.log'), 'utf8'), /FullyQualifiedName=Fixture.Target.test_calc_001/);
});

for (const [name, output] of [
  ['Cargo', 'running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out\n'],
  ['VSTest minimal', 'Skipped! - Failed:     0, Passed:     0, Skipped:     1, Total:     1\n'],
  ['VSTest normal', 'Skipped ignored [1 ms]\nTotal tests: 1\nSkipped: 1\n'],
]) {
  test(`#173 ${name} zero execution rejects evidence and full PASS`, () => {
    const d = approved();
    impl(d, '(a,b) => a+b');
    fakeOut(d, 'AssertionError: target');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fakeOut(d, output, 0, { checks: [{ name: 'test', cmd: ['node', '-e', `console.log(${JSON.stringify(output)})`] }] });
    for (const sub of ['green', 'refactor']) assert.equal(sdd(d, 'tdd', sub, 'TEST-CALC-001').code, 1, name);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'none').code, 1);
    const gate = sdd(d, 'gate');
    assert.equal(gate.code, 2, gate.out);
    assert.match(gate.out, /INCOMPLETE/);
  });
}

test('#173 a solution sibling no-match cannot override an executed NUnit target', () => {
  const d = batch2Source('T.cs', 'namespace Fixture;\nclass Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Test]\npublic void test_calc_001() { Assert.True(false); }\n}\n');
  fakeOut(d, 'Failed Fixture.Target.test_calc_001 [1 ms]\nExpected: True\nTotal tests: 1\nFailed: 1\nNo test matches the given testcase filter in Other.dll\n');
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
});

for (const [ext, setup, testBody] of [
  ['java', '@BeforeEach\nvoid prepareOracle() { oracle = 7; }', '@Test\nvoid test_calc_001() { assertEquals(oracle, value()); }'],
  ['java', '@BeforeAll\nstatic void prepareOracle() { oracle = 7; }', '@Test\nvoid test_calc_001() { assertEquals(oracle, value()); }'],
  ['php', 'protected function setUp(): void { $this->oracle = 7; }', 'public function test_calc_001(): void { self::assertSame($this->oracle, value()); }'],
  ['php', 'public static function setUpBeforeClass(): void { self::$oracle = 7; }', 'public function test_calc_001(): void { self::assertSame(self::$oracle, value()); }'],
  ['cs', '[TestInitialize]\npublic void Initialize() { oracle = 7; }', '[TestMethod]\npublic void test_calc_001() { Assert.AreEqual(oracle, value()); }'],
  ['cs', '[SetUp]\npublic void Initialize() { oracle = 7; }', '[Test]\npublic void test_calc_001() { Assert.AreEqual(oracle, value()); }'],
]) {
  test(`#174 ${ext} lifecycle ${setup.split('\n')[0]} protects Red and Green hashes`, () => {
    const body = `class Target {\n${setup}\n\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n${testBody}\n}\n`;
    const d = batch2Source(`T.${ext}`, body);
    fakeOut(d, 'AssertionError: oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, `T.${ext}`), body.replace('oracle = 7', 'oracle = 0'));
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
  });
}

for (const [name, ext, body] of [
  ['C macro', 'c', '#define EXPECTED() expected()\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { CHECK(actual() == EXPECTED()); }\n\nint expected(void) { return 7; }\n'],
  ['C callback data', 'c', 'int expected(void);\nint (*oracles[])(void) = { expected };\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { CHECK(actual() == oracles[0]()); }\n\nint expected(void) { return 7; }\n'],
  ['PHP provider casing', 'php', "class Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[DataProviderExternal(Oracle::class, 'CASES')]\npublic function test_calc_001($n): void { self::assertSame($n, actual()); }\n}\nclass Oracle {\npublic static function cases(): array { return [[7]]; }\n}\n"],
  ['Julia helper', 'jl', 'using Test\nfunction run_tests()\n# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n@test actual() == oracle()\nend\nend\n\noracle() = 7\nrun_tests()\n'],
  ['Julia shared data', 'jl', 'using Test\n# @id TEST-CALC-001 @verifies REQ-CALC-001\nfunction run_target()\n@testset "TEST-CALC-001" begin\n@test actual() == oracle()\nend\nend\n\nconst ORACLE = 7\noracle() = ORACLE\nrun_target()\n'],
]) {
  test(`#175 ${name} oracle dependencies protect Red and stale Green`, () => {
    const d = batch2Source(`T.${ext}`, body);
    fakeOut(d, 'AssertionError: oracle');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(path.join(d, `T.${ext}`), body.replace('7', '0'));
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed/);
  });
}

test('#176 Java explicit imports do not conflate equal class basenames', () => {
  const d = mk130({
    'pom.xml': '<project/>',
    'src/main/java/com/example/alpha/Service.java': 'package com.example.alpha;\npublic class Service {}\n',
    'src/test/java/com/example/probe/TargetTest.java': 'package com.example.probe;\nimport com.example.beta.Service;\nclass TargetTest {\n// @id TEST-A-001 @verifies REQ-A-001\n@Test\npublic void test_a_001() { assertEquals(1, Service.answer()); }\n}\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  assert.match(rd130(d, 'src/main/java/com/example/beta/Service.java'), /package com.example.beta|answer/);
  assert.equal(rd130(d, 'src/main/java/com/example/alpha/Service.java'), 'package com.example.alpha;\npublic class Service {}\n');
  assert.doesNotMatch(r.out, /not stubbed.*alpha/);
});

test('#176 PHP aliases and absolute path repositories resolve to real PSR-4 ownership', { skip: !has130('php') }, () => {
  for (const alias of [false, true]) {
    const cls = alias ? 'AliasBox' : 'Box';
    const d = mk130({
      'composer.json': '{}',
      'packages/gizmo/composer.json': '{"name":"fixture/gizmo","autoload":{"psr-4":{"Org\\\\Gizmo\\\\":"src/"}}}',
      'tests/T.php': `<?php\nuse Org\\Gizmo\\Box${alias ? ' as AliasBox' : ''};\n// @id TEST-A-001 @verifies REQ-A-001\npublic function test_a_001() { self::assertSame(1, ${cls}::add()); }\n`,
    });
    fs.writeFileSync(path.join(d, 'composer.json'), JSON.stringify({ repositories: [{ type: 'path', url: path.join(d, 'packages/*') }] }));
    const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
    assert.equal(r.code, 0, r.out);
    assert.match(rd130(d, 'packages/gizmo/src/Box.php'), /class Box|function add/);
    assert.equal(fs.existsSync(path.join(d, 'packages/gizmo/src/AliasBox.php')), false);
    assert.equal(fs.existsSync(path.join(d, 'src/Gizmo/Box.php')), false);
  }
});

test('#176 Julia transitive includes preserve real exported bindings', { skip: !has130('julia') }, () => {
  const d = mk130({
    'Project.toml': 'name="Fixture"\n',
    'src/Existing.jl': 'module Existing\nexport available\ninclude("inner.jl")\nend\n',
    'src/inner.jl': 'include("deep.jl")\n',
    'src/deep.jl': 'available() = 7\n',
    'test/t.jl': 'using Test\ninclude("../src/Existing.jl")\ninclude("../src/Fresh.jl")\nusing .Existing, .Fresh\n# @id TEST-A-001 @verifies REQ-A-001\n@testset "TEST-A-001" begin\n@test available() == 7\n@test freshfn() == 1\nend\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  assert.match(rd130(d, 'src/Fresh.jl'), /freshfn/);
  assert.doesNotMatch(rd130(d, 'src/Fresh.jl'), /available/);
  assert.equal(rd130(d, 'src/deep.jl'), 'available() = 7\n');
});

test('#177 CTest registration aliases select a unique exact ID, not the C function', { skip: !has130('cmake') || !has130('ctest') }, () => {
  const d = mk130({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.10)\nproject(alias177 NONE)\nenable_testing()\nset(target test_a_001)\nadd_test(NAME ${target} COMMAND sh -c "echo CHECK failed: registration; exit 1")\nadd_test(NAME test_a_0011 COMMAND sh -c "echo sibling; exit 1")\n',
    'tests/t.c': '// @id TEST-A-001 @verifies REQ-A-001\nvoid test_a_001_addition(void) { CHECK(0); }\n',
  });
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001', '--expect', 'CHECK failed: registration');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /sibling/);
});

test('#177 direct CTest discovery uses its cwd when no test directory is configured', () => {
  const d = batch2Source('T.c', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001_addition(void) { CHECK(0); }\n');
  const r = batch2Run(d, 'ctest', `if [ "$1" = "--show-only=json-v1" ]; then
  echo '{"tests":[{"name":"test_calc_001"}]}'
  exit 0
fi
printf "%s\\n" "$@" > args.log
echo "1/1 Test #1: test_calc_001 ... ***Failed"
echo "CHECK failed: target"
exit 1
`, ['ctest', '-R', '{idu}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.match(fs.readFileSync(path.join(d, 'args.log'), 'utf8'), /\^test_calc_001\$/);
});

test('#178 attributable standard C assert abort is strong Red, genuine crashes remain rejected', () => {
  const d = batch2Source('T.c', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { assert(actual() == 7); }\n');
  fakeOut(d, "1/1 Test #1: test_calc_001 ... Subprocess aborted***Exception: 0.1 sec\nT: T.c:3: test_calc_001: Assertion `actual() == 7' failed.\nThe following tests FAILED:\n1 - test_calc_001 (Subprocess aborted)\n");
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(red.code, 0, red.out);
  assert.doesNotMatch(red.out, /\[weak\]/);
  for (const text of [
    '1/1 Test #1: test_calc_001 ... ***Exception: SegFault\nAssertion failed in sibling\n',
    '1/1 Test #1: test_calc_001 ... Subprocess aborted***Exception:\n',
  ]) {
    fakeOut(d, text);
    assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak').out, /crashed/);
  }
});

test('#178 a target assertion abort does not excuse a sibling segmentation fault', () => {
  const d = batch2Source('T.c', '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { assert(0); }\n');
  fakeOut(d, "1/2 Test #1: test_calc_001 ... Subprocess aborted***Exception: 0.1 sec\nT: T.c:3: test_calc_001: Assertion `0' failed.\n2/2 Test #2: sibling ... ***Exception: SegFault 0.1 sec\n");
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--weak');
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /crashed/);
});

test('#179 PHPUnit exact filters include newline dataset names', () => {
  const d = batch2Source('T.php', '<?php\nclass Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001(): void { self::assertTrue(true); }\n}\n');
  const r = batch2Run(d, 'phpunit', 'printf "%s\\n" "$@" > args.log\necho "AssertionError: target"\nexit 1\n', ['phpunit', '--filter', '{idu}', '{file}'], 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  const args = fs.readFileSync(path.join(d, 'args.log'), 'utf8').split('\n');
  const filter = args[args.indexOf('--filter') + 1];
  const re = new RegExp(filter.slice(1, -1));
  assert.ok(re.test('Target::test_calc_001 with data set "line\nbreak"'), filter);
  assert.ok(!re.test('Target::test_calc_0011 with data set "line\nbreak"'), filter);
});

for (const dataset of ['#0', '@active']) {
  test(`#179 PHPUnit 12 ${dataset} failure belongs to the exact method`, () => {
    const d = batch2Source('T.php', '<?php\nclass Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\npublic function test_calc_001($n): void { self::assertSame(3, actual()); }\n}\n');
    fakeOut(d, `There was 1 failure:\n1) Target::test_calc_001${dataset} with data (false)\nFailed asserting that 0 is identical to 3.\nTests: 2, Assertions: 1, Failures: 1, Skipped: 1.\n`);
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    fakeOut(d, `There was 1 failure:\n1) Target::test_calc_0011${dataset} with data (false)\nFailed asserting sibling\nTests: 2, Assertions: 2, Failures: 1.\n`);
    assert.match(sdd(d, 'tdd', 'red', 'TEST-CALC-001').out, /itself passes/);
  });
}

for (const attr of ['[TestCase(1, TestName = "One sample")]', '[DataRow(1, DisplayName = "One sample")]']) {
  test(`#180 .NET custom case ${attr} retains method execution identity`, () => {
    const d = batch2Source('T.cs', `namespace Fixture;\nclass Target {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n${attr}\npublic void test_calc_001(int x) { Assert.AreEqual(1, x); }\n}\n`);
    fakeOut(d, 'Passed One sample [1 ms]\nTotal tests: 1\nPassed: 1\n', 0);
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'data');
    assert.equal(red.code, 0, red.out);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'Failed One sample [1 ms]\nExpected: 99\nat Fixture.Target.test_calc_001(Int32 x)\nTotal tests: 1\nFailed: 1\n');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'Passed Different sample [1 ms]\nTotal tests: 1\nPassed: 1\n', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 1);
  });
}

test('#180 default Julia runner exposes passing nested testsets without editing source', { skip: !has130('julia') }, () => {
  const body = 'using Test\n@testset "outer" begin\n# @id TEST-A-001 @verifies REQ-A-001\n@testset "TEST-A-001" begin\n@test actual() == 2\nend\nend\n';
  const production = '# @id CODE-A-001 @implements REQ-A-001\n';
  const d = mk130({ 'Project.toml': 'name="Fixture"\n', 'test/t.jl': 'include("../subject.jl")\n' + body, 'subject.jl': production + 'actual() = 0\n' });
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-A-001').code, 0);
  fs.writeFileSync(path.join(d, 'subject.jl'), production + 'actual() = 2\n');
  const green = sdd(d, 'tdd', 'green', 'TEST-A-001');
  assert.equal(green.code, 0, green.out);
  assert.equal(rd130(d, 'test/t.jl'), 'include("../subject.jl")\n' + body);
});

test('#163 Git-less changed gate falls back to full checks and evidence', () => {
  const d = approved();
  fs.rmSync(path.join(d, '.git'), { recursive: true });
  impl(d, '(a,b) => a+b');
  fakeOut(d, 'pass', 0, { projects: [{ root: 'module', checks: [{ name: 'must-fail', cmd: ['node', '-e', 'console.log("CHECK RAN");process.exit(1)'], changedCmd: ['node', '-e', 'process.exit(0)'] }] }] });
  fs.mkdirSync(path.join(d, 'module'));
  const r = sdd(d, 'gate', '--changed');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Git.*unavailable.*full/i);
  assert.match(r.out, /no Green recorded/);
  assert.match(r.out, /CHECK RAN/);
  assert.doesNotMatch(r.out, /0\/0 tests|no changed files.*skipped/);
});

test('#163 Git-less Rust manifests retain cross-crate impact', () => {
  const d = approved();
  fs.rmSync(path.join(d, '.git'), { recursive: true });
  for (const name of ['low', 'high']) {
    fs.mkdirSync(path.join(d, name, 'src'), { recursive: true });
    fs.writeFileSync(path.join(d, name, 'Cargo.toml'), `[package]\nname = "${name}"\nversion = "0.1.0"\n`);
  }
  fs.writeFileSync(path.join(d, 'low/src/lib.rs'), '// @id CODE-CALC-001 @implements REQ-CALC-001\npub fn value() -> i32 { 1 }\n');
  fs.writeFileSync(path.join(d, 'high/src/lib.rs'), 'use low::value;\n// @id CODE-HIGH-001 @implements REQ-HIGH-001\npub fn consume() -> i32 { value() }\n');
  fs.writeFileSync(path.join(d, '.sdd/specs/high.md'), '---\nfeature: high\ntier: T1\n---\n| REQ-HIGH-001 | consume | TEST-HIGH-001 |\n');
  const r = sdd(d, 'impact', 'REQ-CALC-001', '--json');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /high\/src\/lib.rs/);
  assert.match(r.out, /REQ-HIGH-001/);
});

test('#163 C# discovery and compiler-driven stubs work without Git', () => {
  const d = mk130({
    'src/Lib/Lib.csproj': '<Project Sdk="Microsoft.NET.Sdk"/>',
    'tests/T/T.csproj': '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0"/><ProjectReference Include="../../src/Lib/Lib.csproj"/></ItemGroup></Project>',
    'tests/T/Tests.cs': 'using Lib;\n// @id TEST-A-001 @verifies REQ-A-001\npublic void test_a_001() { Assert.Equal(1, Engine.Compute()); }\n',
  });
  fs.rmSync(path.join(d, '.git'), { recursive: true });
  const bin = path.join(d, 'tools');
  fs.mkdirSync(bin);
  const column = rd130(d, 'tests/T/Tests.cs').split('\n')[2].indexOf('Engine') + 1;
  fs.writeFileSync(path.join(bin, 'dotnet'), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 8.0.0; exit 0; fi\nif [ -f "${d}/src/Lib/Engine.cs" ]; then exit 0; fi\nprintf "%s\\n" "${d}/tests/T/Tests.cs(3,${column}): error CS0103: The name 'Engine' does not exist in the current context"\nexit 1\n`, { mode: 0o755 });
  const env = { ...ENV, PATH: `${bin}:${ENV.PATH}` };
  const go = (...args) => spawnSync('node', [SDD, '--root', d, ...args], { encoding: 'utf8', env });
  const init = go('init');
  assert.equal(init.status, 0, init.stdout + init.stderr);
  assert.match(fs.readFileSync(path.join(d, '.sdd/config.json'), 'utf8'), /dotnet/);
  const stub = go('tdd', 'stub', 'TEST-A-001');
  assert.equal(stub.status, 0, stub.stdout + stub.stderr);
  assert.match(stub.stdout, /compile-checked/);
  assert.match(fs.readFileSync(path.join(d, 'src/Lib/Engine.cs'), 'utf8'), /namespace Lib|Compute/);
});

for (const [stack, file, body, output] of [
  ['Rust', 'tests/calc.rs', '#[test]\nfn test_calc_001_descriptive() { assert!(true); }', 'running 2 tests\ntest test_calc_001_descriptive ... ok\ntest test_calc_001_descriptive1 ... FAILED\ntest result: FAILED. 1 passed; 1 failed;'],
  ['CTest', 'tests/calc.c', 'void test_calc_001_descriptive(void) { CHECK(1); }', '1/2 Test #1: test_calc_001_descriptive .... Passed 0.1 sec\n2/2 Test #2: test_calc_001_descriptive1 .... ***Failed 0.1 sec\nCHECK failed: sibling'],
  ['PHPUnit', 'tests/CalcTest.php', 'public function test_calc_001_descriptive(): void { self::assertTrue(true); }', 'There was 1 failure:\n1) CalcTest::test_calc_001_descriptive1\nFailed asserting sibling\nTests: 2, Assertions: 2, Failures: 1.'],
  ['.NET', 'tests/CalcTest.cs', '[Fact]\npublic void test_calc_001_descriptive() { Assert.True(true); }', 'Passed CalcTest.test_calc_001_descriptive [1 ms]\nFailed CalcTest.test_calc_001_descriptive1 [1 ms]\nAssert.True() Failure\nFailed! - Failed: 1, Passed: 1, Skipped: 0, Total: 2'],
]) {
  test(`#164 ${stack} exact target cannot borrow a descriptive sibling failure`, () => {
    const d = approved();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    fs.mkdirSync(path.join(d, 'tests'));
    fs.writeFileSync(path.join(d, file), `// @id TEST-CALC-001 @verifies REQ-CALC-001\n${body}\n`);
    fakeOut(d, output, 1);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /itself passes|test passed/);
    assert.equal(fs.existsSync(path.join(d, '.sdd/tdd.jsonl')), false);
  });
}

test('#164 Julia parses sequential summary schemas and exact testset names', () => {
  const d = approved();
  const pass = 'Test Summary: | Pass Total Time\nTEST-CALC-001 | 1 1 0.1s\n';
  const fail = 'Test Summary: | Fail Total Time\nTEST-CALC-0011 | 1 1 0.1s\nExpression: false\n';
  fakeOut(d, 'Test Summary: | Fail Total Time\nTEST-CALC-001 | 1 1 0.1s\n');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, pass + fail);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /itself passes/);
});

test('#164 qualified Rust and C# targets cannot borrow same-named methods in another scope', () => {
  for (const [ext, body, output] of [
    ['rs', 'mod selected {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { assert!(true); }\n}\n',
      'running 2 tests\ntest selected::test_calc_001 ... ok\ntest unrelated::test_calc_001 ... FAILED\ntest result: FAILED. 1 passed; 1 failed;'],
    ['cs', 'namespace Fixture;\nclass Selected {\n// @id TEST-CALC-001 @verifies REQ-CALC-001\n[Fact]\npublic void test_calc_001() { Assert.True(true); }\n}\n',
      'Passed Fixture.Selected.test_calc_001 [1 ms]\nFailed Fixture.Unrelated.test_calc_001 [1 ms]\nAssert.True() Failure\n'],
  ]) {
    const d = approved();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    fs.writeFileSync(path.join(d, `Test.${ext}`), body);
    fakeOut(d, output, 1);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /itself passes/);
    fakeOut(d, output.replace(ext === 'rs' ? 'selected::test_calc_001 ... ok' : 'Passed Fixture.Selected.test_calc_001', ext === 'rs' ? 'selected::test_calc_001 ... ignored' : 'Skipped Fixture.Selected.test_calc_001'), 1);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 1);
  }
});

test('#164 Cargo selects the complete nested annotated target exactly', { skip: !has130('cargo') }, () => {
  const d = mk130({
    'Cargo.toml': '[package]\nname = "exact164"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/lib.rs': 'pub fn value() -> i32 { 1 }\n',
    'tests/t.rs': 'mod nested {\n// @id TEST-A-001 @verifies REQ-A-001\n#[test]\nfn test_a_001_descriptive() { assert_eq!(exact164::value(), 1); }\n#[test]\nfn test_a_001_descriptive1() { assert!(false, "sibling"); }\n}\n',
  });
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /test passed/);
  assert.doesNotMatch(r.out, /sibling/);
  fs.writeFileSync(path.join(d, 'tests/t.rs'), rd130(d, 'tests/t.rs').replace('fn test_a_001_descriptive()', '#[ignore]\nfn test_a_001_descriptive()'));
  const ignored = sdd(d, 'tdd', 'red', 'TEST-A-001', '--characterization', 'ignored');
  assert.equal(ignored.code, 1, ignored.out);
  assert.match(ignored.out, /skipped/);
});

test('#164 default CTest selector is anchored to the complete function name', { skip: !has130('cmake') || !has130('ctest') }, () => {
  const d = mk130({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.10)\nproject(exact164 NONE)\nenable_testing()\nadd_test(NAME test_a_001_descriptive COMMAND sh -c "exit 0")\nadd_test(NAME test_a_001_descriptive1 COMMAND sh -c "echo sibling; exit 1")\n',
    'tests/t.c': '// @id TEST-A-001 @verifies REQ-A-001\nvoid test_a_001_descriptive(void) { CHECK(1); }\n',
  });
  const r = sdd(d, 'tdd', 'red', 'TEST-A-001');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /test passed/);
  assert.doesNotMatch(r.out, /sibling/);
});

test('#164 default PHPUnit and VSTest filters are exact and preserve provider selection', () => {
  for (const stack of ['php', 'cs']) {
    const d = mk130(stack === 'php' ? {
      'composer.json': '{}',
      'tests/T.php': '<?php\nclass CalcTest {\n// @id TEST-A-001 @verifies REQ-A-001\npublic function test_a_001_descriptive(): void { self::assertTrue(true); }\n}\n',
    } : {
      'T.csproj': '<Project/>',
      'T.cs': 'namespace Fixture.Tests;\npublic class CalcTest {\n// @id TEST-A-001 @verifies REQ-A-001\n[Theory]\npublic void test_a_001_descriptive(int x) { Assert.True(true); }\n}\n',
    });
    const bin = path.join(d, 'tools');
    fs.mkdirSync(bin);
    const runner = stack === 'php' ? 'phpunit' : 'dotnet';
    fs.writeFileSync(path.join(bin, runner), '#!/bin/sh\nprintf "%s\\n" "$@" > args.log\necho "AssertionError: target"\nexit 1\n', { mode: 0o755 });
    const r = spawnSync('node', [SDD, '--root', d, 'tdd', 'red', 'TEST-A-001'], { encoding: 'utf8', env: { ...ENV, PATH: `${bin}:${ENV.PATH}` } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const args = fs.readFileSync(path.join(d, 'args.log'), 'utf8').split('\n');
    const filter = args[args.indexOf('--filter') + 1];
    if (stack === 'php') {
      const re = new RegExp(filter.slice(1, -1));
      assert.ok(re.test('CalcTest::test_a_001_descriptive'));
      assert.ok(re.test('CalcTest::test_a_001_descriptive with data set "row1"'));
      assert.ok(!re.test('CalcTest::test_a_001_descriptive1'));
    } else {
      assert.equal(filter, 'FullyQualifiedName=Fixture.Tests.CalcTest.test_a_001_descriptive');
      assert.ok(args.includes('console;verbosity=normal'));
    }
  }
});

for (const [stack, output] of [
  ['Gradle', 'Tests run: 1, Failures: 0, Skipped: 1\n'],
  ['CTest', '1/1 Test #1: test_calc_001 .... ***Skipped 0.1 sec\n100% tests passed, 0 tests failed out of 1\n'],
  ['Julia', 'Test Summary: | Broken Total Time\nTEST-CALC-001 | 1 1 0.1s\n'],
]) {
  test(`#165 ${stack} skipped-only runs reject evidence and full gate is INCOMPLETE`, () => {
    const d = approved();
    impl(d, '(a,b) => a+b');
    fakeOut(d, output, 0, { checks: [{ name: 'test', cmd: ['node', '-e', `console.log(${JSON.stringify(output)})`] }] });
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'probe');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /skipped|no test matched/);
    assert.match(sdd(d, 'gate').out, /all tests skipped.*INCOMPLETE/);
    fakeOut(d, 'AssertionError: target');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fakeOut(d, output, 0);
    for (const sub of ['green', 'refactor']) assert.equal(sdd(d, 'tdd', sub, 'TEST-CALC-001').code, 1);
    fakeOut(d, output, 0, { checks: [{ name: 'test', cmd: ['node', '-e', `console.log(${JSON.stringify(output)})`] }] });
    assert.equal(sdd(d, 'gate').code, 2);
  });
}

test('#165 Julia missing target cannot borrow an executed control test', () => {
  const d = approved();
  fakeOut(d, 'Test Summary: | Pass Total Time\ncontrol | 1 1 0.1s\n', 0);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'probe');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /never ran|no test matched/);
});

for (const [ext, testBody, helper] of [
  ['rs', '#[test]\nfn test_calc_001() {\n  assert_eq!(value(), expected());\n}', 'fn expected() -> i32 { 1 }'],
  ['java', '@Test\npublic void test_calc_001() {\n  assertEquals(expected(), value());\n}', 'private int expected() { return 1; }'],
  ['php', 'public function test_calc_001(): void {\n  self::assertSame($this->expected(), value());\n}', 'private function expected(): int { return 1; }'],
  ['cs', '[Test]\npublic void test_calc_001() {\n  Assert.AreEqual(Expected(), value());\n}', 'private int Expected() => 1;'],
  ['c', 'void test_calc_001(void) {\n  CHECK(value() == expected());\n}', 'int expected(void) { return 1; }'],
]) {
  test(`#166 ${ext} shared oracle edits between Red and Green are refused`, () => {
    const d = approved();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    const file = path.join(d, `Test.${ext}`);
    const body = `// @id TEST-CALC-001 @verifies REQ-CALC-001\n${testBody}\n\n${helper}\n`;
    fs.writeFileSync(file, body);
    fakeOut(d, 'AssertionError: oracle');
    const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(red.code, 0, red.out);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fs.writeFileSync(file, body.replace(helper, helper.replace('1', '2')));
    fakeOut(d, 'pass', 0);
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /test file changed since Red/);
    assert.match(sdd(d, 'gate', '--no-run').out, /test changed since last Green/);
  });
}

test('#167 CTest child segfault is rejected even with --weak', () => {
  const d = approved();
  fakeOut(d, '1/1 Test #1: test_calc_001 ... ***Exception: SegFault 0.1 sec\nThe following tests FAILED:\n1 - test_calc_001 (SEGFAULT)\n');
  for (const args of [[], ['--weak'], ['--expect', 'SegFault']]) {
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', ...args);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /crashed/);
  }
  fakeOut(d, 'AssertionError: target');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  fakeOut(d, '1/1 Test #1: test_calc_001 ... ***Exception: SegFault 0.1 sec\n');
  for (const sub of ['green', 'refactor']) {
    const r = sdd(d, 'tdd', sub, 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /crashed/);
  }
});

test('#165 successful zero-test and Gradle NO-SOURCE checks are INCOMPLETE', () => {
  for (const output of ['No tests were found!!!', '> Task :cleanTest UP-TO-DATE\n> Task :test NO-SOURCE\nBUILD SUCCESSFUL']) {
    const d = approved();
    impl(d, '(a,b) => a+b');
    fakeOut(d, 'AssertionError: target');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    fakeOut(d, 'pass', 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    fakeOut(d, output, 0, { checks: [{ name: 'test', cmd: ['node', '-e', `console.log(${JSON.stringify(output)})`] }] });
    assert.equal(sdd(d, 'gate').code, 2);
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'absent').code, 1);
  }
});

test('#165 mixed Gradle, CTest and Julia execution remains valid', () => {
  for (const output of [
    'Tests run: 2, Failures: 0, Skipped: 1\n',
    '1/2 Test #1: TEST-CALC-001 .... Passed 0.1 sec\n2/2 Test #2: control .... ***Skipped 0.1 sec\n',
    'Test Summary: | Pass Broken Total Time\nTEST-CALC-001 | 1 1 2 0.1s\n',
  ]) {
    const d = approved();
    impl(d, '(a,b) => a+b');
    fakeOut(d, output, 0, { checks: [{ name: 'test', cmd: ['node', '-e', `console.log(${JSON.stringify(output)})`] }] });
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'executed').code, 0);
    assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
    assert.equal(sdd(d, 'gate').code, 0);
  }
});

for (const [ext, body, helper] of [
  ['java', '@Test\npublic void test_calc_001() {\n  assertEquals(expected(), value());\n}', 'private int expected() { return 2; }'],
  ['cs', '[Test]\npublic void test_calc_001() {\n  Assert.AreEqual(expected(), value());\n}', 'private int expected() => 2;'],
]) {
  test(`#166 app050 F2 ${ext} oracle-only edit cannot fabricate Red to Green`, () => {
    const d = approved();
    fs.rmSync(path.join(d, 'add.test.mjs'));
    impl(d, '() => 1');
    const file = path.join(d, `Test.${ext}`);
    const source = `// @id TEST-CALC-001 @verifies REQ-CALC-001\n${body}\n\n${helper}\n`;
    fs.writeFileSync(file, source);
    fakeOut(d, 'AssertionError: expected 2 but was 1');
    assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
    const production = fs.readFileSync(path.join(d, 'add.mjs'), 'utf8');
    fs.writeFileSync(file, source.replace(helper, helper.replace('2', '1')));
    fakeOut(d, 'pass', 0);
    const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
    assert.equal(green.code, 1, green.out);
    assert.match(green.out, /test file changed since Red/);
    assert.equal(fs.readFileSync(path.join(d, 'add.mjs'), 'utf8'), production);
    assert.equal(sdd(d, 'gate', '--no-run').code, 1);
    assert.equal(fs.readFileSync(path.join(d, '.sdd/tdd.jsonl'), 'utf8').trim().split('\n').length, 1);
  });
}

test('#168 PHP stubs resolve local Composer path manifests before installation', { skip: !has130('php') }, () => {
  const d = mk130({
    'composer.json': '{"require":{"fixture/ledger":"*"},"repositories":[{"type":"path","url":"packages/*"}]}',
    'packages/ledger/composer.json': '{"name":"fixture/ledger","autoload":{"psr-4":{"Fixture\\\\Ledger\\\\":"src/"}}}',
    'tests/T.php': '<?php\nuse Fixture\\Ledger\\Ledger;\n// @id TEST-A-001 @verifies REQ-A-001\npublic function test_a_001() { self::assertSame(1, Ledger::value()); }\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /packages\/ledger\/src\/Ledger.php/);
  assert.equal(fs.existsSync(path.join(d, 'src/Ledger/Ledger.php')), false);
});

test('#168 PHPUnit throwing-stub errors and mixed skipped data rows are executed', () => {
  const d = approved();
  fakeOut(d, 'There was 1 error:\n1) CalcTest::test_calc_001\nLogicException: not implemented: add\nTests: 1, Assertions: 0, Errors: 1.\n');
  const red = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--expect', 'not implemented: add');
  assert.equal(red.code, 0, red.out);
  fakeOut(d, 'OK, but some tests were skipped!\nTests: 2, Assertions: 1, Skipped: 1.\n', 0);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'mixed rows').code, 0);
});

test('#168 PHP stubs honor installed Composer path-package PSR-4 mappings', { skip: !has130('php') }, () => {
  const d = mk130({
    'composer.json': '{"require":{"fixture/ledger":"*"},"repositories":[{"type":"path","url":"packages/ledger"}]}',
    'packages/ledger/composer.json': '{"name":"fixture/ledger","autoload":{"psr-4":{"Fixture\\\\Ledger\\\\":"src/"}}}',
    'vendor/autoload.php': '<?php\nreturn new class { public function getPrefixesPsr4() { return ["Fixture\\\\Ledger\\\\" => [__DIR__ . "/../packages/ledger/src/"]]; } };',
    'tests/T.php': '<?php\nuse Fixture\\Ledger\\Ledger;\n// @id TEST-A-001 @verifies REQ-A-001\npublic function test_a_001() { self::assertSame(1, Ledger::value()); }\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /packages\/ledger\/src\/Ledger.php/);
  assert.equal(fs.existsSync(path.join(d, 'src/Ledger/Ledger.php')), false);
  assert.match(rd130(d, 'packages/ledger/src/Ledger.php'), /namespace Fixture\\Ledger/);
  fs.rmSync(path.join(d, 'packages/ledger/src/Ledger.php'));
  fs.mkdirSync(path.join(d, 'vendor/fixture'));
  fs.symlinkSync(path.join(d, 'packages/ledger'), path.join(d, 'vendor/fixture/ledger'), 'dir');
  fs.writeFileSync(path.join(d, 'vendor/autoload.php'), '<?php\nreturn new class { public function getPrefixesPsr4() { return ["Fixture\\\\Ledger\\\\" => [__DIR__ . "/fixture/ledger/src/"]]; } };');
  const linked = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(linked.code, 0, linked.out);
  assert.match(linked.out, /packages\/ledger\/src\/Ledger.php/);
});

test('#169 Julia comma imports wrap modules and stdlib bindings are not stubbed', { skip: !has130('julia') }, () => {
  const d = mk130({
    'Project.toml': 'name = "Fixture"\n',
    'src/Existing.jl': 'module Existing\nend\n',
    'test/t.jl': 'using Test, LinearAlgebra\ninclude("../src/Existing.jl")\ninclude("../src/Fresh.jl")\nusing .Existing, .Fresh\n# @id TEST-A-001 @verifies REQ-A-001\n@testset "TEST-A-001" begin\n  @test compute(1) == 2\n  @test dot([1], [1]) == 1\n  @test issymmetric([1;;])\nend\n',
  });
  const r = sdd(d, 'tdd', 'stub', 'TEST-A-001');
  assert.equal(r.code, 0, r.out);
  const body = rd130(d, 'src/Fresh.jl');
  assert.match(body, /^module Fresh\n/);
  assert.match(body, /export compute/);
  assert.doesNotMatch(body, /\bdot\b|\bissymmetric\b/);
});

test('#169 Julia @test_throws is assertion-origin strong Red', () => {
  const d = approved();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  fs.writeFileSync(path.join(d, 'test.jl'), '# @id TEST-CALC-001 @verifies REQ-CALC-001\n@testset "TEST-CALC-001" begin\n  @test_throws ArgumentError invalid(0)\nend\n');
  fakeOut(d, 'not implemented: invalid\nTest Failed at test.jl:3\nExpression: invalid(0)\n');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /setup call|\[weak\]/);
});

test('#170 single-line C test excludes uncalled trailing functions but tracks called helpers', () => {
  const d = approved();
  fs.rmSync(path.join(d, 'add.test.mjs'));
  const file = path.join(d, 'test.c');
  const body = '// @id TEST-CALC-001 @verifies REQ-CALC-001\nvoid test_calc_001(void) { CHECK(value() == expected()); }\nint expected(void) { return 1; }\nint main(void) { test_calc_001(); }\n';
  fs.writeFileSync(file, body);
  fakeOut(d, 'CHECK failed: value');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fs.writeFileSync(file, body.replace('int main', 'int unused(void) { return 9; }\nint main'));
  fakeOut(d, 'pass', 0);
  const green = sdd(d, 'tdd', 'green', 'TEST-CALC-001');
  assert.equal(green.code, 0, green.out);
  const refactor = sdd(d, 'tdd', 'refactor', 'TEST-CALC-001');
  assert.doesNotMatch(refactor.out, /test body changed/);
});

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
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--characterization', 'x').code, 1);
  fakeOut(d, summary('TEST-CALC-001  |    0     1      1  0.1s'));
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, summary('TEST-CALC-001  |    1            1  0.1s\nTEST-OTHER-001  |    1     1      2  0.1s'));
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /GREEN ok/);
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

// ---- wave 3/4 dogfood-7 (#213-#224) ----
const oracleDrift = (d, id, edit) => {
  assert.equal(sdd(d, 'tdd', 'red', id).code, 0);
  fakeOut(d, 'pass', 0);
  assert.equal(sdd(d, 'tdd', 'green', id).code, 0, 'unchanged oracle keeps Green');
  edit();
  const g = sdd(d, 'tdd', 'green', id);
  assert.equal(g.code, 1, g.out);
  assert.match(g.out, /changed since Red/);
};

test('#219 JS/TS local test-support imports and data are hashed oracles; production is not', () => {
  const d = batch2Source('test/a.test.js', "import { expected } from './oracle.js';\nimport { add } from '../src/add.js';\nimport data from './data.json';\n// @id TEST-CALC-001 @verifies REQ-CALC-001\ntest('a', () => { assert.equal(add(1, 2), expected + data.n); });\n");
  writeAll(d, { 'test/oracle.js': 'export const expected = 4;\n', 'test/data.json': '{"n":0}', 'src/add.js': 'export const add = (a, b) => 0;\n' });
  fakeOut(d, 'AssertionError: 0 !== 4');
  oracleDrift(d, 'TEST-CALC-001', () => writeAll(d, { 'test/oracle.js': 'export const expected = 3;\n' }));
  writeAll(d, { 'test/oracle.js': 'export const expected = 3;\n', 'src/add.js': 'export const add = (a, b) => a + b;\n' });
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--retest', 'oracle fixed').code, 0);
});

test('#214 Python conftest.py edits stale test evidence', () => {
  const d = batch2Source('tests/test_a.py', 'def test_calc_001(val):\n    # @id TEST-CALC-001 @verifies REQ-CALC-001\n    assert val == 2\n');
  writeAll(d, { 'tests/conftest.py': 'import pytest\n@pytest.fixture\ndef val():\n    return 1\n' });
  fakeOut(d, 'E   assert 1 == 2\nFAILED tests/test_a.py::test_calc_001 - assert 1 == 2\n1 failed');
  oracleDrift(d, 'TEST-CALC-001', () => writeAll(d, { 'tests/conftest.py': 'import pytest\n@pytest.fixture\ndef val():\n    return 2\n' }));
});

test('#224 R source()/helper/data oracles are hashed', () => {
  const d = batch2Source('tests/testthat/test-a.R', 'source("oracle_b.R")\ntest_that("a", {\n  # @id TEST-CALC-001 @verifies REQ-CALC-001\n  expect_equal(f(), expected_b + helper_v() + nrow(read.csv("oracle_c.csv")))\n})\n');
  writeAll(d, { 'tests/testthat/oracle_b.R': 'expected_b <- 1\n', 'tests/testthat/oracle_c.csv': 'a\n1\n', 'tests/testthat/helper-x.R': 'helper_v <- function() 1\n' });
  fakeOut(d, 'Failure (test-a.R:4:3): a\nf() not equal to 3\n');
  oracleDrift(d, 'TEST-CALC-001', () => writeAll(d, { 'tests/testthat/helper-x.R': 'helper_v <- function() 2\n' }));
});

test('#214 Red is not a load error just because a test names SqlSyntaxError; a real SyntaxError still is', () => {
  const d = batch2Source('tests/test_a.py', 'import pytest\ndef test_calc_001():\n    # @id TEST-CALC-001 @verifies REQ-CALC-001\n    with pytest.raises(SqlSyntaxError):\n        parse("x")\n');
  fakeOut(d, '    with pytest.raises(SqlSyntaxError):\n>       parse("x")\nE       Failed: DID NOT RAISE <class \'SqlSyntaxError\'>\nFAILED tests/test_a.py::test_calc_001\n1 failed');
  const ok = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(ok.code, 0, ok.out);
  const d2 = batch2Source('tests/test_a.py', 'def test_calc_001():\n    # @id TEST-CALC-001 @verifies REQ-CALC-001\n    assert 1 == 2\n');
  fakeOut(d2, 'E     File "tests/test_a.py", line 1\nE   SyntaxError: invalid syntax\n1 error');
  assert.match(sdd(d2, 'tdd', 'red', 'TEST-CALC-001').out, /REJECTED/);
});

test('#224 R parse errors and runner load failures are load errors, not Red', () => {
  const d = batch2Source('tests/testthat/test-a.R', 'test_that("a", {\n  # @id TEST-CALC-001 @verifies REQ-CALC-001\n  stopifnot(1 == 1))\n})\n');
  for (const text of ['Error: unexpected \')\' in "  stopifnot(1 == 1))"\nExecution halted', 'Error in dyn.load(file, DLLpath = DLLpath, ...) :\n  unable to load shared object \'rlang.so\'\nExecution halted']) {
    fakeOut(d, text);
    const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /REJECTED/);
  }
});

test('#213 gate --changed still runs workspace-wide root tooling (typecheck) when only a nested project changed', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-nest-'));
  const git = (...a) => spawnSync('git', a, { cwd: d });
  const w = (f, c) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
  git('init', '-q'); git('config', 'user.email', 'a@b'); git('config', 'user.name', 't');
  w('package.json', '{"name":"r"}'); w('worker/pyproject.toml', '[project]\nname="w"\nversion="0"\n'); w('worker/a.py', 'x = 1\n'); w('other/pyproject.toml', '[project]\nname="o"\nversion="0"\n');
  sdd(d, 'init');
  const cfgPath = path.join(d, '.sdd/config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.checks = [{ name: 'typecheck', cmd: ['node', '-e', 'process.exit(1)'], changedCmd: ['node', '-e', 'process.exit(1)'] }];
  cfg.projects = [{ root: 'worker', checks: [] }, { root: 'other', checks: [] }];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  git('add', '-A'); git('commit', '-qm', 'base');
  w('worker/a.py', 'x = 2\n');
  const r = sdd(d, 'gate', '--changed');
  assert.match(r.out, /✗ cmd typecheck/);
  assert.notEqual(r.code, 0);
  cfg.checks[0].name = 'test';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  const t = sdd(d, 'gate', '--changed').out;
  assert.match(t, /cmd test: all changed files are inside nested projects \(worker\/\) — root test check skipped/);
  assert.doesNotMatch(t, /other\//);
});

test('#217 Rust `should panic` rows count and a crashed test host is not a Red', () => {
  const d = batch2Source('tests/t.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\n#[should_panic]\nfn test_calc_001() { boom(); }\n');
  writeAll(d, { 'Cargo.toml': '[package]\nname="p"\nversion="0.1.0"\nedition="2021"\n', 'src/lib.rs': 'pub fn boom() {}\n' });
  fakeOut(d, '     Running tests/t.rs (target/debug/deps/t-abc)\n\nrunning 1 test\ntest test_calc_001 - should panic ... FAILED\n\nfailures:\n\n---- test_calc_001 stdout ----\nnote: test did not panic as expected\n\ntest result: FAILED. 0 passed; 1 failed; 0 ignored;\nerror: test failed, to rerun pass `--test t`\n\nCaused by:\n  process didn\'t exit successfully: `target/debug/deps/t-abc` (exit status: 101)\n');
  const ok = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(ok.code, 0, ok.out);
  const d2 = batch2Source('tests/t.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\n#[test]\nfn test_calc_001() { deep(0); }\n');
  writeAll(d2, { 'Cargo.toml': '[package]\nname="p"\nversion="0.1.0"\nedition="2021"\n', 'src/lib.rs': 'pub fn deep(n: u64) -> u64 { deep(n) }\n' });
  for (const why of ['(signal: 6, SIGABRT: process abort signal)', '(exit status: 3)']) {
    fakeOut(d2, `     Running tests/t.rs (target/debug/deps/t-abc)\n\nrunning 1 test\nerror: test failed, to rerun pass \`--test t\`\n\nCaused by:\n  process didn't exit successfully: \`target/debug/deps/t-abc\` ${why}\n`);
    const r = sdd(d2, 'tdd', 'red', 'TEST-CALC-001', '--weak');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /crashed/);
  }
});

test('#221 --retest over a strong Red warns and the gate reports the superseded strong Red', () => {
  const d = batch2Source('test/a.test.js', "// @id TEST-CALC-001 @verifies REQ-CALC-001\ntest('a', () => { assert.equal(add(1, 2), 4); });\n");
  fakeOut(d, 'AssertionError: 3 !== 4');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  writeAll(d, { 'test/a.test.js': "// @id TEST-CALC-001 @verifies REQ-CALC-001\ntest('a', () => { assert.equal(add(1, 2), 3); });\n" });
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001', '--retest', 'typo in expectation');
  assert.match(r.out, /earlier strong Red .* superseded/);
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  assert.match(sdd(d, 'gate', '--no-run').out, /superseded an earlier strong Red/);
});

test('#220 #223 C/C++ `TEST(name) {}` macro tests get isolated hash regions', () => {
  const src = (bodyB) => `#define TEST(n) static int n(void)\n/** @id CODE-CALC-001 @implements REQ-CALC-001 */\nint impl(void) { return 0; }\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nTEST(test_calc_001) { return impl() == 1; }\n// @id TEST-CALC-002 @verifies REQ-CALC-001\nTEST(test_calc_002) { return ${bodyB}; }\n`;
  const d = batch2Source('t.c', src('2 == 2'));
  fakeOut(d, 'assertion failed: test_calc_001');
  assert.equal(sdd(d, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(d, 'pass', 0);
  writeAll(d, { 't.c': src('3 == 3') });
  assert.equal(sdd(d, 'tdd', 'green', 'TEST-CALC-001').code, 0);
  writeAll(d, { 't.c': src('3 == 3').replace('return impl() == 1', 'return impl() == 2') });
  assert.match(sdd(d, 'tdd', 'green', 'TEST-CALC-001').out, /changed since Red/);
  const g = batch2Source('t.cpp', '#include <gtest/gtest.h>\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nTEST(Suite, one) { EXPECT_EQ(1, 2); }\n// @id TEST-CALC-002 @verifies REQ-CALC-001\nTEST_F(Fix, two) { EXPECT_EQ(2, 2); }\n');
  fakeOut(g, 'Failure');
  assert.equal(sdd(g, 'tdd', 'red', 'TEST-CALC-001').code, 0);
  fakeOut(g, 'pass', 0);
  writeAll(g, { 't.cpp': '#include <gtest/gtest.h>\n// @id TEST-CALC-001 @verifies REQ-CALC-001\nTEST(Suite, one) { EXPECT_EQ(1, 2); }\n// @id TEST-CALC-002 @verifies REQ-CALC-001\nTEST_F(Fix, two) { EXPECT_EQ(2, 3); }\n// @id TEST-CALC-003 @verifies REQ-CALC-001\nTEST(Suite, three) { EXPECT_EQ(3, 3); }\n' });
  const gg = sdd(g, 'tdd', 'green', 'TEST-CALC-001'); assert.equal(gg.code, 0, gg.out);
});

test('#223 #220 macro-declared C tests use the macro argument as the exact CTest name', { skip: !has130('cmake') }, () => {
  const d = batch2Source('t.c', '#include <string.h>\n#define TEST(n) static int n(void)\n/** @id TEST-CALC-001 @verifies REQ-CALC-001 */\nTEST(test_calc_001) { return 0; }\nTEST(test_calc_001_extra) { return 1; }\nint main(int c, char **v) {\n  if (c > 1 && !strcmp(v[1], "test_calc_001")) return test_calc_001() ? 0 : 1;\n  if (c > 1 && !strcmp(v[1], "test_calc_001_extra")) return test_calc_001_extra() ? 0 : 1;\n  return 2;\n}\n');
  writeAll(d, { 'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(r C)\nenable_testing()\nadd_executable(t t.c)\nadd_test(NAME test_calc_001 COMMAND t test_calc_001)\nadd_test(NAME test_calc_001_extra COMMAND t test_calc_001_extra)\n' });
  fs.rmSync(path.join(d, '.sdd/config.json'), { force: true });
  assert.equal(sdd(d, 'init').code, 0);
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
});

test('#217 Rust macro_rules-generated tests resolve the first macro argument as the test name', () => {
  const d = batch2Source('tests/t.rs', '// @id TEST-CALC-001 @verifies REQ-CALC-001\ncase!(test_calc_001_one, { assert_eq!(1, 2) });\n');
  writeAll(d, { 'Cargo.toml': '[package]\nname="p"\nversion="0.1.0"\nedition="2021"\n' });
  fakeOut(d, 'running 1 test\ntest test_calc_001_one ... FAILED\n\nfailures:\n---- test_calc_001_one stdout ----\nassertion `left == right` failed\n\ntest result: FAILED. 0 passed; 1 failed;');
  const r = sdd(d, 'tdd', 'red', 'TEST-CALC-001');
  assert.equal(r.code, 0, r.out);
});

test('#222 PHP traits used by the test class are hashed oracles', () => {
  const d = batch2Source('tests/CalcTest.php', '<?php\nnamespace Probe\\Tests;\nuse Probe\\Support\\RowsTrait;\nfinal class CalcTest {\n    use RowsTrait;\n    // @id TEST-CALC-001 @verifies REQ-CALC-001\n    public function test_calc_001() { self::assertSame(self::rows(), 4); }\n}\n');
  writeAll(d, { 'tests/Support/RowsTrait.php': '<?php\nnamespace Probe\\Support;\ntrait RowsTrait { public static function rows(): int { return 5; } }\n' });
  fakeOut(d, 'There was 1 failure:\n1) Probe\\Tests\\CalcTest::test_calc_001\nFailed asserting that 5 is identical to 4.\nTests: 1, Assertions: 1, Failures: 1.');
  oracleDrift(d, 'TEST-CALC-001', () => writeAll(d, { 'tests/Support/RowsTrait.php': '<?php\nnamespace Probe\\Support;\ntrait RowsTrait { public static function rows(): int { return 4; } }\n' }));
});

test('#222 impact follows PHP `use function` / `use const` imports, including groups', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-i222-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const f of ['a', 'b', 'c']) w(`.sdd/specs/${f}.md`, `---\nfeature: ${f}\ntier: T1\n---\n- REQ-${f.toUpperCase()}-001 x\n`);
  w('src/A/fn.php', '<?php\nnamespace A;\nconst LIMIT = 3;\n// @id CODE-A-001 @implements REQ-A-001\nfunction twice(int $x): int { return $x * 2; }\n');
  w('src/B/D.php', '<?php\nnamespace B;\nuse function A\\twice;\nuse const A\\LIMIT;\n// @id CODE-B-001 @implements REQ-B-001\nclass D { function f() { return twice(LIMIT); } }\n');
  w('src/C/E.php', '<?php\nnamespace C;\nuse function A\\{twice as dbl};\n// @id CODE-C-001 @implements REQ-C-001\nclass E { function f() { return dbl(1); } }\n');
  sdd(d, 'init');
  const reached = JSON.parse(sdd(d, 'impact', 'src/A/fn.php', '--json').out).reachedFiles;
  assert.ok(reached.includes('src/B/D.php') && reached.includes('src/C/E.php'), reached.join(','));
});

test('#218 plan accepts an em dash as "no dependency"; impact sees `record struct` types', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-i218-'));
  const w = (f, b) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); };
  spawnSync('git', ['init', '-q'], { cwd: d });
  for (const f of ['a', 'b']) w(`.sdd/specs/${f}.md`, `---\nfeature: ${f}\ntier: T1\n---\n- REQ-${f.toUpperCase()}-001 x\n`);
  w('.sdd/plan.md', '| order | feature | depends | note |\n|---|---|---|---|\n| 1 | a | — | x |\n| 2 | b | a | y |\n');
  w('Geo/Pt.cs', 'namespace Lib.Geo;\n// @id CODE-A-001 @implements REQ-A-001\npublic readonly record struct Pt(int X, int Y);\n');
  w('Route/Route.cs', 'using Lib.Geo;\nnamespace Lib.Route;\n// @id CODE-B-001 @implements REQ-B-001\npublic class Route { Pt p; }\n');
  sdd(d, 'init');
  const pl = sdd(d, 'plan');
  assert.doesNotMatch(pl.out + pl.err, /unknown dependency/);
  assert.ok(JSON.parse(sdd(d, 'impact', 'Geo/Pt.cs', '--json').out).reachedFiles.includes('Route/Route.cs'));
});

test('#214 python tdd stub: namespace dir, __init__ re-exports and package-with-submodule layout', () => {
  const spec = '---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n';
  const t = (imports) => `${imports}\n\ndef test_a_001():\n    """@id TEST-A-001 @verifies REQ-A-001"""\n    assert Clock().tick() == 1\n`;
  const d1 = mini(spec, { 'pyproject.toml': '[project]\nname="m"\nversion="0"\n', 'src/pkg/sub/leaf.py': 'X = 1\n', 'tests/test_a.py': t('from pkg import Clock') });
  sdd(d1, 'tdd', 'stub', 'TEST-A-001');
  assert.match(fs.readFileSync(path.join(d1, 'src/pkg/__init__.py'), 'utf8'), /class Clock/);
  assert.ok(!fs.existsSync(path.join(d1, 'src/pkg.py')));
  const d2 = mini(spec, { 'pyproject.toml': '[project]\nname="m"\nversion="0"\n', 'src/pkg/__init__.py': 'from .core import Clock\n', 'src/pkg/core.py': 'class Clock:\n    def tick(self):\n        return 1\n', 'tests/test_a.py': t('from pkg import Clock') });
  const r2 = sdd(d2, 'tdd', 'stub', 'TEST-A-001');
  assert.doesNotMatch(r2.out, /not stubbed/);
  assert.equal(fs.readFileSync(path.join(d2, 'src/pkg/__init__.py'), 'utf8'), 'from .core import Clock\n');
  const d3 = mini(spec, { 'pyproject.toml': '[project]\nname="m"\nversion="0"\n', 'src/pkg/__init__.py': '', 'tests/test_a.py': t('from pkg.sql import parse\nfrom pkg.sql.ast import Clock') });
  sdd(d3, 'tdd', 'stub', 'TEST-A-001');
  assert.ok(fs.existsSync(path.join(d3, 'src/pkg/sql/__init__.py')) && fs.existsSync(path.join(d3, 'src/pkg/sql/ast.py')));
  assert.ok(!fs.existsSync(path.join(d3, 'src/pkg/sql.py')));
  assert.match(fs.readFileSync(path.join(d3, 'src/pkg/sql/__init__.py'), 'utf8'), /def parse/);
});

test('#215 go tdd stub: a member called as a method anywhere in the file is never also emitted as a struct field', { skip: spawnSync('which', ['go']).status !== 0 }, () => {
  const d = mini('---\nfeature: a\ntier: T1\n---\n| REQ-A-001 | x shall hold. | TEST-A-001 |\n', {
    'go.mod': 'module example.com/kv/core\n\ngo 1.22\n',
    'ring/ring_test.go': [
      'package ring_test', '', 'import (', '\t"testing"', '', '\t"example.com/kv/core/ring"', ')', '',
      'func build(t testing.TB) *ring.Ring {', '\tt.Helper()', '\treturn ring.New(8)', '}', '',
      '// @id TEST-A-001', 'func TestA001(t *testing.T) {', '\tr := build(t)', '\t_ = r.Locate', '}', '',
      '// @id TEST-A-002', 'func TestA002(t *testing.T) {', '\tr := build(t)', '\t_, _ = r.Locate("k")', '}', '',
    ].join('\n'),
  });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const body = fs.readFileSync(path.join(d, 'ring/ring.go'), 'utf8');
  assert.match(body, /func \(\*?Ring\) Locate/);
  assert.doesNotMatch(body, /^\tLocate any$/m);
  assert.doesNotMatch(sdd(d, 'tdd', 'stub', 'TEST-A-001').out, /same name/);
});

test('#218 C# tdd stub honours `global using` namespaces declared in another file of the test project', DN, (t) => {
  const d = tree({
    'src/Lib/Lib.csproj': libProj(),
    'tests/T/T.csproj': testProj(XUNIT, ['..\\..\\src\\Lib\\Lib.csproj']),
    'tests/T/GlobalUsings.cs': 'global using Xunit;\nglobal using Lib.Calc;\n',
    'tests/T/CalcTests.cs': [
      'namespace T;', '', 'public class CalcTests', '{', '    /** @id TEST-A-001 @verifies REQ-A-001 */', '    [Fact]', '    public void adds()', '    {',
      '        Assert.Equal(3, Calculator.Add(1, 2));', '    }', '}', '',
    ].join('\n'),
  });
  if (!restores(d, 'tests/T/T.csproj')) return t.skip('NuGet packages cannot be restored');
  const r = sddRaw(d, 'tdd', 'stub', 'TEST-A-001');
  assert.ok(fs.existsSync(path.join(d, 'src/Lib/Calculator.cs')), r.out);
  assert.match(fs.readFileSync(path.join(d, 'src/Lib/Calculator.cs'), 'utf8'), /namespace Lib\.Calc;/);
  assert.match(r.out, /compile-checked/);
});

test('#219 JS tdd stub: require() of a missing relative module and dynamic import of a workspace package', () => {
  const d = jsStubProject({
    'package.json': '{"name":"root","private":true,"workspaces":["packages/*"],"scripts":{"test":"true"}}',
    'packages/lib/package.json': '{"name":"@x/lib","type":"module","main":"src/index.js"}',
    'packages/lib/src/index.js': 'export const one = () => 1;\n',
    'packages/app/test/a.test.cjs': "const { add } = require('../src/add.cjs');\n/** @id TEST-A-001 @verifies REQ-A-001 */\nit('TEST-A-001 adds', () => { add(1, 2); });\n",
    'packages/app/test/b.test.js': "/** @id TEST-A-002 @verifies REQ-A-002 */\nit('TEST-A-002 dyn', async () => {\n  const m = await import('@x/lib');\n  m.three();\n});\n",
  });
  sdd(d, 'tdd', 'stub', 'TEST-A-001');
  const cjs = fs.readFileSync(path.join(d, 'packages/app/src/add.cjs'), 'utf8');
  assert.match(cjs, /function add\(/);
  assert.match(cjs, /module\.exports = \{ add \}/);
  assert.doesNotMatch(cjs, /\bexport\b/);
  assert.equal(spawnSync('node', ['--check', path.join(d, 'packages/app/src/add.cjs')]).status, 0);
  sdd(d, 'tdd', 'stub', 'TEST-A-002');
  const lib = fs.readFileSync(path.join(d, 'packages/lib/src/index.js'), 'utf8');
  assert.match(lib, /^export const one = \(\) => 1;\n/);
  assert.match(lib, /three/);
});

test('#222 PHP tdd stub: enum cases with instance methods, `use function` / `use const` namespaced symbols', { skip: spawnSync('which', ['php']).status !== 0 }, () => {
  const spec = '---\nfeature: k\ntier: T1\n---\n| REQ-K-001 | x shall hold. | TEST-K-001 |\n| REQ-K-002 | y shall hold. | TEST-K-002 |\n';
  const d = mini(spec, {
    'composer.json': '{"autoload":{"psr-4":{"Kernel\\\\":"src/"}}}',
    'tests/KTest.php': [
      '<?php', 'use PHPUnit\\Framework\\TestCase;', 'use function Kernel\\{clamp, stable_id};', 'use const Kernel\\MAX_NIGHTS;', 'use Kernel\\Level;', '',
      'final class KTest extends TestCase', '{',
      '    /** @id TEST-K-001 @verifies REQ-K-001 */',
      "    public function test_k_001(): void { $this->assertSame(3, clamp(5, MAX_NIGHTS)); $this->assertSame('a', stable_id('a')); }",
      '    /** @id TEST-K-002 @verifies REQ-K-002 */',
      '    public function test_k_002(): void { $this->assertSame(2, Level::High->rank()); }', '}', '',
    ].join('\n'),
  });
  sdd(d, 'tdd', 'stub', 'TEST-K-001');
  const fns = fs.readFileSync(path.join(d, 'src/functions.php'), 'utf8');
  assert.match(fns, /namespace Kernel;/);
  assert.match(fns, /function clamp\(/);
  assert.match(fns, /function stable_id\(/);
  assert.match(fns, /const MAX_NIGHTS/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'composer.json'), 'utf8')).autoload.files, ['src/functions.php']);
  assert.equal(spawnSync('php', ['-l', path.join(d, 'src/functions.php')]).status, 0);
  sdd(d, 'tdd', 'stub', 'TEST-K-002');
  const en = fs.readFileSync(path.join(d, 'src/Level.php'), 'utf8');
  assert.match(en, /enum Level/);
  assert.match(en, /case High/);
  assert.match(en, /public function rank\(/);
  assert.doesNotMatch(en, /static function rank/);
});
