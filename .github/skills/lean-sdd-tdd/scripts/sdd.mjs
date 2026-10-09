#!/usr/bin/env node
// Lean SDD/TDD evidence tool. Zero dependencies, Node >= 20.
// Commands: init | approve prepare|record | guard | tdd red|green|refactor|check | trace | gate | status
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BOOL = new Set(['allow-setup-red', 'missing-module', 'baseline', 'weak', 'changed', 'json', 'no-run', 'help']);
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
// Files mixing implementation and tests (e.g. Rust #[cfg(test)]) hash only the test's own @id region
const testSha = (p, id) => {
  const txt = fs.readFileSync(path.join(ROOT, p), 'utf8');
  if (!/@implements\b/.test(txt)) return sha(txt);
  const ls = txt.split('\n');
  const start = ls.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  if (start < 0) return sha(txt);
  let end = ls.findIndex((l, i) => i > start && /@id\s/.test(l));
  if (end < 0) end = ls.length;
  return sha(ls.slice(start, end).join('\n'));
};
const out = (s = '') => process.stdout.write(s + '\n');
const tail = (s, n = 15) => s.trimEnd().split('\n').slice(-n).join('\n');

// ---------- scanning ----------
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|kt|rb|sh|c|h|cc|cpp|cxx|hpp|hh)$/;
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
const REGEX_KW = /(?:^|[^\w$.])(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/;
// a '/' starts a regex literal when the previous token cannot end an expression
function regexAllowed(l, k) {
  const before = l.slice(0, k).trimEnd();
  if (!before) return true;
  const c = before.at(-1);
  if (/[(,=:[!&|?{};+\-*%<>~^]/.test(c)) return true;
  return REGEX_KW.test(before);
}
// end index of a single-line regex literal starting at k, or -1 (then treat '/' as division)
function regexEnd(l, k) {
  let cls = false;
  for (let j = k + 1; j < l.length; j++) {
    const c = l[j];
    if (c === '\\') j++;
    else if (c === '[') cls = true;
    else if (c === ']') cls = false;
    else if (c === '/' && !cls) return j;
  }
  return -1;
}
function templateLines(lines, f) {
  const flags = new Array(lines.length).fill(false);
  if (!/\.[cm]?[jt]sx?$/.test(f)) return flags;
  // tiny tokenizer: code / // / /* */ / '..' / ".." / `..${ code }..`
  let mode = 'code';
  const tpl = []; // brace depth at which each open ${ started
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    flags[i] = mode === 'tpl';
    const l = lines[i];
    for (let k = 0; k < l.length; k++) {
      const c = l[k];
      const n = l[k + 1];
      if (mode === 'code') {
        if (c === '/' && n === '/') break;
        if (c === '/' && n === '*') { mode = 'block'; k++; }
        else if (c === '/' && regexAllowed(l, k)) {
          const e = regexEnd(l, k);
          if (e > 0) k = e;
        } else if (c === "'" || c === '"') {
          for (k++; k < l.length && l[k] !== c; k++) if (l[k] === '\\') k++;
        } else if (c === '`') mode = 'tpl';
        else if (c === '{') depth++;
        else if (c === '}') { if (tpl.length && tpl.at(-1) === depth) { tpl.pop(); mode = 'tpl'; } else depth = Math.max(0, depth - 1); }
      } else if (mode === 'block') {
        if (c === '*' && n === '/') { mode = 'code'; k++; }
      } else if (mode === 'tpl') {
        if (c === '\\') k++;
        else if (c === '`') mode = 'code';
        else if (c === '$' && n === '{') { tpl.push(depth); mode = 'code'; k++; }
      }
    }
  }
  // desync (unterminated template/comment at EOF): do not hide anything
  if (mode !== 'code') return new Array(lines.length).fill(false);
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
  if (last.fileSha !== testSha(testPath, testId)) return { ok: false, why: 'test changed since last Green/Refactor' };
  return { ok: true, weak: !!r.weak };
}

// ---------- config / commands ----------
function detectConfig(base = ROOT) {
  const pkg = readJson(path.join(base, 'package.json'), null);
  const has = (f) => fs.existsSync(path.join(base, f));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let testCmd;
  const gradle = (has('build.gradle') || has('build.gradle.kts') || has('settings.gradle') || has('settings.gradle.kts')) ? (has('gradlew') ? './gradlew' : 'gradle') : null;
  const CMAKE_RUN = 'cmake -S . -B build -Wno-dev >/dev/null && cmake --build build && ctest --test-dir build --output-on-failure';
  if (has('node_modules/.bin/vitest')) deps.vitest ??= '*';
  if (has('node_modules/.bin/jest')) deps.jest ??= '*';
  if (deps.vitest) testCmd = ['npx', 'vitest', 'run', '{file}', '-t', '{id}'];
  else if (deps.jest) testCmd = ['npx', 'jest', '{file}', '-t', '{id}'];
  else if (has('pyproject.toml') || has('pytest.ini') || has('requirements.txt')) testCmd = ['python3', '-m', 'pytest', '-q', '{file}', '-k', '{idu}'];
  else if (has('go.mod')) testCmd = ['go', 'test', './...', '-run', '{IDU}'];
  else if (has('Cargo.toml')) testCmd = ['cargo', 'test', '{idu}'];
  else if (has('pom.xml')) testCmd = ['mvn', '-B', '-ntp', 'test', '-Dtest=*#*{idu}*', '-Dsurefire.failIfNoSpecifiedTests=false'];
  else if (gradle) testCmd = [gradle, 'cleanTest', 'test', '--tests', '*{idu}*', '--console=plain'];
  else if (has('CMakeLists.txt')) testCmd = ['sh', '-c', CMAKE_RUN + ' -R "$0"', '{idu}'];
  else testCmd = ['node', '--test', '--test-name-pattern', '{id}', '{file}'];
  const checks = [];
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
  const related = deps.vitest ? ['npx', 'vitest', 'related', '--run', '{changedFiles}'] : deps.jest ? ['npx', 'jest', '--findRelatedTests', '{changedFiles}'] : undefined;
  if (!pkg) {
    if (testCmd[0] === 'python3') checks.push({ name: 'test', cmd: ['python3', '-m', 'pytest', '-q'] });
    else if (has('go.mod')) checks.push({ name: 'test', cmd: ['go', 'test', './...'] });
    else if (has('Cargo.toml')) checks.push({ name: 'test', cmd: ['cargo', 'test'] });
    else if (has('pom.xml')) checks.push({ name: 'test', cmd: ['mvn', '-B', '-ntp', 'test'] });
    else if (gradle) checks.push({ name: 'test', cmd: [gradle, 'cleanTest', 'test', '--console=plain'] });
    else if (has('CMakeLists.txt')) checks.push({ name: 'test', cmd: ['sh', '-c', CMAKE_RUN] });
  }
  for (const s of ['typecheck', 'lint', 'test']) if (pkg?.scripts?.[s]) checks.push({ name: s, cmd: [pm, 'run', s], ...(s === 'test' && related ? { changedCmd: related, hubFallbackCmd: ['npx', deps.vitest ? 'vitest' : 'jest', ...(deps.vitest ? ['run'] : []), '{changedTests}', '{directTests}'] } : {}) });
  const prepare = pkg?.scripts?.build ? { cmd: [pm, 'run', 'build'], outputs: has('dist') ? ['dist'] : [], timeoutMs: 600000 } : undefined;
  return { schemaVersion: 1, testCmd, ...(prepare ? { prepare } : {}), checks, timeoutMs: 120000 };
}
const loadConfig = () => readJson(CONFIG, null) ?? detectConfig();
const MANIFESTS = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|pytest\.ini|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|CMakeLists\.txt)$/;
// polyglot monorepo: nested manifests become projects with their own cwd/testCmd/checks
function detectProjects() {
  const dirs = new Set();
  const all = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }).stdout.split('\n');
  for (const f of all) if (MANIFESTS.test(f) && f.includes('/') && !/(^|\/)(node_modules|vendor|target|build)\//.test(f)) dirs.add(path.posix.dirname(f));
  const roots = [...dirs].sort().filter((d, i, a) => !a.slice(0, i).some((p) => d.startsWith(p + '/')));
  return roots.map((root) => { const c = detectConfig(path.join(ROOT, root)); return { root, testCmd: c.testCmd, checks: c.checks.map(({ name, cmd }) => ({ name, cmd })) }; });
}
function projectFor(p) {
  const ps = (loadConfig().projects ?? []).filter((x) => p === x.root || p.startsWith(x.root.replace(/\/$/, '') + '/'));
  return ps.sort((a, b) => b.root.length - a.root.length)[0] ?? null;
}

function run(cmd, timeoutMs, cwd = '.') {
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: path.resolve(ROOT, cwd), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64e6 });
  const text = (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? String(r.error.message) : '');
  return { exit: r.status ?? (r.error ? 127 : 1), text, ms: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT' };
}
const LOAD_ERR = /(cannot find (module|package)|modulenotfounderror|importerror|syntaxerror|cannot resolve|no such file|undefined reference|could not compile|error\[e\d+\]|failed to resolve import|\[build failed\]|^[^\s:]+:\d+(?::\d+)?: (?:fatal )?error\b|cannot find symbol|ld returned \d+ exit status|\[setup failed\]|^# [^\n]*\n[^\n]*:\d+:\d+: (undefined|cannot|missing))/im;
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
const ZERO_TESTS = /(no tests? (found|ran|collected)|# tests 0\b|ran 0 tests|collected 0 items|0 tests? (ran|found|passed)\b|no test files found|no tests were found|no tests to run|tests run: 0,)/i;

// ---------- commands ----------
function cmdInit() {
  const cfg = detectConfig();
  const rootHasManifest = fs.readdirSync(ROOT).some((f) => MANIFESTS.test(f));
  if (!rootHasManifest) { const projects = detectProjects(); if (projects.length) { cfg.projects = projects; cfg.checks = []; } }
  if (!fs.existsSync(CONFIG)) writeJson(CONFIG, cfg);
  fs.mkdirSync(SPECS, { recursive: true });
  if (cfg.projects?.length) out(`projects: ${cfg.projects.map((p) => `${p.root} (${p.testCmd.slice(0, 2).join(' ')})`).join(', ')} — each test runs in its project directory`);
  else if (cfg.testCmd[0] === 'node' && !fs.existsSync(path.join(ROOT, 'package.json'))) out('WARNING: stack not recognised (no package.json/pytest/go.mod/Cargo.toml/pom.xml/gradle/CMakeLists.txt) — testCmd is a Node fallback. Set testCmd in .sdd/config.json to a runner that filters by test name, e.g. ["sh","run_tests.sh","{idu}"] (see SKILL.md "Other stacks").');
  out(`init ok: ${rel(CONFIG)} (testCmd: ${cfg.testCmd.join(' ')}; checks: ${cfg.checks.map((c) => c.name).join(',') || 'none'})`);
  out('next: write .sdd/specs/<feature>.md (see references/spec-template.md)');
}

// Review file schema: header lines `spec: sha256:<hash>`, `verdict: pass`, `open: <n>`; findings carry an explicit status.
const isOpenLine = (l) => /^\s*[-*]\s*\[ \]/.test(l) || /\b(state|status)\s*[:=]\s*open\b/i.test(l) || /\*\*open\*\*/i.test(l) || /^\s*[-*]\s+open\b/i.test(l) || l.split('|').some((c) => /^\s*open\s*$/i.test(c));
function reviewProblems(text, specHash) {
  const probs = [];
  const lines = text.split('\n');
  const open = lines.filter(isOpenLine);
  const verdict = /^\s*verdict\s*[:=]\s*(\w+)/im.exec(text)?.[1]?.toLowerCase();
  const declared = /^\s*open\s*[:=]\s*(\d+)\s*$/im.exec(text)?.[1];
  if (!verdict) probs.push('missing `verdict: pass|fail` line');
  else if (verdict !== 'pass') probs.push(`verdict is "${verdict}", not pass`);
  if (declared === undefined) probs.push('missing `open: <n>` line');
  else if (Number(declared) !== open.length) probs.push(`open: ${declared} does not match ${open.length} Open finding line(s) found`);
  if (open.length) { probs.push(`${open.length} Open finding(s):`); open.slice(0, 5).forEach((l) => probs.push(`  ${l.trim()}`)); }
  if (!text.includes(specHash.slice(0, 12))) probs.push(`must reference the spec hash (spec: sha256:${specHash.slice(0, 12)}…)`);
  return probs;
}
function cmdReview() {
  const [sub, a] = pos.slice(1);
  if (sub === 'template') {
    const spec = loadSpecs().find((x) => x.feature === a);
    out(`spec: sha256:${spec ? fileSha(spec.path) : '<spec sha256>'}\nverdict: pass\nopen: 0\n\n## Findings\n| ID | Severity | Where | Status |\n|----|----------|-------|--------|\n| F1 | high | file.ts:10 | Closed |`);
    return 0;
  }
  if (sub === 'check' && a && typeof flags.feature === 'string') {
    const spec = loadSpecs().find((x) => x.feature === flags.feature);
    if (!spec || !fs.existsSync(path.join(ROOT, a))) { out('usage: review check <file> --feature <feature>'); return 2; }
    const probs = reviewProblems(fs.readFileSync(path.join(ROOT, a), 'utf8'), fileSha(spec.path));
    out(probs.length ? `REVIEW INVALID: ${a}\n${probs.map((x) => '  ' + x).join('\n')}` : `REVIEW OK: ${a}`);
    return probs.length ? 1 : 0;
  }
  out('usage: review template <feature> | review check <file> --feature <feature>');
  return 2;
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
      : 'approval: auto — after independent AI review passes: approve record <feature> --by ai:<reviewer> --review <.sdd/review.md|summary> (no human needed; review file must have 0 Open findings and cite the spec sha256 prefix)');
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
      const probs = reviewProblems(fs.readFileSync(path.join(ROOT, review), 'utf8'), fileSha(spec.path));
      if (probs.length) { out(`REFUSED: ${review} is not an acceptable review file`); probs.slice(0, 6).forEach((x) => out(`  ${x}`)); out('  see: review template <feature>'); return 1; }
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

// body of the test annotated with `@id <id>` (up to the next @id), as lines
function testBody(testPath, id) {
  const ls = fs.readFileSync(path.join(ROOT, testPath), 'utf8').split('\n');
  const start = ls.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  if (start < 0) return [];
  let end = ls.findIndex((l, i) => i > start && /@id\s/.test(l));
  if (end < 0) end = ls.length;
  return ls.slice(start, end);
}
const ASSERT_LINE = /(expect\s*\(|\bassert|raises|toThrow|\.should|assertEquals|t\.(Error|Fatal))/;
// Red caused by a stub called from setup (not from the asserted behaviour) is not evidence for the REQ
function setupOrigin(line, testPath, id) {
  const m = /not implemented:?\s*([\w$]+)|NotImplementedError:?\s*([\w$]+)|unimplemented!?\(?\s*"?([\w$]+)/i.exec(line ?? '');
  const x = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!x) return null;
  const asserts = testBody(testPath, id).filter((l) => ASSERT_LINE.test(l));
  if (!asserts.length) return null;
  const re = new RegExp(`(?<![\\w$])${x.replace(/[$]/g, '\\$&')}(?![\\w$])`);
  return asserts.some((l) => re.test(l)) ? null : x;
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
  const before = testSha(t.path, id);
  const prior = entries.filter((e) => e.test === id);
  if (sub === 'green') {
    const r = prior.filter((e) => e.type === 'red').at(-1);
    if (!r) { out(`REFUSED: no Red recorded for ${id}`); return 1; }
    if (r.fileSha !== before) { out(`REFUSED: test file changed since Red (${t.path}). revert test edits, or record a new Red`); return 1; }
  }
  if (sub === 'refactor' && !prior.some((e) => e.type === 'green')) { out(`REFUSED: no Green recorded for ${id}`); return 1; }

  const cfg = loadConfig();
  const proj = projectFor(t.path);
  const fileArg = proj ? path.posix.relative(proj.root, t.path) : t.path;
  const cmd = (proj?.testCmd ?? cfg.testCmd).map((a) => a.replaceAll('{id}', id).replaceAll('{idu}', id.toLowerCase().replaceAll('-', '_')).replaceAll('{IDU}', id.toUpperCase().replaceAll('-', '_')).replaceAll('{file}', fileArg));
  const res = run(cmd, cfg.timeoutMs ?? 120000, proj?.root);
  const after = testSha(t.path, id);
  if (after !== before) { out(`REFUSED: ${t.path} changed while running (formatter/watch?)`); return 1; }

  const zero = ZERO_TESTS.test(res.text);
  let ok;
  let why = '';
  if (sub === 'red') {
    if (zero) { ok = false; why = 'no test matched the ID (check @id vs test title/method name)'; }
    else if (res.exit === 0) { ok = false; why = 'test passed; Red needs a real failure'; }
    else if (LOAD_ERR.test(res.text) && !flags.weak && !(flags['missing-module'] && declaredMissingModule(res.text, t.path))) { ok = false; why = 'load/compile error, not an assertion failure. new module? run `tdd stub <ID>` (or `--missing-module`); otherwise fix the load error, or --weak to record as weak Red'; }
    else if (typeof flags.expect === 'string' && !res.text.includes(flags.expect)) { ok = false; why = `failure output does not contain --expect "${flags.expect}" (Red for the wrong reason?)`; }
    else ok = true;
  } else {
    if (res.exit !== 0) { ok = false; why = 'test failed'; }
    else if (zero) { ok = false; why = 'no test matched the ID'; }
    else ok = true;
  }
  if (!ok) { out(`${sub.toUpperCase()} REJECTED ${id}: ${why}`); out(tail(res.text, 12)); return 1; }
  const rl = res.text.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim());
  const reason = sub === 'red' ? (rl.find((l) => /^E\s+\S/.test(l))?.replace(/^E\s+/, '') ?? rl.find((l) => /(--- FAIL|AssertionError|Error:|assert |FAILED|panicked|expected|\(Failed\))/.test(l) && !/^(FAIL|❯|> Task|The following tests)/.test(l)) ?? rl.find((l) => /^(FAIL|not ok)\s+\S+$/.test(l)) ?? '').slice(0, 110) : '';
  const loadWeak = sub === 'red' && LOAD_ERR.test(res.text) && !(flags['missing-module'] && declaredMissingModule(res.text, t.path));
  const setupSym = sub === 'red' && !flags['allow-setup-red'] && typeof flags.expect !== 'string' ? setupOrigin(rl.find((l) => /not implemented|NotImplementedError|unimplemented/i.test(l)) ?? reason, t.path, id) : null;
  const weakRed = loadWeak || !!setupSym;
  appendLedger({ type: sub, test: id, req, file: t.path, fileSha: after, cmdSha: sha(cmd.join('\0')), exit: res.exit, ms: res.ms, weak: weakRed ? true : undefined, weakWhy: setupSym ? `setup:${setupSym}` : undefined });
  out(`${sub.toUpperCase()} ok ${id} (${req}) ${res.ms}ms${reason ? ` — fails with: ${reason}` : ''}${weakRed ? ' [weak]' : ''}${setupSym ? ` ⚠ Red comes from setup call "${setupSym}", not the asserted behaviour (use --expect <text> or --allow-setup-red)` : ''}`);
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
  const budget = new Map();
  for (const k of base?.errors ?? []) budget.set(k, (budget.get(k) ?? 0) + 1);
  const ch = flags.changed ? changedFiles() : null;
  const keep = (e) => {
    const k = errKey(e);
    if (budget.get(k) > 0) { budget.set(k, budget.get(k) - 1); return false; }
    return base || !ch || [...ch].some((f) => e.includes(f));
  };
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

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/;
function gitFiles(glob) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', glob], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter((f) => f && !/(^|\/)node_modules\//.test(f)) : [];
}
const stripJsonc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
// bare-specifier aliases: workspace package names and tsconfig paths -> source file candidates
function aliasMap(set) {
  const map = [];
  const pick = (dir, target) => {
    const t = path.posix.normalize(path.posix.join(dir, String(target)));
    const stem = t.replace(/\.[cm]?[jt]sx?$/, '');
    const srcStem = stem.replace(/^((?:.*\/)?)(dist|build|lib)\//, '$1src/');
    for (const c of [stem, srcStem]) for (const e of ['.ts', '.tsx', '.js', '.mjs', '.jsx', '/index.ts', '/index.js']) if (set.has(c + e)) return c + e;
    return null;
  };
  for (const pf of gitFiles('*package.json')) {
    const dir = path.posix.dirname(pf);
    const pkg = readJson(path.join(ROOT, pf), null);
    if (!pkg?.name) continue;
    const ex = typeof pkg.exports === 'string' ? { '.': pkg.exports } : pkg.exports ?? {};
    const entry = (v) => typeof v === 'string' ? v : v && typeof v === 'object' ? entry(v.import ?? v.default ?? v.require ?? Object.values(v)[0]) : null;
    const root = entry(ex['.']) ?? pkg.main ?? pkg.module ?? 'src/index.ts';
    const f = pick(dir, root) ?? pick(dir, 'src/index');
    if (f) map.push([pkg.name, f, false]);
    for (const [k, v] of Object.entries(ex)) if (k.startsWith('./') && !k.includes('*')) { const t = pick(dir, entry(v)); if (t) map.push([`${pkg.name}/${k.slice(2)}`, t, false]); }
    map.push([pkg.name, dir === '.' ? '' : dir, true]);
  }
  for (const tf of gitFiles('*tsconfig*.json')) {
    const dir = path.posix.dirname(tf);
    const co = readJson(path.join(ROOT, tf), null) ?? (() => { try { return JSON.parse(stripJsonc(fs.readFileSync(path.join(ROOT, tf), 'utf8'))); } catch { return null; } })();
    const base = path.posix.join(dir, co?.compilerOptions?.baseUrl ?? '.');
    for (const [k, vs] of Object.entries(co?.compilerOptions?.paths ?? {})) {
      const star = k.endsWith('/*');
      const t = pick(base, String(vs[0]).replace(/\/\*$/, ''));
      map.push([star ? k.slice(0, -2) : k, t ?? path.posix.join(base, String(vs[0]).replace(/\/\*$/, '')), star || !t]);
    }
  }
  return map.sort((a, b) => b[0].length - a[0].length);
}

// exported symbols touched by the uncommitted diff of a JS/TS file.
// -> { neutral: true } comment/blank-only | { symbols: Set } all hunks inside exported declarations | null unknown (be conservative)
const DECL = /^(export\s+)?(default\s+)?(declare\s+)?(async\s+)?(abstract\s+)?(const|let|var|function\*?|class|interface|type|enum|namespace)\s+([\w$]+)/;
const COMMENT_OR_BLANK = /^\s*($|\/\/|\/\*|\*)/;
function changedSymbols(file) {
  const r = spawnSync('git', ['diff', '-U0', 'HEAD', '--', file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
  if (r.status !== 0 || !r.stdout.trim()) return null;
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const starts = [];
  lines.forEach((l, i) => { const m = DECL.exec(l); if (m) starts.push({ i, exported: !!m[1], name: m[7] }); else if (/^export\s+(type\s+)?(\{|\*)/.test(l)) starts.push({ i, exported: true, name: null, reexport: true }); else if (/^export\s+default\b/.test(l)) starts.push({ i, exported: true, name: 'default' }); });
  const symbols = new Set();
  let neutral = true;
  for (const h of r.stdout.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldN = h[1] === undefined ? 1 : +h[1];
    const start = +h[2] - 1;
    const n = h[3] === undefined ? 1 : +h[3];
    const hunkText = r.stdout.slice(h.index).split(/\n(?=@@ )/)[0].split('\n').slice(1).filter((l) => /^[+-]/.test(l)).map((l) => l.slice(1));
    if (hunkText.every((l) => COMMENT_OR_BLANK.test(l))) continue;
    neutral = false;
    if (n === 0 || oldN === 0 && n === 0) return null;
    for (let i = start; i < start + n; i++) {
      if (COMMENT_OR_BLANK.test(lines[i] ?? '')) continue;
      let d = null;
      for (const st of starts) if (st.i <= i) d = st; else break;
      if (!d || !d.exported) return null;
      if (d.reexport) {
        let j = d.i; let txt = lines[j];
        while (!/\}|\*\s+from|;\s*$/.test(txt) && j < lines.length - 1) txt += ' ' + lines[++j];
        if (/export\s+(type\s+)?\*/.test(txt) && !/\*\s+as\s+/.test(txt)) return null;
        const names = /\{([^}]*)\}/.exec(txt)?.[1].split(',').flatMap((x) => x.trim().split(/\s+as\s+/)).filter(Boolean) ?? [];
        if (!names.length) return null;
        names.forEach((x) => symbols.add(x.replace(/^type\s+/, '')));
      } else symbols.add(d.name);
    }
  }
  return neutral ? { neutral: true } : { symbols };
}

// name-level taint: tests (among dependents) that reach any changed symbol via declarations that mention it
function symbolReach(symbols, files) {
  const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')]));
  const decls = new Map();
  for (const [f, ls] of texts) {
    const st = [];
    ls.forEach((l, i) => { const m = DECL.exec(l); if (m) st.push({ i, name: m[7] }); });
    decls.set(f, st);
  }
  const tainted = new Set(symbols);
  const hit = new Set();
  const esc = (x) => x.replace(/[$]/g, '\\$&');
  for (let changed = true; changed;) {
    changed = false;
    const re = new RegExp(`(?<![\\w$])(${[...tainted].map(esc).join('|')})(?![\\w$])`);
    for (const [f, ls] of texts) {
      ls.forEach((l, i) => {
        if (COMMENT_OR_BLANK.test(l) || !re.test(l)) return;
        if (TEST_FILE.test(f)) { hit.add(f); return; }
        let d = null;
        for (const x of decls.get(f)) if (x.i <= i) d = x; else break;
        if (d && !tainted.has(d.name)) { tainted.add(d.name); changed = true; }
      });
    }
  }
  return [...hit];
}

// transitive dependents (relative imports only) of the changed JS/TS files, to detect hub changes
function relatedTests(changed) {
  const files = listFiles().filter((f) => /\.[cm]?[jt]sx?$/.test(f));
  const set = new Set(files);
  const resolve = (from, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const stem = base.replace(/\.[cm]?[jt]sx?$/, '');
    for (const c of [base, ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.js'].map((e) => stem + e)]) if (set.has(c)) return c;
    return null;
  };
  const aliases = aliasMap(set);
  const resolveBare = (spec) => {
    for (const [name, target, isDir] of aliases) {
      if (spec === name && !isDir) return target;
      if (isDir && (spec === name || spec.startsWith(name + '/'))) {
        const sub = spec === name ? '' : spec.slice(name.length + 1);
        const base = path.posix.join(target, sub);
        const stem = base.replace(/\.[cm]?[jt]sx?$/, '');
        for (const c of [base, ...['.ts', '.tsx', '.js', '.mjs', '.jsx', '/index.ts', '/index.js', '/src/index.ts'].map((e) => stem + e)]) if (set.has(c)) return c;
      }
    }
    return null;
  };
  const rev = new Map();
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*|require\(\s*)['"]([^'"\n]+)['"]/g)) {
      const t = m[1].startsWith('.') ? resolve(f, m[1]) : resolveBare(m[1]);
      if (t) { if (!rev.has(t)) rev.set(t, []); rev.get(t).push(f); }
    }
  }
  const seen = new Set(changed.filter((f) => set.has(f)));
  const queue = [...seen];
  while (queue.length) for (const d of rev.get(queue.pop()) ?? []) if (!seen.has(d)) { seen.add(d); queue.push(d); }
  const direct = [...new Set(changed.flatMap((f) => rev.get(f) ?? []))].filter((f) => TEST_FILE.test(f));
  return { direct, files: [...seen], tests: [...seen].filter((f) => TEST_FILE.test(f)), total: files.filter((f) => TEST_FILE.test(f)).length };
}

const PREPARE_CACHE = path.join(SDD, 'prepare-cache.json');
function prepareKey(pc) {
  const inputs = pc.inputs?.length ? scanless(pc.inputs.map(globRe)) : [...listFiles(), ...gitFiles('*package.json'), ...gitFiles('*tsconfig*.json')];
  const h = createHash('sha256').update(JSON.stringify(pc.cmd));
  for (const f of [...new Set(inputs)].sort()) if (fs.existsSync(path.join(ROOT, f))) h.update(f + '\0' + fileSha(f) + '\0');
  return h.digest('hex');
}
function scanless(res) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
  return r.stdout.split('\n').filter((f) => f && res.some((x) => x.test(f)));
}

function cmdGate() {
  const lines = [];
  let fail = false;
  let incomplete = false;
  const add = (ok, msg, extra = []) => { lines.push(`${ok ? '✓' : '✗'} ${msg}`); extra.forEach((x) => lines.push(`    ${x}`)); if (!ok) fail = true; };

  const specs = loadSpecs();
  const { ents, dups } = scanEntities(listFiles());
  if (!specs.length) { lines.push('! spec: none in .sdd/specs — T0 changes need no gate; for T1/T2 write .sdd/specs/<feature>.md (result is INCOMPLETE)'); incomplete = true; }
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
  if (cfg.prepare && !flags['no-run']) {
    const pc = cfg.prepare;
    const cache = readJson(PREPARE_CACHE, {});
    const key = prepareKey(pc);
    const outsOk = (pc.outputs ?? []).every((o) => fs.existsSync(path.join(ROOT, o)));
    if (cache.key === key && outsOk) lines.push('✓ prepare: up to date (cached, inputs unchanged)');
    else {
      const r = run(pc.cmd, pc.timeoutMs ?? 600000);
      if (r.exit === 0) { writeJson(PREPARE_CACHE, { key, at: new Date().toISOString() }); add(true, `prepare (${(r.ms / 1000).toFixed(1)}s)`); }
      else add(false, r.timedOut ? `prepare TIMEOUT after ${(r.ms / 1000).toFixed(0)}s (raise prepare.timeoutMs)` : `prepare failed (${(r.ms / 1000).toFixed(1)}s)`, r.timedOut ? [] : tail(r.text, 8).split('\n'));
    }
  }
  const allChecks = [...(cfg.checks ?? []), ...(cfg.projects ?? []).flatMap((p) => (p.checks ?? []).map((c) => ({ ...c, name: `${p.root}:${c.name}`, cwd: p.root })))];
  if (flags['no-run']) { lines.push('! commands: SKIPPED (--no-run) — result is INCOMPLETE'); incomplete = true; }
  else for (const c of allChecks) {
    let cmd = c.cmd;
    if (c.cwd && flags.changed && ![...changedFiles()].some((f) => f.startsWith(c.cwd.replace(/\/$/, '') + '/'))) { lines.push(`! cmd ${c.name}: no changed files in ${c.cwd} — skipped`); continue; }
    let scoped = false;
    if (flags.changed && c.changedCmd) {
      const ch = [...changedFiles()].filter((f) => !f.startsWith('.sdd/') && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
      const tests = ch.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/.test(f));
      if (!ch.length) { lines.push(`! cmd ${c.name}: no changed files — skipped`); continue; }
      const scopes = [...new Set(ch.filter((f) => !tests.includes(f)).map((f) => /^(packages|apps|libs)\/[^/]+/.exec(f)?.[0] ?? path.posix.dirname(f)))];
      const rel2 = relatedTests(ch);
      const limit = c.hubThreshold ?? cfg.hubThreshold ?? 0.25;
      if (c.hubFallbackCmd && rel2.total >= (c.minHubTests ?? cfg.minHubTests ?? 10) && rel2.tests.length / rel2.total > limit) {
        lines.push(`! cmd ${c.name}: hub change (${rel2.tests.length}/${rel2.total} test files depend on it) — using hubFallbackCmd`);
        const srcChanged = ch.filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !TEST_FILE.test(f));
        const infos = srcChanged.map(changedSymbols);
        if (srcChanged.length && infos.every((x) => x?.neutral) && !tests.length) { lines.push(`! cmd ${c.name}: hub change is comment/whitespace-only (symbol-neutral) — skipped`); continue; }
        if (srcChanged.length && infos.every((x) => x && (x.neutral || x.symbols))) {
          const syms = [...new Set(infos.flatMap((x) => x.symbols ? [...x.symbols] : []))];
          rel2.direct = syms.length ? symbolReach(syms, rel2.files) : [];
          lines.push(`! cmd ${c.name}: scoped by changed symbols (${syms.slice(0, 5).join(', ')}${syms.length > 5 ? ', …' : ''}) → ${rel2.direct.length} test files`);
        }
        const maxN = c.hubMaxTests ?? cfg.hubMaxTests ?? 30;
        if (new Set([...tests, ...rel2.direct]).size > maxN) { lines.push(`! cmd ${c.name}: hub too large to scope (>${maxN} direct tests) — SKIPPED, run full gate (no --changed) — result is INCOMPLETE`); incomplete = true; continue; }
        if (!new Set([...tests, ...rel2.direct]).size) { lines.push(`! cmd ${c.name}: scoping selected no tests — SKIPPED, run full gate (no --changed) — result is INCOMPLETE`); incomplete = true; continue; }
        cmd = c.hubFallbackCmd;
      } else cmd = c.changedCmd;
      const subst = { '{changedFiles}': ch, '{changedTests}': tests, '{changedScopes}': scopes, '{directTests}': rel2.direct };
      cmd = cmd.flatMap((a) => subst[a] ?? [a]);
      scoped = true;
    }
    const r = run(cmd, scoped ? (c.changedTimeoutMs ?? cfg.changedTimeoutMs ?? 60000) : (c.timeoutMs ?? cfg.timeoutMs ?? 120000), c.cwd);
    if (r.timedOut) { add(false, `cmd ${c.name} TIMEOUT after ${(r.ms / 1000).toFixed(0)}s ${scoped ? '— narrow changedCmd (e.g. {changedTests} {changedScopes}) or raise changedTimeoutMs; run full gate (no --changed) before merge' : '— raise timeoutMs in .sdd/config.json'}`); continue; }
    add(r.exit === 0, `cmd ${c.name} (${(r.ms / 1000).toFixed(1)}s)`, r.exit === 0 ? [] : tail(r.text, 8).split('\n'));
  }
  if (!flags['no-run'] && !allChecks.length) { lines.push('! commands: none configured — nothing was run'); incomplete = true; }

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

const cmds = { review: cmdReview, init: cmdInit, approve: cmdApprove, guard: cmdGuard, tdd: cmdTdd, trace: cmdTrace, gate: cmdGate, status: cmdStatus };
const fn = cmds[pos[0]];
if (!fn) {
  out('usage: sdd.mjs init | review template <feature> | review check <file> --feature <f> | approve prepare|record <feature> | guard | tdd red|green|refactor <TEST-ID> | tdd stub <TEST-ID> | tdd check | trace [--baseline] | gate [--changed] [--no-run] | status   [--root dir]\n  tdd red: tdd red --expect <text> requires that text in the failure; --allow-setup-red accepts a stub-in-setup Red; --missing-module accepts a Red caused by the test own not-yet-created import (non-weak); approve record --by ai:<reviewer> needs --review <path|summary>');
  process.exit(2);
}
process.exit(fn() ?? 0);
