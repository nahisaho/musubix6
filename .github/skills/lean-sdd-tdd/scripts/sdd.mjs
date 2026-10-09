#!/usr/bin/env node
// Lean SDD/TDD evidence tool. Zero dependencies, Node >= 20.
// Commands: init | approve prepare|record | guard | tdd red|green|refactor|check | trace | gate | status
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BOOL = new Set(['missing-module', 'baseline', 'weak', 'changed', 'json', 'no-run', 'help']);
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (BOOL.has(k) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) flags[k] = true;
      else flags[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, flags };
}

const { pos, flags } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(typeof flags.root === 'string' ? flags.root : process.cwd());
const SDD = path.join(ROOT, '.sdd');
const SPECS = path.join(SDD, 'specs');
const CONFIG = path.join(SDD, 'config.json');
const APPROVALS = path.join(SDD, 'approvals.json');
const LEDGER = path.join(SDD, 'tdd.jsonl');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const fileSha = (p) => sha(fs.readFileSync(path.join(ROOT, p)));
const out = (s = '') => process.stdout.write(s + '\n');
const tail = (s, n = 15) => s.trimEnd().split('\n').slice(-n).join('\n');

// ---------- scanning ----------
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|kt|rb|sh)$/;
const SKIP = /(^|\/)(node_modules|\.git|\.sdd|dist|build|coverage|target|\.venv|venv)\//;
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*$/, '\u0001').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');
function scanFilter(files) {
  const sc = (readJson(CONFIG, null) ?? {}).scan ?? {};
  const inc = (sc.include ?? []).map(globRe);
  const exc = (sc.exclude ?? []).map(globRe);
  return files.filter((f) => (!inc.length || inc.some((r) => r.test(f))) && !exc.some((r) => r.test(f)));
}
function listFiles() {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
  let files;
  if (r.status === 0) files = r.stdout.split('\n').filter(Boolean);
  else {
    files = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (SKIP.test(rel(p) + '/')) continue;
        if (e.isDirectory()) walk(p); else files.push(rel(p));
      }
    };
    walk(ROOT);
  }
  return scanFilter(files).filter((f) => EXT.test(f) && !SKIP.test(f) && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size < 512 * 1024);
}

const ID_RE = /[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+/g;
const COMMENT_LEAD = /^\s*(\*|\/\/|#|\/\*|--|;)/;
// marks lines that start inside a multi-line JS/TS template literal (embedded fixtures)
function templateLines(lines, f) {
  const flags = new Array(lines.length).fill(false);
  if (!/\.[cm]?[jt]sx?$/.test(f)) return flags;
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    flags[i] = open;
    if (!open && COMMENT_LEAD.test(lines[i])) continue;
    const n = (lines[i].replace(/\\./g, '').match(/`/g) ?? []).length;
    if (n % 2) open = !open;
  }
  return flags;
}
function scanEntities(files) {
  const ents = new Map();
  const dups = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    const inTpl = templateLines(lines, f);
    for (let i = 0; i < lines.length; i++) {
      if (inTpl[i] || !COMMENT_LEAD.test(lines[i])) continue;
      const m = /@id\s+([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)/.exec(lines[i]);
      if (!m) continue;
      let block = lines[i];
      for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
        if (!COMMENT_LEAD.test(lines[j]) || /@id\s/.test(lines[j])) break;
        block += '\n' + lines[j];
      }
      const refs = { implements: [], verifies: [], design: [] };
      for (const t of block.matchAll(/@(implements|verifies|design)\s+([^@\n]*)/g)) {
        refs[t[1]].push(...(t[2].match(ID_RE) ?? []));
      }
      const id = m[1];
      const ent = { id, kind: id.split('-')[0], path: f, line: i + 1, refs };
      if (ents.has(id)) dups.push(`${id} (${ents.get(id).path}:${ents.get(id).line} & ${f}:${i + 1})`);
      else ents.set(id, ent);
    }
  }
  return { ents, dups };
}

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const fm = {};
  if (m) for (const l of m[1].split('\n')) { const kv = /^(\w+):\s*(.*)$/.exec(l); if (kv) fm[kv[1]] = kv[2].trim(); }
  return fm;
}
function loadSpecs() {
  const specs = [];
  if (!fs.existsSync(SPECS)) return specs;
  for (const f of fs.readdirSync(SPECS).filter((x) => x.endsWith('.md')).sort()) {
    const p = `.sdd/specs/${f}`;
    const text = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const fm = parseFrontmatter(text);
    const reqs = [];
    text.split('\n').forEach((l, i) => {
      const m = /^[\s|#>*-]*\*{0,2}(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*)/.exec(l);
      if (m) reqs.push({ id: m[1], line: i + 1, deferred: /deferred/i.test(l) });
    });
    const extra = fm.artifacts ? fm.artifacts.split(',').map((s) => s.trim()).filter(Boolean) : [];
    specs.push({ path: p, feature: fm.feature || f.replace(/\.md$/, ''), tier: (fm.tier || 'T1').toUpperCase(), approval: (fm.approval || 'auto').toLowerCase(), reqs, artifacts: [p, ...extra] });
  }
  return specs;
}

// ---------- approval ----------
function approvalState(spec) {
  const a = readJson(APPROVALS, {})[spec.feature];
  if (!a) return 'missing';
  for (const p of spec.artifacts) {
    if (!fs.existsSync(path.join(ROOT, p)) || a.artifacts?.[p] !== fileSha(p)) return 'stale';
  }
  return 'ok';
}

// ---------- ledger ----------
function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const entryHash = (e) => { const { hash, ...rest } = e; return sha(JSON.stringify(rest)); };
function verifyChain(entries) {
  let prev = '';
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].prev !== prev || entries[i].hash !== entryHash(entries[i])) return `broken at seq ${entries[i].seq ?? i}`;
    prev = entries[i].hash;
  }
  return null;
}
function appendLedger(e) {
  const entries = readLedger();
  const full = { v: 1, seq: entries.length + 1, ...e, at: new Date().toISOString(), prev: entries.at(-1)?.hash ?? '' };
  full.hash = entryHash(full);
  fs.mkdirSync(SDD, { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(full) + '\n');
}
function evidenceStatus(testId, testPath, entries) {
  const es = entries.filter((e) => e.test === testId);
  const g = es.filter((e) => e.type === 'green').at(-1);
  if (!g) return { ok: false, why: 'no Green recorded' };
  const r = es.filter((e) => e.type === 'red' && e.seq < g.seq && e.fileSha === g.fileSha).at(-1);
  if (!r) return { ok: false, why: 'no Red preceding Green with same test hash' };
  const last = es.filter((e) => e.type === 'green' || e.type === 'refactor').at(-1);
  if (last.fileSha !== fileSha(testPath)) return { ok: false, why: 'test changed since last Green/Refactor' };
  return { ok: true, weak: !!r.weak };
}

// ---------- config / commands ----------
function detectConfig() {
  const pkg = readJson(path.join(ROOT, 'package.json'), null);
  const has = (f) => fs.existsSync(path.join(ROOT, f));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let testCmd;
  if (deps.vitest) testCmd = ['npx', 'vitest', 'run', '{file}', '-t', '{id}'];
  else if (deps.jest) testCmd = ['npx', 'jest', '{file}', '-t', '{id}'];
  else if (has('pyproject.toml') || has('pytest.ini') || has('requirements.txt')) testCmd = ['pytest', '-q', '{file}', '-k', '{idu}'];
  else if (has('go.mod')) testCmd = ['go', 'test', './...', '-run', '{idu}'];
  else if (has('Cargo.toml')) testCmd = ['cargo', 'test', '{idu}'];
  else testCmd = ['node', '--test', '--test-name-pattern', '{id}', '{file}'];
  const checks = [];
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
  const related = deps.vitest ? ['npx', 'vitest', 'related', '--run', '{changedFiles}'] : deps.jest ? ['npx', 'jest', '--findRelatedTests', '{changedFiles}'] : undefined;
  for (const s of ['typecheck', 'lint', 'test']) if (pkg?.scripts?.[s]) checks.push({ name: s, cmd: [pm, 'run', s], ...(s === 'test' && related ? { changedCmd: related } : {}) });
  return { schemaVersion: 1, testCmd, checks, timeoutMs: 120000 };
}
const loadConfig = () => readJson(CONFIG, null) ?? detectConfig();

function run(cmd, timeoutMs) {
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64e6 });
  const text = (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? String(r.error.message) : '');
  return { exit: r.status ?? (r.error ? 127 : 1), text, ms: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT' };
}
const LOAD_ERR = /(cannot find (module|package)|modulenotfounderror|importerror|syntaxerror|cannot resolve|no such file|undefined reference|could not compile|error\[e\d+\]|failed to resolve import)/i;
// a missing *relative* import that the test file itself references = declared new module
function declaredMissingModule(text, testPath) {
  const src = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  const m = /(?:cannot find (?:module|package)|failed to resolve import|err_module_not_found)[^\n]*?['"`]((?:\.{1,2}\/|\/)[^'"`]+)['"`]/i.exec(text);
  if (!m) return false;
  const dir = path.resolve(ROOT, path.dirname(testPath));
  const abs = path.resolve(dir, m[1]);
  const spec = m[1].startsWith('.') ? m[1] : './' + path.relative(dir, abs).split(path.sep).join('/');
  const bare = spec.replace(/\.[cm]?[jt]sx?$/, '');
  return (src.includes(spec) || src.includes(bare)) && !fs.existsSync(abs);
}
const ZERO_TESTS = /(no tests? (found|ran|collected)|# tests 0\b|ran 0 tests|collected 0 items|0 tests? (ran|found|passed)\b|no test files found)/i;

// ---------- commands ----------
function cmdInit() {
  const cfg = detectConfig();
  if (!fs.existsSync(CONFIG)) writeJson(CONFIG, cfg);
  fs.mkdirSync(SPECS, { recursive: true });
  out(`init ok: ${rel(CONFIG)} (testCmd: ${cfg.testCmd.join(' ')}; checks: ${cfg.checks.map((c) => c.name).join(',') || 'none'})`);
  out('next: write .sdd/specs/<feature>.md (see references/spec-template.md)');
}

function cmdApprove() {
  const sub = pos[1];
  const specs = loadSpecs();
  const feature = pos[2];
  const spec = specs.find((s) => s.feature === feature);
  if (!spec) { out(`unknown feature "${feature ?? ''}". known: ${specs.map((s) => s.feature).join(', ') || 'none'}`); return 2; }
  if (sub === 'prepare') {
    out(`feature ${spec.feature} (${spec.tier}) — state: ${approvalState(spec)}`);
    for (const p of spec.artifacts) out(`  ${p}  sha256:${fileSha(p)}`);
    out(`requirements: ${spec.reqs.map((r) => r.id).join(', ')}`);
    out(spec.approval === 'human'
      ? 'approval: human — show these exact paths/hashes/residual risks to the human, then: approve record <feature> --by <name>'
      : 'approval: auto — after independent AI review passes: approve record <feature> --by ai:<reviewer> [--review "<summary>"] (no human needed)');
    return 0;
  }
  if (sub === 'record') {
    if (typeof flags.by !== 'string') { out('--by <name> required (ai:<reviewer> for auto specs, human name for approval: human)'); return 2; }
    const isAi = /^ai:/i.test(flags.by);
    if (spec.approval === 'human' && isAi) { out(`REFUSED: ${spec.feature} requires a human approver (approval: human)`); return 1; }
    const review = typeof flags.review === 'string' ? flags.review.trim() : '';
    if (isAi && (/^ai:\s*(self)?$/i.test(flags.by) || !review)) { out('REFUSED: ai approver needs a named reviewer (not ai:self) and --review <path-or-summary>'); return 1; }
    const reviewIsFile = !!review && fs.existsSync(path.join(ROOT, review)) && fs.statSync(path.join(ROOT, review)).isFile();
    if (isAi && !reviewIsFile && loadConfig().requireReviewFile) { out('REFUSED: config requireReviewFile — --review must be a file (e.g. .sdd/review.md)'); return 1; }
    if (isAi && reviewIsFile) {
      const text = fs.readFileSync(path.join(ROOT, review), 'utf8');
      const isOpen = (l) => /^\s*[-*]\s*\[ \]/.test(l) || /\b(state|status)\s*[:=]\s*open\b/i.test(l) || l.split('|').some((c) => /^\s*open\s*$/i.test(c));
      const open = text.split('\n').filter(isOpen);
      if (open.length) { out(`REFUSED: ${review} has ${open.length} Open finding(s)`); open.slice(0, 5).forEach((l) => out(`  ${l.trim()}`)); return 1; }
      const specHash = fileSha(spec.path);
      if (!text.includes(specHash.slice(0, 12))) { out(`REFUSED: ${review} must reference the spec hash (sha256:${specHash.slice(0, 12)}… of ${spec.path})`); return 1; }
    }
    const all = readJson(APPROVALS, {});
    all[spec.feature] = { by: flags.by, kind: isAi ? 'ai' : 'human', review: review || undefined, reviewSha: review && fs.existsSync(path.join(ROOT, review)) && fs.statSync(path.join(ROOT, review)).isFile() ? fileSha(review) : undefined, at: new Date().toISOString(), artifacts: Object.fromEntries(spec.artifacts.map((p) => [p, fileSha(p)])) };
    writeJson(APPROVALS, all);
    out(`locked ${spec.feature} by ${flags.by}: ${spec.artifacts.join(', ')}`);
    return 0;
  }
  out('usage: approve prepare|record <feature> [--by name]');
  return 2;
}

function cmdGuard() {
  const specs = loadSpecs().filter((s) => !pos[1] || s.feature === pos[1]);
  if (!specs.length) { out('GUARD FAIL: no spec found in .sdd/specs'); return 1; }
  let bad = 0;
  for (const s of specs) {
    const st = s.tier === 'T2' ? approvalState(s) : 'n/a';
    if (st !== 'ok' && st !== 'n/a') { out(`GUARD FAIL ${s.feature} (T2): approval ${st}`); bad++; }
  }
  if (!bad) out(`GUARD OK (${specs.length} spec${specs.length > 1 ? 's' : ''})`);
  return bad ? 1 : 0;
}

function stubFor(testPath) {
  const src = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  const dir = path.resolve(ROOT, path.dirname(testPath));
  const made = [];
  const add = (abs, body) => { if (fs.existsSync(abs)) return; fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); made.push(rel(abs)); };
  const names = (clause) => {
    const named = /\{([^}]*)\}/.exec(clause)?.[1].split(',').map((x) => x.trim()).filter((x) => x && !/^type\s/.test(x)).map((x) => x.split(/\s+as\s+/)[0]) ?? [];
    const def = /^\s*([A-Za-z_$][\w$]*)\s*(,|$)/.exec(clause.replace(/^type\s+/, ''))?.[1];
    return { named, def };
  };
  if (/\.py$/.test(testPath)) {
    for (const m of src.matchAll(/^\s*from\s+(\.*[\w.]+)\s+import\s+([^\n#]+)/gm)) {
      const mod = m[1];
      const base = mod.startsWith('.') ? dir : ROOT;
      const abs = path.join(base, ...mod.replace(/^\.+/, '').split('.')) + '.py';
      if (fs.existsSync(abs) || fs.existsSync(abs.replace(/\.py$/, '/__init__.py'))) continue;
      const ns = m[2].replace(/[()]/g, '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      add(abs, ns.map((n) => /^[A-Z]/.test(n) ? `class ${n}:\n    def __init__(self, *a, **k):\n        raise NotImplementedError("${n}")\n` : `def ${n}(*a, **k):\n    raise NotImplementedError("${n}")\n`).join('\n\n'));
    }
    return made;
  }
  const ts = /\.[cm]?tsx?$/.test(testPath);
  for (const m of src.matchAll(/import\s+([^'"\n;]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const spec = m[2];
    const abs = path.resolve(dir, spec);
    const exts = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.js'];
    const stem = abs.replace(/\.[cm]?[jt]sx?$/, '');
    if (exts.some((e) => fs.existsSync(abs + e) || fs.existsSync(stem + e))) continue;
    const target = /\.[cm]?[jt]sx?$/.test(abs) ? (ts ? stem + '.ts' : abs) : abs + (ts ? '.ts' : '.js');
    const { named, def } = names(m[1].replace(/^\*\s+as\s+\w+$/, ''));
    const fn = (n) => ts ? `export function ${n}(..._args: any[]): any {\n  throw new Error('not implemented: ${n}');\n}\n` : `export function ${n}() {\n  throw new Error('not implemented: ${n}');\n}\n`;
    let body = named.map(fn).join('\n');
    if (def) body += (body ? '\n' : '') + (ts ? `export default function ${def}(..._args: any[]): any {\n  throw new Error('not implemented: ${def}');\n}\n` : `export default function ${def}() {\n  throw new Error('not implemented: ${def}');\n}\n`);
    add(target, body || 'export {};\n');
  }
  return made;
}

function cmdTdd() {
  const sub = pos[1];
  const files = listFiles();
  const { ents } = scanEntities(files);
  if (sub === 'check') {
    const entries = readLedger();
    const bad = verifyChain(entries);
    out(bad ? `LEDGER FAIL: ${bad}` : `LEDGER OK (${entries.length} entries)`);
    return bad ? 1 : 0;
  }
  if (sub === 'stub') {
    const t = ents.get(pos[2]);
    if (!t || t.kind !== 'TEST') { out(`${pos[2]} not found as "@id TEST-..." annotation in source`); return 2; }
    const made = stubFor(t.path);
    out(made.length ? `stubbed (throwing, Red-safe): ${made.join(', ')} — now run: tdd red ${t.id}` : `no missing relative imports in ${t.path}`);
    return 0;
  }
  if (!['red', 'green', 'refactor'].includes(sub)) { out('usage: tdd red|green|refactor <TEST-ID> [--req REQ] [--weak] | tdd stub <TEST-ID> | tdd check'); return 2; }
  const id = pos[2];
  const t = ents.get(id);
  if (!t || t.kind !== 'TEST') { out(`${id} not found as "@id TEST-..." annotation in source`); return 2; }
  const req = typeof flags.req === 'string' ? flags.req : t.refs.verifies[0];
  const specs = loadSpecs();
  const spec = specs.find((s) => s.reqs.some((r) => r.id === req));
  if (!req || !spec) { out(`${id}: no @verifies REQ defined in a spec (.sdd/specs). add @verifies or --req`); return 2; }
  if (spec.tier === 'T2' && approvalState(spec) !== 'ok') { out(`REFUSED: T2 feature ${spec.feature} approval is ${approvalState(spec)}. run: approve prepare ${spec.feature}`); return 1; }

  const entries = readLedger();
  const before = fileSha(t.path);
  const prior = entries.filter((e) => e.test === id);
  if (sub === 'green') {
    const r = prior.filter((e) => e.type === 'red').at(-1);
    if (!r) { out(`REFUSED: no Red recorded for ${id}`); return 1; }
    if (r.fileSha !== before) { out(`REFUSED: test file changed since Red (${t.path}). revert test edits, or record a new Red`); return 1; }
  }
  if (sub === 'refactor' && !prior.some((e) => e.type === 'green')) { out(`REFUSED: no Green recorded for ${id}`); return 1; }

  const cfg = loadConfig();
  const cmd = cfg.testCmd.map((a) => a.replaceAll('{id}', id).replaceAll('{idu}', id.toLowerCase().replaceAll('-', '_')).replaceAll('{file}', t.path));
  const res = run(cmd, cfg.timeoutMs ?? 120000);
  const after = fileSha(t.path);
  if (after !== before) { out(`REFUSED: ${t.path} changed while running (formatter/watch?)`); return 1; }

  const zero = ZERO_TESTS.test(res.text);
  let ok;
  let why = '';
  if (sub === 'red') {
    if (res.exit === 0) { ok = false; why = 'test passed; Red needs a real failure'; }
    else if (zero) { ok = false; why = 'no test matched the ID (check @id vs test title)'; }
    else if (LOAD_ERR.test(res.text) && !flags.weak && !(flags['missing-module'] && declaredMissingModule(res.text, t.path))) { ok = false; why = 'load/compile error, not an assertion failure. add a failing stub, or --weak to record as weak Red'; }
    else ok = true;
  } else {
    if (res.exit !== 0) { ok = false; why = 'test failed'; }
    else if (zero) { ok = false; why = 'no test matched the ID'; }
    else ok = true;
  }
  if (!ok) { out(`${sub.toUpperCase()} REJECTED ${id}: ${why}`); out(tail(res.text, 12)); return 1; }
  appendLedger({ type: sub, test: id, req, file: t.path, fileSha: after, cmdSha: sha(cmd.join('\u0000')), exit: res.exit, ms: res.ms, weak: sub === 'red' && LOAD_ERR.test(res.text) && !(flags['missing-module'] && declaredMissingModule(res.text, t.path)) ? true : undefined });
  out(`${sub.toUpperCase()} ok ${id} (${req}) ${res.ms}ms${sub === 'red' && LOAD_ERR.test(res.text) && !(flags['missing-module'] && declaredMissingModule(res.text, t.path)) ? ' [weak]' : ''}`);
  return 0;
}

function traceCheck(ents, dups, specs) {
  const errors = [];
  const warnings = [];
  const reqs = new Map();
  for (const s of specs) for (const r of s.reqs) { if (reqs.has(r.id)) errors.push(`duplicate REQ ${r.id}`); else reqs.set(r.id, { ...r, spec: s }); }
  if (!specs.length) return { errors: [], warnings: ['no specs'], reqs, tested: new Set(), noSpecs: true };
  for (const d of dups.slice(0, 20)) errors.push(`duplicate @id ${d}`);
  if (dups.length > 20) errors.push(`... and ${dups.length - 20} more duplicate @id`);
  const tested = new Set();
  const implemented = new Set();
  for (const e of ents.values()) {
    for (const r of [...e.refs.implements, ...e.refs.verifies]) if (r.startsWith('REQ-') && !reqs.has(r)) errors.push(`${e.path}:${e.line} ${e.id} references unknown ${r}`);
    if (e.kind === 'TEST') {
      if (!e.refs.verifies.length) errors.push(`${e.path}:${e.line} ${e.id} has no @verifies`);
      e.refs.verifies.forEach((r) => tested.add(r));
    }
    if (e.kind === 'CODE') {
      if (!e.refs.implements.length) errors.push(`${e.path}:${e.line} ${e.id} has no @implements`);
      e.refs.implements.forEach((r) => implemented.add(r));
    }
  }
  for (const r of reqs.values()) {
    if (r.deferred) continue;
    if (!tested.has(r.id)) errors.push(`${r.id} has no test (@verifies)`);
    if (!implemented.has(r.id)) warnings.push(`${r.id} has no @implements code`);
  }
  return { errors, warnings, reqs, tested };
}

const BASELINE = path.join(SDD, 'trace-baseline.json');
const errKey = (e) => e.replace(/:\d+/g, '');
function applyBaseline(t) {
  const base = readJson(BASELINE, null);
  if (!base && !flags.changed) return t;
  const known = new Set(base?.errors ?? []);
  const ch = flags.changed ? changedFiles() : null;
  const keep = (e) => !known.has(errKey(e)) && (base || !ch || [...ch].some((f) => e.includes(f)));
  return { ...t, errors: t.errors.filter(keep) };
}

function cmdTrace() {
  const { ents, dups } = scanEntities(listFiles());
  let t = traceCheck(ents, dups, loadSpecs());
  if (flags.baseline) {
    writeJson(BASELINE, { at: new Date().toISOString(), errors: t.errors.map(errKey) });
    out(`baseline written: ${rel(BASELINE)} (${t.errors.length} errors)`);
    return 0;
  }
  t = applyBaseline(t);
  out(`TRACE ${t.errors.length ? 'FAIL' : 'OK'}: ${t.reqs.size} REQ, ${ents.size} annotated entities, ${t.errors.length} errors, ${t.warnings.length} warnings`);
  [...t.errors.slice(0, 10).map((e) => `  ✗ ${e}`), ...t.warnings.slice(0, 5).map((w) => `  ! ${w}`)].forEach((l) => out(l));
  return t.errors.length ? 1 : 0;
}

function changedFiles() {
  const set = new Set();
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  if (st.status === 0) for (const l of st.stdout.split('\n').filter(Boolean)) set.add(l.slice(3).split(' -> ').pop());
  return set;
}

function cmdGate() {
  const lines = [];
  let fail = false;
  let incomplete = false;
  const add = (ok, msg, extra = []) => { lines.push(`${ok ? '✓' : '✗'} ${msg}`); extra.forEach((x) => lines.push(`    ${x}`)); if (!ok) fail = true; };

  const specs = loadSpecs();
  const { ents, dups } = scanEntities(listFiles());
  if (!specs.length) add(false, 'spec: none in .sdd/specs (T0 changes need no gate)');
  for (const s of specs.filter((x) => x.tier === 'T2')) { const st = approvalState(s); const ap = readJson(APPROVALS, {})[s.feature]; add(st === 'ok', `lock ${s.feature}: ${st}${ap ? ` [${ap.kind}${ap.kind === 'ai' ? `, review ${ap.review ? (ap.reviewSha ? 'file' : 'summary') : 'none'}` : ''}]` : ''}${s.approval === 'human' ? ' (human required)' : ''}`); }

  const t = applyBaseline(traceCheck(ents, dups, specs));
  add(!t.errors.length, `trace: ${t.reqs.size} REQ, ${t.errors.length} errors${t.warnings.length ? `, ${t.warnings.length} warnings` : ''}`, t.errors.slice(0, 6));

  const entries = readLedger();
  const chain = verifyChain(entries);
  add(!chain, `ledger: ${chain ?? `${entries.length} entries, chain intact`}`);

  let relevant = new Set([...t.reqs.keys()]);
  if (flags.changed) {
    const ch = changedFiles();
    relevant = new Set();
    for (const e of ents.values()) if (ch.has(e.path)) [...e.refs.implements, ...e.refs.verifies].forEach((r) => relevant.add(r));
    for (const s of specs) if (ch.has(s.path)) s.reqs.forEach((r) => relevant.add(r.id));
  }
  const problems = [];
  let covered = 0;
  let weak = 0;
  let total = 0;
  for (const id of relevant) {
    const r = t.reqs.get(id);
    if (!r || r.deferred) continue;
    for (const e of ents.values()) {
      if (e.kind !== 'TEST' || !e.refs.verifies.includes(id)) continue;
      total++;
      const s = evidenceStatus(e.id, e.path, entries);
      if (s.ok) { covered++; if (s.weak) weak++; } else problems.push(`${e.id} (${id}): ${s.why}`);
    }
  }
  add(!problems.length, `tdd evidence${flags.changed ? ' (changed scope)' : ''}: ${covered}/${total} tests Red→Green${weak ? `, ${weak} weak Red` : ''}`, problems.slice(0, 6));

  const cfg = loadConfig();
  if (flags['no-run']) { lines.push('! commands: SKIPPED (--no-run) — result is INCOMPLETE'); incomplete = true; }
  else for (const c of cfg.checks ?? []) {
    let cmd = c.cmd;
    let scoped = false;
    if (flags.changed && c.changedCmd) {
      const ch = [...changedFiles()].filter((f) => !f.startsWith('.sdd/') && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
      const tests = ch.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/.test(f));
      if (!ch.length) { lines.push(`! cmd ${c.name}: no changed files — skipped`); continue; }
      const scopes = [...new Set(ch.filter((f) => !tests.includes(f)).map((f) => /^(packages|apps|libs)\/[^/]+/.exec(f)?.[0] ?? path.posix.dirname(f)))];
      const subst = { '{changedFiles}': ch, '{changedTests}': tests, '{changedScopes}': scopes };
      cmd = c.changedCmd.flatMap((a) => subst[a] ?? [a]);
      scoped = true;
    }
    const r = run(cmd, scoped ? (c.changedTimeoutMs ?? cfg.changedTimeoutMs ?? 60000) : (c.timeoutMs ?? cfg.timeoutMs ?? 120000));
    if (r.timedOut) { add(false, `cmd ${c.name} TIMEOUT after ${(r.ms / 1000).toFixed(0)}s ${scoped ? '— narrow changedCmd (e.g. {changedTests} {changedScopes}) or raise changedTimeoutMs; run full gate (no --changed) before merge' : '— raise timeoutMs in .sdd/config.json'}`); continue; }
    add(r.exit === 0, `cmd ${c.name} (${(r.ms / 1000).toFixed(1)}s)`, r.exit === 0 ? [] : tail(r.text, 8).split('\n'));
  }
  if (!flags['no-run'] && !(cfg.checks ?? []).length) { lines.push('! commands: none configured — nothing was run'); incomplete = true; }

  const verdict = fail ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS';
  if (flags.json) out(JSON.stringify({ verdict, lines }));
  else { out(`SDD GATE ${verdict}`); lines.forEach((l) => out(l)); }
  return fail ? 1 : incomplete ? 2 : 0;
}

function cmdStatus() {
  const specs = loadSpecs();
  const { ents } = scanEntities(listFiles());
  const entries = readLedger();
  const ap = specs.map((s) => `${s.feature}:${s.tier}:${s.tier === 'T2' ? approvalState(s) : 'n/a'}`).join(' ');
  out(`specs ${specs.length} [${ap}] | entities ${ents.size} | ledger ${entries.length}`);
  return 0;
}

const cmds = { init: cmdInit, approve: cmdApprove, guard: cmdGuard, tdd: cmdTdd, trace: cmdTrace, gate: cmdGate, status: cmdStatus };
const fn = cmds[pos[0]];
if (!fn) {
  out('usage: sdd.mjs init | approve prepare|record <feature> | guard | tdd red|green|refactor <TEST-ID> | tdd stub <TEST-ID> | tdd check | trace [--baseline] | gate [--changed] [--no-run] | status   [--root dir]\n  tdd red: tdd red --missing-module accepts a Red caused by the test own not-yet-created import (non-weak); approve record --by ai:<reviewer> needs --review <path|summary>');
  process.exit(2);
}
process.exit(fn() ?? 0);
