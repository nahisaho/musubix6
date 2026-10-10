#!/usr/bin/env node
// Lean SDD/TDD evidence tool. Zero dependencies, Node >= 20.
// Commands: init | approve prepare|record | guard | tdd red|green|refactor|check | trace | gate | status
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { builtinModules } from 'node:module';
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
const PREPARE_SHOWN = path.join(SDD, 'prepare-shown.json');
const LEDGER = path.join(SDD, 'tdd.jsonl');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const fileSha = (p) => sha(fs.readFileSync(path.join(ROOT, p)));
// BOM and CRLF are not content: lock hashes ignore them (#72); older locks hold the raw hash, which is still accepted
const artifactSha = (p) => sha(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
// Evidence is keyed to the test's own @id region (+ the preamble before the first @id: imports/helpers), so editing one test does not invalidate its siblings (#38).
// Files mixing implementation and tests (e.g. Rust #[cfg(test)]) hash only the region. Entries recorded with the whole-file hash (older ledgers) still match.
// trim: drop trailing blank/col-0 closer lines (a describe's `});`) so appending a new test after the last one keeps its evidence.
// norm: hash import statements by module only, so adding a name to an import list does not stale sibling tests (#55). trim=false/norm=false are the legacy hashes.
const normImports = (t) => t
  .replace(/\bimport\s+(?:type\s+)?[\w$*{}\s,]*?\s*from\s*(['"][^'"]+['"])\s*;?/g, 'import from $1')
  .replace(/^from\s+(\S+)\s+import\s*(?:\([^)]*\)|.*)$/gm, 'from $1');
const pythonScopes = new Map();
function pythonScope(txt) {
  if (pythonScopes.has(txt)) return pythonScopes.get(txt);
  const parser = `import ast,json,re,sys
src=sys.stdin.read()
ls=src.splitlines()
tree=ast.parse(src)
ranges=[]
for n in ast.walk(tree):
    if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)): continue
    start=min([n.lineno]+[d.lineno for d in n.decorator_list])-1
    while start>0 and (not ls[start-1].strip() or ls[start-1].lstrip().startswith("#")):
        start-=1
    ids=re.findall(r"@id\\s+(TEST-[A-Z0-9-]+)", "\\n".join(ls[start:n.end_lineno]))
    if ids or n.name.startswith("test"):
        ranges.append(dict(start=start,end=n.end_lineno,ids=ids))
print(json.dumps(ranges))
`;
  const r = spawnSync('python3', ['-c', parser], { input: txt, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  let ranges = null;
  try { if (r.status === 0) ranges = JSON.parse(r.stdout); } catch {}
  pythonScopes.set(txt, ranges);
  return ranges;
}
function pythonTestSha(txt, id) {
  const ranges = pythonScope(txt);
  const mine = ranges?.find((r) => r.ids.includes(id));
  if (!mine) return sha(txt);
  const ls = txt.split('\n');
  const shared = ls.filter((_, i) => !ranges.some((r) => i >= r.start && i < r.end)).join('\n').trim();
  return sha(shared + '\u0000' + ls.slice(mine.start, mine.end).join('\n').trim());
}
// legacy=true: pre-#66 behaviour (no Python docstring scoping, whole-file @implements check)
// cut (any test, not only the last: a helper or a new describe between tests is not part of the previous test, #144): the region stops where its own top-level construct ends (blank line or pure closer, then a non-closer line at the test's indent), so appended tests/comments/main() do not stale it (#73)
// inl: a Rust file with a #[cfg(test)] module holds code next to its tests, so only the test's region counts even before @implements exists (#80)
// eolNorm: BOM/CRLF are not content, so converting a test file's line endings does not stale its evidence (#102); ledgers recorded with raw hashes still match
let eolNorm = false;
const testShaVariant = (p, id, trim, norm = false, legacy = false, cut = true, inl = true) => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const txt = eolNorm ? raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n') : raw;
  if (/\.py$/.test(p)) return pythonTestSha(txt, id);
  const ls = txt.split('\n');
  // Python docstring-style `"""@id ..."""`: the `def` line and decorators before the docstring belong to that test (#66)
  const begin = (i) => {
    if (legacy) return i;
    let k = -1;
    if (i >= 1 && /^\s*(async\s+)?def\s/.test(ls[i - 1])) k = i - 1;
    else if (i >= 2 && /^\s*[rbuRBU]{0,2}("""|\'\'\')\s*$/.test(ls[i - 1]) && /^\s*(async\s+)?def\s/.test(ls[i - 2])) k = i - 2;
    if (k < 0) return i;
    while (k > 0 && /^\s*@\w/.test(ls[k - 1])) k--;
    return k;
  };
  const starts = ls.map((l, i) => (/@id\s/.test(l) ? i : -1)).filter((i) => i >= 0);
  const at = ls.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  if (at < 0) return sha(txt);
  const start = begin(at);
  const nx = starts.find((i) => i > at);
  let end = nx === undefined ? ls.length : Math.max(begin(nx), at + 1);
  if (cut) {
    const ind = (l) => l.length - l.trimStart().length;
    const ref = ind(ls[start]);
    for (let i = start + 1; i < end; i++) {
      const l = ls[i];
      if (!l.trim() || ind(l) > ref || /^\s*[})\]]/.test(l)) continue;
      const prev = ls[i - 1];
      if (!prev.trim() || /^[})\];,\s]*$/.test(prev)) { end = Math.max(i, at + 1); break; }
    }
  }
  let rl = ls.slice(start, end);
  if (trim) while (rl.length > 1 && /^[})\];,\s]*$/.test(rl.at(-1)) && !/^\s+\S/.test(rl.at(-1))) rl.pop();
  const region = rl.join('\n');
  if (legacy ? /@implements\b/.test(txt) : /@id\s+CODE-/.test(txt) || (inl && /\.rs$/.test(p) && /#\[cfg\(test\)\]/.test(txt))) return sha(region);
  const pre = ls.slice(0, begin(starts[0])).join('\n');
  return sha((norm ? normImports(pre) : pre) + '\u0000' + region);
};
const testSha = (p, id) => { eolNorm = true; try { return testShaVariant(p, id, true, true); } finally { eolNorm = false; } };
const shaMatches = (recorded, p, id) => /\.py$/.test(p) ? recorded === testSha(p, id) : shaMatchesRaw(recorded, p, id) || (() => { eolNorm = true; try { return shaMatchesRaw(recorded, p, id); } finally { eolNorm = false; } })();
const shaMatchesRaw = (recorded, p, id) => [true, false].some((cut) => [true, false].some((inl) => recorded === testShaVariant(p, id, true, true, false, cut, inl) || recorded === testShaVariant(p, id, true, false, false, cut, inl) || recorded === testShaVariant(p, id, false, false, false, cut, inl) || recorded === testShaVariant(p, id, true, true, true, cut, inl) || recorded === testShaVariant(p, id, true, false, true, cut, inl) || recorded === testShaVariant(p, id, false, false, true, cut, inl))) ||
  recorded === testSha(p, id) || recorded === testShaVariant(p, id, true) || recorded === testShaVariant(p, id, false) || recorded === testShaVariant(p, id, true, true, true) || recorded === testShaVariant(p, id, true, false, true) || recorded === testShaVariant(p, id, false, false, true) || recorded === sha(fs.readFileSync(path.join(ROOT, p)));
const out = (s = '') => process.stdout.write(s + '\n');
// npm's trailing `npm error …` / `npm notice …` boilerplate would push the real failure out of the window (#75)
// failure lines first (FAIL/assert/error/panic), then the last lines — the failing test is rarely in the last few lines of make/cargo output (#86)
const failTail = (s, n = 8) => { const ls = s.trimEnd().split('\n'); const hit = ls.filter((l) => /\bFAIL(ED)?\b|assert|\berror\b|panic|not ok|✗|✖/i.test(l)).slice(0, 6); const last = ls.slice(-Math.max(2, n - hit.length)); return [...new Set([...hit, ...last])].join('\n'); };
// the assertion itself for C/ctest (`CHECK failed`), xUnit (`Assert.X() Failure`, `Exception : msg`), JUnit/Maven (`expected: <a> but was: <b>`) and Julia (`Test Failed` + `Expression:`) (#125)
const REASON_KEY = /\bCHECK\w* failed|\bASSERT\w* failed|[Aa]ssertion\b.*\bfailed|Assert\.\w+\(\) Failure|^\s*Expected:|^\s*Expected is\b|expected: ?<.*but was|\b[A-Z]\w*Exception\s+:\s*\S|^Expression:/;
const specificReason = (rl) => {
  // Go: the panic text is the reason, not the `--- FAIL:` line (#142)
  const gp = rl.find((l) => /^panic: \S/.test(l));
  if (gp && rl.some((l) => /^--- FAIL:/.test(l))) return gp;
  if (rl.some((l) => /^--- FAIL:/.test(l))) {
    const assertion = rl.map((l) => /^\S+_test\.go:\d+:\s*(.+)/.exec(l)?.[1]).find(Boolean);
    if (assertion) return assertion;
  }
  // PHPUnit: first message line below `There was 1 failure:` / `1) Class::test` (#143)
  const pu = rl.findIndex((l) => /^There w(?:as|ere) \d+ failures?:/.test(l));
  if (pu >= 0) { const m = rl.slice(pu + 1, pu + 8).findIndex((l) => /^\d+\) /.test(l)); const msg = m >= 0 ? rl.slice(pu + 2 + m, pu + 6 + m).find((l) => l && !/^(Failed asserting|-|\+|@@)/.test(l)) : undefined; if (msg) return msg; }
  const i = rl.findIndex((l) => /^Test Failed at\b/.test(l));
  if (i >= 0) return rl.slice(i + 1, i + 4).find((l) => /^Expression:/.test(l)) ?? rl[i];
  return rl.find((l) => REASON_KEY.test(l) && !/^\d+\s*\|/.test(l));
};
// rejected Red/Green: assertion lines first (Maven/ctest/dotnet boilerplate would push them out of a plain tail), then a short tail
const rejectTail = (text) => {
  const ls = text.replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split('\n');
  const keep = [];
  ls.forEach((l, i) => { if (/^Test Failed at\b/.test(l)) keep.push(i, i + 1, i + 2); else if (/panicked at /.test(l)) keep.push(i, i + 1, i + 2, i + 3); else if (REASON_KEY.test(l) && !/^\d+\s*\|/.test(l)) keep.push(i); });
  if (!keep.length) return tail(text, 12);
  const hit = [...new Set(keep)].filter((i) => i < ls.length).slice(0, 8).map((i) => ls[i].trimEnd());
  return [...new Set([...hit, ...tail(text, 4).split('\n')])].join('\n');
};
const tail = (s, n = 15) => { const ls = s.trimEnd().split('\n'); const real = ls.filter((l) => !/^npm (notice|error|warn)\b/.test(l)); return (real.length ? real : ls).slice(-n).join('\n'); };

// ---------- scanning ----------
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|kt|rb|sh|c|h|cc|cpp|cxx|hpp|hh|R|r|jl|php)$/;
const SKIP = /(^|\/)(node_modules|\.git|\.sdd|dist|build|coverage|target|\.venv|venv|\.mastra|\.next|\.nuxt|\.turbo|\.output)\//;
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*$/, '\u0001').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');
function scanFilter(files) {
  const sc = (readJson(CONFIG, null) ?? {}).scan ?? {};
  const inc = (sc.include ?? []).map(globRe);
  const exc = (sc.exclude ?? []).map(globRe);
  return files.filter((f) => (!inc.length || inc.some((r) => r.test(f))) && !exc.some((r) => r.test(f)));
}
// bin/ and obj/ next to a .NET project file are build output (generated .cs, copied sources): never scanned, even without a .gitignore (#137)
function dotnetOutputFilter(files) {
  const pd = new Set(files.filter((f) => /\.(cs|fs|vb)proj$/.test(f)).map((f) => path.posix.dirname(f)));
  if (!pd.size) return files;
  return files.filter((f) => { for (let d = path.posix.dirname(f); ; d = path.posix.dirname(d)) { if (pd.has(d) && /^(bin|obj)\//.test(d === '.' ? f : f.slice(d.length + 1))) return false; if (d === '.' || d === '/') return true; } });
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
  files = [...new Set(files)]; // an unmerged path is listed once per index stage
  files = dotnetOutputFilter(files);
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
// true for lines that start a triple-quoted string or sit inside one
function pyDocLines(lines) {
  const flags = new Array(lines.length).fill(false);
  let open = null;
  lines.forEach((l, i) => {
    flags[i] = open !== null || /^\s*[rRbBuU]{0,2}("""|''')/.test(l);
    for (const m of l.matchAll(/"""|'''/g)) open = open === null ? m[0] : open === m[0] ? null : open;
  });
  return flags;
}
function scanEntities(files) {
  const ents = new Map();
  const dups = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    const inTpl = templateLines(lines, f);
    // Python: annotations in docstrings (a line starting a triple-quoted string, or inside one) count as comments
    const doc = f.endsWith('.py') ? pyDocLines(lines) : null;
    const lead = (i) => COMMENT_LEAD.test(lines[i]) || !!doc?.[i];
    for (let i = 0; i < lines.length; i++) {
      if (inTpl[i] || !lead(i)) continue;
      const m = /@id\s+([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)/.exec(lines[i]);
      if (!m) continue;
      const suffix = /^[a-z][\w-]*/.exec(lines[i].slice(m.index + m[0].length));
      if (suffix) { dups.push(`INVALID:${m[1]}${suffix[0]}`); continue; }
      let block = lines[i];
      for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
        if (!lead(j) || /@id\s/.test(lines[j])) break;
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

// CRLF, trailing `# comment`, and quotes are tolerated so tier/approval can never silently degrade (#59)
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^\uFEFF/, ''));
  const fm = {};
  if (m) for (const l of m[1].split(/\r\n|\r|\n/)) { const kv = /^(\w+):\s*(.*)$/.exec(l); if (kv) fm[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2').trim(); }
  return fm;
}
// `deferred` / `test-only` count only as a delimited marker ((deferred), [deferred], `deferred`, own cell), never as a word in the prose (#58)
const hasMarker = (l, w) => new RegExp(`(?:^|[(\\[\`*|<])\\s*${w}\\s*(?:$|[)\\]\`*|>])`, 'i').test(l);
function loadSpecs() {
  const specs = [];
  if (!fs.existsSync(SPECS)) return specs;
  for (const f of fs.readdirSync(SPECS).filter((x) => x.endsWith('.md')).sort()) {
    const p = `.sdd/specs/${f}`;
    const text = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, '');
    if (/^<{7}( |$)/m.test(text) && /^>{7}( |$)/m.test(text)) { out(`SPEC CONFLICT: ${p} has git merge conflict markers — resolve them first`); process.exit(2); }
    const fm = parseFrontmatter(text);
    const reqs = [];
    const lines = text.split(/\r\n|\r|\n/);
    lines.forEach((raw, i) => {
      // full-width digits/letters/brackets are matched as their ASCII forms; hashes still use the raw text (#78)
      const l = raw.normalize('NFKC');
      const m = /^([\s|#>*-]*)\*{0,2}(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*)/.exec(l);
      if (!m) return;
      const marked = /[|#>*-]/.test(m[1]);
      // a bare line starting with an id is prose (e.g. "REQ-X-2 was spiked") unless the id is followed by a delimiter (#65)
      if (!marked && !/^\s*REQ-[A-Z0-9-]+\s*(?:[:：|(]|\*\*)/.test(l)) return;
      let body = raw;
      // continuation lines of a list/prose requirement belong to its wording (#65)
      if (!m[1].includes('|')) for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*(?:[|#>*-]|REQ-)/.test(lines[j]); j++) body += ' ' + lines[j];
      reqs.push({ id: m[2], line: i + 1, tests: m[1].includes('|') ? [...new Set(l.match(/\bTEST-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? [])] : [], sha: sha(body.normalize('NFKC').replace(/\s+/g, ' ').trim()), rawSha: sha(body.replace(/\s+/g, ' ').trim()), deferred: hasMarker(body.normalize('NFKC'), 'deferred'), testOnly: hasMarker(body.normalize('NFKC'), 'test-only') });
    });
    const extra = fm.artifacts ? fm.artifacts.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const tl = lines;
    const di = tl.findIndex((l) => /^#{1,4}\s*(?:\d+[.)]?\s*)?(Design|設計)\b/i.test(l));
    let designLines = 0;
    if (di >= 0) for (const l of tl.slice(di + 1)) { if (/^#{1,4}\s/.test(l)) break; if (l.trim()) designLines++; }
    specs.push({ path: p, feature: fm.feature || f.replace(/\.md$/, ''), tier: (fm.tier || 'T1').toUpperCase(), approval: (fm.approval || 'auto').toLowerCase(), reqs, designLines, artifacts: [p, ...extra] });
  }
  return specs;
}

// T2 specs and `approval: human` specs (any tier) need a lock (#63)
// the lock remembers the tier/approval it was granted under: loosening either (T2->T1, dropping `approval: human`) stays locked until a human re-approves (#71)
const lockDrift = (s) => {
  const a = readJson(APPROVALS, {})[s.feature];
  if (!a) return null;
  if (a.tier === 'T2' && s.tier !== 'T2') return `tier ${s.tier} (was locked as T2)`;
  if (a.requireHuman && s.approval !== 'human') return 'approval: human removed';
  return null;
};
const needsLock = (s) => s.tier === 'T2' || s.approval === 'human' || !!lockDrift(s);
// a T2 spec must carry a Design section (components, state/policy tables, key decisions) before it can be locked
function designProblem(s) {
  return s.tier === 'T2' && s.designLines < 2 ? `${s.path}: T2 spec needs a "## Design" section (≥2 lines: components, data flow, state/policy tables, key decisions)` : null;
}

// ---------- approval ----------
function approvalState(spec) {
  const a = readJson(APPROVALS, {})[spec.feature];
  if (!a) return 'missing';
  if (lockDrift(spec)) return 'stale';
  for (const p of spec.artifacts) {
    if (!fs.existsSync(path.join(ROOT, p)) || ![fileSha(p), artifactSha(p)].includes(a.artifacts?.[p])) return 'stale';
  }
  // the cited review file is part of the lock: deleted or edited after record => stale (#122)
  if (a.kind === 'ai' && a.review && a.reviewSha && (!fs.existsSync(path.join(ROOT, a.review)) || fileSha(a.review) !== a.reviewSha)) return 'stale';
  return 'ok';
}

// ---------- ledger ----------
function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  const ls = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean);
  if (ls.some((l) => /^(<{7}|={7}|>{7})/.test(l))) { out(`LEDGER CONFLICT: ${rel(LEDGER)} has git merge conflict markers. Run: tdd merge-ledger (keeps both branches' evidence, re-chains the ledger)`); process.exit(2); }
  return ls.map((l, i) => { try { return JSON.parse(l); } catch { out(`LEDGER CORRUPT: ${rel(LEDGER)} line ${i + 1} is not valid JSON`); process.exit(2); } });
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
// exclusive lock so concurrent tdd runs cannot fork the hash chain (#109)
function withLedgerLock(fn) {
  fs.mkdirSync(SDD, { recursive: true });
  const lock = path.join(SDD, 'tdd.lock');
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 15000) { fs.rmdirSync(lock); continue; } } catch { continue; }
      if (Date.now() - t0 > 30000) { out(`ledger lock ${path.relative(ROOT, lock)} held >30s by another tdd run; remove it if stale`); process.exit(2); }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch {} }
}
function appendLedger(e) {
  withLedgerLock(() => appendLedgerLocked(e));
}
function appendLedgerLocked(e) {
  const entries = readLedger();
  const full = { v: 1, seq: entries.length + 1, ...e, at: new Date().toISOString(), prev: entries.at(-1)?.hash ?? '' };
  full.hash = entryHash(full);
  fs.mkdirSync(SDD, { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(full) + '\n');
}
let REQ_SHA = null;
// current hash of a REQ's spec line; entries recorded before this field existed have no reqSha and are not checked
function reqShaOf(id) {
  if (!REQ_SHA) { REQ_SHA = new Map(); for (const sp of loadSpecs()) for (const r of sp.reqs) REQ_SHA.set(r.id, { sha: r.sha, raw: r.rawSha }); }
  return REQ_SHA.get(id)?.sha;
}
// ledgers written before NFKC hashing carry the raw-text hash (#83)
const reqShaSame = (id, rsha) => { const c = REQ_SHA?.get(id); return !c || c.sha === rsha || c.raw === rsha; };
function evidenceStatus(testId, testPath, entries) {
  const es = entries.filter((e) => e.test === testId);
  const g = es.filter((e) => e.type === 'green').at(-1);
  if (!g) return { ok: false, why: 'no Green recorded' };
  const r = es.filter((e) => e.type === 'red' && e.seq < g.seq && e.fileSha === g.fileSha).at(-1);
  if (!r) return { ok: false, why: 'no Red preceding Green with same test hash' };
  const last = es.filter((e) => e.type === 'green' || e.type === 'refactor').at(-1);
  if (!shaMatches(last.fileSha, testPath, testId)) return { ok: false, why: 'test changed since last Green/Refactor' };
  // every verified REQ is hash-tracked (reqShas); older entries carry only the first one
  for (const [rid, rsha] of Object.entries(last.reqShas ?? { [last.req]: last.reqSha })) {
    if (rsha && reqShaOf(rid) && !reqShaSame(rid, rsha)) return { ok: false, why: `${rid} changed in the spec since last Green/Refactor: re-verify with tdd refactor (wording only) or tdd red/green (behaviour changed)` };
  }
  return { ok: true, weak: !!r.weak, charac: !!r.characterization, retest: !!r.retest };
}

// ---------- config / commands ----------
// multi-project: a subproject without a match must not fail the build; print a per-task total so zero-match detection works
const GRADLE_INIT = 'allprojects { tasks.withType(Test).configureEach { filter.failOnNoMatchingTests = false; afterSuite { d, r -> if (!d.parent) println("Tests run: " + r.testCount + ", Failures: " + r.failedTestCount) } } }';
const R_TEST = 'testthat::test_file(commandArgs(TRUE)[1], reporter = "summary", stop_on_failure = TRUE)';
// Pkg.test() needs a package registry even for stdlib test deps: offline it is an infra error, so fall back to running test/runtests.jl directly (#132)
const JULIA_TEST = 'out=$(julia --project=. -e "using Pkg; Pkg.test()" 2>&1); r=$?; if [ $r -eq 0 ]; then printf "%s\\n" "$out"; exit 0; fi; if [ -f test/runtests.jl ] && printf "%s" "$out" | grep -qiE "to be registered|registry|could not resolve host|failed to (fetch|clone)|network|offline"; then echo "sdd: INFRA: Pkg.test() failed to resolve packages (no registry/network) — falling back to julia --project=. test/runtests.jl"; julia --project=. test/runtests.jl; exit $?; fi; printf "%s\\n" "$out"; exit $r';
// `dotnet test` takes one project: run each affected test project in turn and fail if any fails (#135)
const DOTNET_CHANGED = 'r=0; for p in "$@"; do dotnet test "$p" --nologo || r=1; done; exit $r';
function detectConfig(base = ROOT) {
  const pkg = readJson(path.join(base, 'package.json'), null);
  const has = (f) => fs.existsSync(path.join(base, f));
  const pyTests = () => ['.', 'tests', 'test'].some((d) => { try { return fs.readdirSync(path.join(base, d)).some((f) => /^test_\w*\.py$|^\w+_test\.py$/.test(f)); } catch { return false; } });
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let testCmd;
  const gradle = (has('build.gradle') || has('build.gradle.kts') || has('settings.gradle') || has('settings.gradle.kts')) ? (has('gradlew') ? './gradlew' : 'gradle') : null;
  const dotnet = fs.existsSync(base) && fs.readdirSync(base).some((f) => /\.(csproj|sln|slnx)$/.test(f));
  const phpunit = has('vendor/bin/phpunit') ? 'vendor/bin/phpunit' : 'phpunit';
  // configure once, keep the build log quiet unless it fails (cmake --build re-configures when CMakeLists change)
  const CMAKE_RUN = '[ -f build/CMakeCache.txt ] || cmake -S . -B build -Wno-dev >/dev/null || exit 1; cmake --build build >build/.sdd-build.log 2>&1 || { cat build/.sdd-build.log; exit 1; }; ctest --test-dir build --output-on-failure';
  if (has('node_modules/.bin/vitest')) deps.vitest ??= '*';
  if (has('node_modules/.bin/jest')) deps.jest ??= '*';
  if (deps.vitest) testCmd = ['npx', 'vitest', 'run', '{file}', '-t', '{id}(?![0-9A-Za-z])'];
  else if (deps.jest) testCmd = ['npx', 'jest', '{file}', '-t', '{id}(?![0-9A-Za-z])'];
  else if (has('pyproject.toml') || has('pytest.ini') || has('requirements.txt') || has('conftest.py') || has('tests/conftest.py') || pyTests()) testCmd = ['python3', '-m', 'pytest', '-q', '{file}', '-k', '{idu}'];
  else if (has('go.mod')) testCmd = ['go', 'test', './...', '-run', '{IDU}(_|$)'];
  else if (has('Cargo.toml')) testCmd = ['cargo', 'test', '{idu}'];
  else if (has('pom.xml')) testCmd = ['mvn', '-B', '-ntp', 'test', '-Dtest=*#*{idu}', '-Dsurefire.failIfNoSpecifiedTests=false'];
  else if (gradle) testCmd = ['sh', '-c', `f=$(mktemp --suffix=.gradle) && printf '%s\\n' '${GRADLE_INIT}' > "$f" && ${gradle} -I "$f" cleanTest test --tests "*$0" --console=plain; r=$?; rm -f "$f"; exit $r`, '{idu}'];
  else if (has('CMakeLists.txt')) testCmd = ['sh', '-c', CMAKE_RUN + ' -R "$0"', '{idu}'];
  else if (has('composer.json') || has('phpunit.xml') || has('phpunit.xml.dist')) testCmd = [phpunit, '--do-not-cache-result', '--filter', '{idu}', '{file}'];
  else if (has('DESCRIPTION')) testCmd = ['Rscript', '-e', R_TEST, '{file}'];
  else if (has('Project.toml')) testCmd = ['julia', '--project=.', '{file}'];
  else if (dotnet) testCmd = ['dotnet', 'test', '--nologo', '--filter', 'FullyQualifiedName~{idu}'];
  else if (has('Makefile')) testCmd = ['make', 'test', 'TEST={idu}'];
  else testCmd = ['node', '--test', '--test-name-pattern', '{id}(?![0-9A-Za-z])', '{file}'];
  const checks = [];
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
  const related = deps.vitest ? ['npx', 'vitest', 'related', '--run', '{changedFiles}'] : deps.jest ? ['npx', 'jest', '--findRelatedTests', '{changedFiles}'] : undefined;
  if (!pkg) {
    if (testCmd[0] === 'python3') checks.push({ name: 'test', cmd: ['python3', '-m', 'pytest', '-q'] });
    else if (has('go.mod')) checks.push({ name: 'test', cmd: ['go', 'test', './...'], changedCmd: ['go', 'test', '{changedGoPkgs}'] });
    else if (has('Cargo.toml')) checks.push({ name: 'test', cmd: ['cargo', 'test'], changedCmd: ['cargo', 'test', '{changedCargoPkgs}'] });
    else if (has('pom.xml')) checks.push({ name: 'test', cmd: ['mvn', '-B', '-ntp', 'test'], changedCmd: ['mvn', '-B', '-ntp', 'test', '-pl', '{changedModulesCsv}', '-am', '-DfailIfNoTests=false'] });
    else if (gradle) checks.push({ name: 'test', cmd: [gradle, 'cleanTest', 'test', '--console=plain'], changedCmd: [gradle, '--console=plain', '{changedGradleTasks}'] });
    else if (has('CMakeLists.txt')) checks.push({ name: 'test', cmd: ['sh', '-c', CMAKE_RUN], changedCmd: ['sh', '-c', CMAKE_RUN + ' -R "$0"', '{changedCtestRegex}'] });
    else if (testCmd[0] === phpunit) checks.push({ name: 'test', cmd: [phpunit, '--do-not-cache-result'] });
    else if (dotnet) checks.push({ name: 'test', cmd: ['dotnet', 'test', '--nologo'], changedCmd: ['sh', '-c', DOTNET_CHANGED, 'sdd', '{changedTestProjects}'] });
    else if (has('Makefile')) checks.push({ name: 'test', cmd: ['make', 'test'] });
    else if (has('DESCRIPTION')) checks.push({ name: 'test', cmd: ['Rscript', '-e', 'testthat::test_dir("tests/testthat", reporter = "summary", stop_on_failure = TRUE)'] });
    else if (has('Project.toml')) checks.push({ name: 'test', cmd: ['sh', '-c', JULIA_TEST] });
  }
  for (const s of ['typecheck', 'lint', 'test']) if (pkg?.scripts?.[s]) checks.push({ name: s, cmd: [pm, 'run', s], ...(s === 'test' && related ? { changedCmd: related, hubFallbackCmd: ['npx', deps.vitest ? 'vitest' : 'jest', ...(deps.vitest ? ['run'] : []), '{changedTests}', '{directTests}'] } : {}) });
  const prepare = pkg?.scripts?.build ? { cmd: [pm, 'run', 'build'], outputs: has('dist') ? ['dist'] : [], timeoutMs: 600000 } : undefined;
  return { schemaVersion: 1, testCmd, ...(prepare ? { prepare } : {}), checks, timeoutMs: 120000 };
}
const loadConfig = () => readJson(CONFIG, null) ?? detectConfig();
const MANIFESTS = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|pytest\.ini|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|CMakeLists\.txt|composer\.json|phpunit\.xml(\.dist)?|DESCRIPTION|Project\.toml|Makefile|[^/]+\.(csproj|sln|slnx))$/;
// polyglot monorepo: nested manifests become projects with their own cwd/testCmd/checks
const ECO = [[/package\.json$/, 'js'], [/(pyproject\.toml|requirements\.txt|pytest\.ini)$/, 'py'], [/go\.mod$/, 'go'], [/Cargo\.toml$/, 'rust'], [/(pom\.xml|\.gradle(\.kts)?)$/, 'jvm'], [/CMakeLists\.txt$/, 'cpp'], [/(composer\.json|phpunit\.xml(\.dist)?)$/, 'php'], [/DESCRIPTION$/, 'r'], [/Project\.toml$/, 'julia'], [/Makefile$/, 'make'], [/\.(csproj|sln|slnx)$/, 'dotnet']];
const ecoOf = (f) => ECO.find(([re]) => re.test(f))?.[1];
// only csproj files that can run tests (Microsoft.NET.Test.Sdk / IsTestProject) become projects; class libraries are covered by the test projects that reference them (#132)
const isTestCsproj = (f) => { try { return /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return false; } };
// Go runners cannot cross nested module boundaries, unlike root-managed workspaces.
function detectProjects(skipEco = new Set()) {
  const dirs = new Set();
  const all = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }).stdout.split('\n');
  for (const f of all) if (MANIFESTS.test(f) && f.includes('/') && (ecoOf(f) === 'go' || !skipEco.has(ecoOf(f))) && !/(^|\/)(node_modules|vendor|target|build)\//.test(f) && !(/\.csproj$/.test(f) && !isTestCsproj(f))) dirs.add(path.posix.dirname(f));
  const roots = [...dirs].sort().filter((d, i, a) => fs.existsSync(path.join(ROOT, d, 'go.mod')) || !a.slice(0, i).some((p) => d.startsWith(p + '/')));
  // Go modules that require/replace a sibling module depend on it: a change there must run the dependent's tests under gate --changed (#74)
  const gomod = (r) => { try { return fs.readFileSync(path.join(ROOT, r, 'go.mod'), 'utf8'); } catch { return ''; } };
  const modName = new Map(roots.map((r) => [/^module\s+(\S+)/m.exec(gomod(r))?.[1], r]).filter(([m]) => m));
  const goDeps = (r) => [...new Set([...gomod(r).matchAll(/^\s*(?:require\s+)?([\w.\/-]+)\s+v[\w.+-]+/gm)].map((m) => modName.get(m[1])).concat([...gomod(r).matchAll(/=>\s*(\.[^\s]*)/g)].map((m) => path.posix.normalize(path.posix.join(r, m[1])))).filter((d) => d && d !== r && roots.includes(d)))];
  // a test project depends on the projects it references (transitively) and on shared build files above it (#135)
  const dn = roots.some((r) => dirs.has(r) && all.some((f) => f.startsWith(r + '/') && /\.csproj$/.test(f))) ? dotnetGraph(ROOT) : null;
  const dnDeps = (root) => {
    if (!dn) return [];
    const mine = [...dn.projs.values()].filter((q) => q.dir === root);
    const refs = [...new Set(mine.flatMap((q) => [...dn.deps(q.file)]).map((f) => dn.projs.get(f).dir))].filter((d) => d !== root && d !== '.' && !d.startsWith(root + '/'));
    const props = mine.length ? dn.props.filter((x) => path.posix.dirname(x) === '.' || root.startsWith(path.posix.dirname(x) + '/')) : [];
    return [...refs, ...props];
  };
  return roots.map((root) => { const c = detectConfig(path.join(ROOT, root)); const deps = [...new Set([...goDeps(root), ...dnDeps(root)])]; return { root, ...(deps.length ? { dependsOn: deps } : {}), testCmd: c.testCmd, checks: c.checks.map(({ name, cmd, changedCmd, hubFallbackCmd }) => ({ name, cmd, ...(changedCmd ? { changedCmd } : {}), ...(hubFallbackCmd ? { hubFallbackCmd } : {}) })) }; });
}
function projectFor(p) {
  const ps = (loadConfig().projects ?? []).filter((x) => p === x.root || p.startsWith(x.root.replace(/\/$/, '') + '/'));
  return ps.sort((a, b) => b.root.length - a.root.length)[0] ?? null;
}

// `dotnet test` builds on every call. Within one sdd process (batch `tdd red A B C`, several checks) a second call on the same target gets --no-build only when the previous call built cleanly and no tracked file changed since (#137)
const dotnetBuilt = new Map();
function dotnetStamp(abs) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: abs, encoding: 'utf8', maxBuffer: 64e6 });
  if (r.status !== 0) return null;
  return dotnetOutputFilter(r.stdout.split('\n').filter((f) => f && !f.startsWith('.sdd/'))).map((f) => { try { const st = fs.statSync(path.join(abs, f)); return `${f}:${st.mtimeMs}:${st.size}`; } catch { return f; } }).join('|');
}
function run(cmd, timeoutMs, cwd = '.') {
  const isDotnetTest = cmd[0] === 'dotnet' && cmd[1] === 'test' && !cmd.some((a) => /^--no-(build|restore)$/.test(a));
  if (!isDotnetTest) return run1(cmd, timeoutMs, cwd);
  const abs = path.resolve(ROOT, cwd);
  const fi = cmd.indexOf('--filter');
  const key = abs + '\0' + (fi < 0 ? cmd : cmd.filter((_, i) => i !== fi && i !== fi + 1)).join('\0');
  const stamp = dotnetStamp(abs);
  const prev = dotnetBuilt.get(key);
  if (stamp && prev === stamp) {
    const r = run1([cmd[0], cmd[1], '--no-build', ...cmd.slice(2)], timeoutMs, cwd);
    if (r.exit === 0 || !/was not found|does not exist|NETSDK1004|assets file|not been built/i.test(r.text)) return r;
  }
  const r = run1(cmd, timeoutMs, cwd);
  if (stamp && !/\berror (CS|MSB|NETSDK|NU)\d+|Build FAILED|Restore failed/i.test(r.text) && !r.timedOut) dotnetBuilt.set(key, stamp); else dotnetBuilt.delete(key);
  return r;
}
function run1(cmd, timeoutMs, cwd = '.') {
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: path.resolve(ROOT, cwd), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64e6 });
  const text = (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? String(r.error.message) : '');
  return { exit: r.status ?? (r.error ? 127 : 1), signal: r.signal, text, ms: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT' };
}
// Scope placeholders for changedCmd. An empty result means "cannot scope" and the caller falls back to the full check.
function cmdOut(cmd, cwd) {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 64e6 });
  return r.status === 0 ? r.stdout : null;
}
function nearestDir(abs, rel, marker) {
  let d = path.posix.dirname(rel);
  for (;;) {
    if (marker(path.join(abs, d))) return d;
    if (d === '.' || d === '') return null;
    d = path.posix.dirname(d);
  }
}
// changed Maven modules + their dependents + every upstream module those need: `-am -amd` alone leaves a dependent's other upstream modules outside the reactor (diamond), so they cannot be resolved without `install` (#133)
function mavenClosure(abs, base) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '*pom.xml'], { cwd: abs, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const mods = [];
  for (const p of r.stdout.split('\n').filter((x) => /(^|\/)pom\.xml$/.test(x) && !/(^|\/)(target|node_modules)\//.test(x))) {
    let xml; try { xml = fs.readFileSync(path.join(abs, p), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); } catch { continue; }
    const parent = /<parent>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/.exec(xml)?.[1];
    const noParent = xml.replace(/<parent>[\s\S]*?<\/parent>/, '');
    const self = /<artifactId>([^<]+)<\/artifactId>/.exec(noParent.replace(/<(dependencies|build|dependencyManagement|profiles|reporting|plugins)>[\s\S]*?<\/\1>/g, ''))?.[1];
    if (!self) continue;
    mods.push({ dir: path.posix.dirname(p), self, deps: new Set([...(parent ? [parent] : []), ...[...noParent.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g)].map((m) => m[1])]) });
  }
  const byDir = new Map(mods.map((m) => [m.dir, m]));
  if (!base.every((d) => byDir.has(d))) return null;
  const grow = (start, next) => { const seen = new Set(start); const q = [...start]; while (q.length) for (const n of next(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); } return seen; };
  const dependents = grow(base.map((d) => byDir.get(d).self), (n) => mods.filter((m) => m.deps.has(n)).map((m) => m.self));
  const all = grow([...dependents], (n) => [...(mods.find((m) => m.self === n)?.deps ?? [])].filter((x) => mods.some((m) => m.self === x)));
  return mods.filter((m) => all.has(m.self) && m.dir !== '.').map((m) => m.dir).sort();
}
// .NET project graph: ProjectReference edges (csproj + Directory.Build.props), solution (.sln/.slnx) membership, and which projects can run tests (#135)
function dotnetGraph(abs) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: abs, encoding: 'utf8', maxBuffer: 64e6 });
  if (r.status !== 0) return null;
  const files = dotnetOutputFilter(r.stdout.split('\n').filter(Boolean));
  const read = (f) => { try { return fs.readFileSync(path.join(abs, f), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); } catch { return ''; } };
  const norm = (f, p) => path.posix.normalize(path.posix.join(path.posix.dirname(f), p.replace(/\\/g, '/')));
  const refsOf = (f) => [...read(f).matchAll(/<ProjectReference\s[^>]*?\bInclude\s*=\s*"([^"]+)"/gi)].map((m) => norm(f, m[1]));
  const projs = new Map();
  for (const f of files.filter((x) => /\.(cs|fs|vb)proj$/.test(x))) projs.set(f, { file: f, dir: path.posix.dirname(f), refs: new Set(refsOf(f)), test: /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(read(f)) });
  const under = (d, f) => d === '.' || f.startsWith(d + '/');
  const props = files.filter((x) => /(^|\/)Directory\.(Build|Packages)\.(props|targets)$/.test(x));
  for (const pf of props) for (const q of projs.values()) if (under(path.posix.dirname(pf), q.file)) refsOf(pf).forEach((x) => q.refs.add(x));
  for (const q of projs.values()) q.refs = new Set([...q.refs].filter((x) => projs.has(x) && x !== q.file));
  const sols = new Map();
  for (const f of files.filter((x) => /\.(sln|slnx)$/.test(x))) {
    const t = read(f);
    const m = f.endsWith('x') ? [...t.matchAll(/<Project\s[^>]*?\bPath\s*=\s*"([^"]+)"/g)].map((x) => x[1]) : [...t.matchAll(/^Project\([^)]*\)\s*=\s*"[^"]*",\s*"([^"]+)"/gm)].map((x) => x[1]);
    sols.set(f, new Set(m.map((x) => norm(f, x)).filter((x) => projs.has(x))));
  }
  const ownersOf = (f) => { for (let d = path.posix.dirname(f); ; d = path.posix.dirname(d)) { const o = [...projs.values()].filter((q) => q.dir === d); if (o.length) return o; if (d === '.' || d === '/') return []; } };
  const closure = (start, next) => { const seen = new Set(start); const q = [...start]; while (q.length) for (const n of next(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); } return seen; };
  const deps = (file) => closure([file], (x) => projs.get(x)?.refs ?? []);
  const dependents = (starts) => closure(starts, (x) => [...projs.values()].filter((q) => q.refs.has(x)).map((q) => q.file));
  return { files, projs, props, sols, ownersOf, deps, dependents };
}
const DOTNET_GLOBAL = /(^|\/)(Directory\.(Build|Packages)\.(props|targets)|global\.json|nuget\.config)$|\.(sln|slnx)$/i;
const SCOPE_TOKENS = {
  // changed test projects + test projects that (transitively) reference a changed project; solution/shared build files cannot be scoped (#135)
  '{changedTestProjects}': (rel, abs) => {
    if (rel.some((f) => DOTNET_GLOBAL.test(f))) return [];
    const g = dotnetGraph(abs);
    if (!g) return [];
    const base = new Set();
    for (const f of rel) { if (g.projs.has(f)) base.add(f); else g.ownersOf(f).forEach((o) => base.add(o.file)); }
    if (!base.size) return [];
    return [...g.dependents([...base])].filter((x) => g.projs.get(x)?.test).sort();
  },
  '{changedModulesCsv}': (rel, abs) => {
    const base = [...new Set(rel.map((f) => nearestDir(abs, f, (d) => fs.existsSync(path.join(d, 'pom.xml')))).filter((d) => d && d !== '.'))];
    if (!base.length) return [];
    return (mavenClosure(abs, base) ?? base).join(',');
  },
  '{changedGoPkgs}': (rel, abs) => {
    // go.mod/go.sum edits widen the scope to everything — except in a repo without commits, where every file (go.mod included) is merely untracked (#133)
    const hasHead = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: abs }).status === 0;
    if (hasHead && rel.some((f) => /(^|\/)go\.(mod|sum|work)$/.test(f))) return [];
    const goFiles = rel.filter((f) => f.endsWith('.go'));
    if (!goFiles.length) return [];
    const out = cmdOut(['go', 'list', '-f', '{{.Dir}}|{{.ImportPath}}|{{join .Deps " "}}', './...'], abs);
    if (!out) return [];
    const pkgs = out.trim().split('\n').map((l) => { const [dir, imp, deps] = l.split('|'); return { dir, imp, deps: new Set((deps ?? '').split(' ')) }; });
    const dirs = new Set(goFiles.map((f) => path.resolve(abs, path.posix.dirname(f))));
    const changed = pkgs.filter((p) => dirs.has(path.resolve(p.dir)));
    if (!changed.length) return [];
    return pkgs.filter((p) => changed.some((c) => c.imp === p.imp || p.deps.has(c.imp))).map((p) => p.imp);
  },
  '{changedCargoPkgs}': (rel, abs) => {
    if (rel.some((f) => /(^|\/)Cargo\.(toml|lock)$/.test(f))) return [];
    const out = cmdOut(['cargo', 'metadata', '--no-deps', '--format-version', '1', '--offline'], abs);
    if (!out) return [];
    const pkgs = JSON.parse(out).packages.map((p) => ({ name: p.name, dir: path.dirname(p.manifest_path), deps: p.dependencies.map((d) => d.name) }));
    const hit = new Set();
    for (const f of rel) {
      const full = path.resolve(abs, f);
      const owner = pkgs.filter((p) => full.startsWith(p.dir + path.sep)).sort((a, b) => b.dir.length - a.dir.length)[0];
      if (!owner) return [];
      hit.add(owner.name);
    }
    for (let grew = true; grew;) { grew = false; for (const p of pkgs) if (!hit.has(p.name) && p.deps.some((d) => hit.has(d))) { hit.add(p.name); grew = true; } }
    return [...hit].flatMap((n) => ['-p', n]);
  },
  '{changedGradleTasks}': (rel, abs) => {
    if (rel.some((f) => !f.includes('/') && /^(settings|build)\.gradle(\.kts)?$|^gradle\.properties$/.test(f) || /(^|\/)libs\.versions\.toml$/.test(f))) return [];
    const isMod = (x) => fs.existsSync(path.join(x, 'build.gradle')) || fs.existsSync(path.join(x, 'build.gradle.kts'));
    const mods = new Map();
    const walk = (dir, relDir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || /^(build|node_modules|\.git|\.gradle|\.sdd|out)$/.test(e.name)) continue;
        const r = relDir ? `${relDir}/${e.name}` : e.name;
        if (isMod(path.join(dir, e.name))) mods.set(r, new Set());
        walk(path.join(dir, e.name), r);
      }
    };
    walk(abs, '');
    // dependents are derived from project(':x') references; Gradle's own buildDependents misses them when the dependent is evaluated later
    for (const [m, deps] of mods) for (const f of ['build.gradle', 'build.gradle.kts']) {
      const fp = path.join(abs, m, f);
      if (fs.existsSync(fp)) for (const x of fs.readFileSync(fp, 'utf8').matchAll(/project\(\s*(?:path\s*[:=]\s*)?['"]:?([^'"]+)['"]/g)) deps.add(x[1].split(':').join('/'));
    }
    const hit = new Set();
    for (const f of rel) {
      const d = nearestDir(abs, f, isMod);
      if (!d || d === '.') return [];
      hit.add(d);
    }
    for (let grew = true; grew;) { grew = false; for (const [m, deps] of mods) if (!hit.has(m) && [...deps].some((d) => hit.has(d))) { hit.add(m); grew = true; } }
    return [...hit].flatMap((m) => { const t = ':' + m.split('/').join(':'); return [`${t}:cleanTest`, `${t}:test`]; });
  },
  '{changedCtestRegex}': (rel) => {
    const stems = rel.filter((f) => /(^|\/)(test_?[^/]*|[^/]*_?tests?)\.(c|cc|cpp|cxx)$/i.test(f)).flatMap((f) => { const b = path.posix.basename(f).replace(/\.[^.]+$/, ''); return [b, b.replace(/^test_?|_?tests?$/gi, '')]; }).filter(Boolean);
    // non-test source changes may affect any test: run them all
    if (rel.some((f) => /\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(f) && !/(^|\/)(test_?[^/]*|[^/]*_?tests?)\.(c|cc|cpp|cxx)$/i.test(f)) || rel.some((f) => /CMakeLists\.txt$|\.cmake$/.test(f))) return [];
    return stems.length ? [[...new Set(stems)].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')] : [];
  },
};
const LOAD_ERR = /(cannot find (module|package)|modulenotfounderror|importerror|syntaxerror|cannot resolve|no such file|undefined reference|could not compile|error\[e\d+\]|failed to resolve import|failed to load url|\[build failed\]|^[^\s:]+:\d+(?::\d+)?: (?:fatal )?error\b|cannot find symbol|ld returned \d+ exit status|\[setup failed\]|failed opening required|class \"[^\"]+\" not found|call to undefined (function|method)|php parse error|cannot redeclare|cannot declare class|could not find function|there is no package called|what went wrong:\s*\n(?!execution failed for task '[^']*test')|error (cs|msb|nu)\d+|error ts\d+|test suite failed to run|non-parseable pom|the build could not read|compilation failure|fatal error compiling|release version \d+ not supported|mojoexecutionexception|could not resolve dependencies|dependencies? .{0,80}could not be resolved|cannot open the connection|undefvarerror|loaderror: (systemerror|parseerror)|error collecting |interrupted: \d+ errors? during collection|^error: loaderror: (?!some tests did not pass)|^# [^\n]*\n[^\n]*:\d+:\d+: (undefined|cannot|missing))/im;
// a repo without any commit has no baseline for `--changed` (#150)
function hasCommit() { return spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: ROOT, stdio: 'ignore' }).status === 0; }

// fully-qualified names (`Ns\Cls`) of every class/interface/enum/trait the project declares (#150: namespace-aware, not by short name)
function phpProjectFqcns() {
  const set = new Set();
  for (const f of gitFiles('*.php').filter((x) => !/(^|\/)vendor\//.test(x))) {
    let t = '';
    try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const ns = /^\s*namespace\s+([\w\\]+)\s*[;{]/m.exec(t)?.[1];
    for (const m of t.matchAll(/^\s*(?:(?:final|abstract|readonly)\s+)*(?:class|interface|enum|trait)\s+(\w+)/gm)) set.add(ns ? `${ns}\\${m[1]}` : m[1]);
  }
  return set;
}
// a missing *relative* import that the test file itself references = declared new module
function declaredMissingModule(text, testPath) {
  const src = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  if (/\.py$/.test(testPath)) {
    const missing = /ModuleNotFoundError:\s*No module named ['"]([\w.]+)['"]/.exec(text)?.[1];
    if (!missing) return false;
    const imports = [...src.matchAll(/^\s*from\s+([\w.]+)\s+import\b|^\s*import\s+([^\n#]+)/gm)].flatMap((m) => m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]));
    if (!imports.some((m) => m === missing || m.startsWith(missing + '.'))) return false;
    const base = path.resolve(ROOT, projectFor(testPath)?.root ?? '.');
    const dirs = [base, path.join(base, 'src'), path.dirname(path.join(ROOT, testPath))];
    return !dirs.some((d) => fs.existsSync(path.join(d, ...missing.split('.')) + '.py') || fs.existsSync(path.join(d, ...missing.split('.'), '__init__.py')));
  }
  // PHPUnit: `Class "Ns\\Cls" not found` for a class the test itself imports/uses and no project file declares yet (#117)
  const pm = /Class\s+"([\\\w]+)"\s+not found/.exec(text);
  if (pm && /\.php$/.test(testPath)) {
    const short = pm[1].split('\\').pop();
    const fq = pm[1].replace(/^\\/, '');
    const fqs = phpProjectFqcns();
    const declared = fq.includes('\\') ? fqs.has(fq) : [...fqs].some((x) => x === short || x.endsWith('\\' + short));
    return !declared && (src.includes(fq) || new RegExp(`\\b${short}\\b`).test(src));
  }
  const m = /(?:cannot find (?:module|package)|failed to resolve import|err_module_not_found)[^\n]*?['"`]((?:\.{1,2}\/|\/)[^'"`]+)['"`]/i.exec(text);
  if (!m) return false;
  const dir = path.resolve(ROOT, path.dirname(testPath));
  const abs = path.resolve(dir, m[1]);
  const spec = m[1].startsWith('.') ? m[1] : './' + path.relative(dir, abs).split(path.sep).join('/');
  const bare = spec.replace(/\.[cm]?[jt]sx?$/, '');
  return (src.includes(spec) || src.includes(bare)) && !fs.existsSync(abs);
}
// multi-module builds print a zero-test line for modules without a match; only all-zero counts
// Go: a package line with a duration but no `[no tests to run]`, or a `--- PASS/FAIL` line, means a test ran (#74)
const RAN_TESTS = /tests run: [1-9]\d*,|(?:Passed|Failed)!\s+-\s+Failed:\s*\d+,\s*Passed:\s*\d+,\s*Skipped:\s*\d+,\s*Total:\s*[1-9]|^\s*--- (?:PASS|FAIL): |^(?:ok|FAIL)\s+\S+\s+(?:[\d.]+s|\(cached\))(?:(?!\[no tests)[^\n])*$|ran [1-9]\d* tests?\b|[1-9]\d* tests? (completed|successful|passed)|^ok \d+ /im;
// vitest/jest summary that lists no passed test (everything skipped by -t) means nothing ran (#62)
const NO_PASSED = /^\s*Tests:?\s+(?![^\n]*\d+ (?:passed|failed))[^\n]*\d+ (?:skipped|todo)|^(?:# |ℹ )pass 0\b[^\n]*\n(?:(?:# |ℹ )(?:fail|cancelled|skipped) 0\b[^\n]*\n)*(?:# |ℹ )(?:skipped|todo) [1-9]/im;
const ZERO_TESTS = /(no tests? (found|ran|collected)|# tests 0\b|ran 0 tests|collected 0 items|0 tests? (ran|found|passed)\b|no test files found|no tests were found|no tests to run|tests run: 0,|no tests executed|no test matches)/i;

function pytestNoExecution(text) {
  let skipped = 0, executed = 0;
  const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
  // -qq hides the summary; progress still distinguishes skipped/xfail from executed tests.
  for (const m of plain.matchAll(/^\s*([.sxFEX]+)\s+\[\s*\d+%\]\s*$/gm)) {
    skipped += (m[1].match(/[sx]/g) ?? []).length;
    executed += (m[1].match(/[.FEX]/g) ?? []).length;
  }
  for (const m of plain.matchAll(/^\s*(?:=+\s*)?((?:\d+\s+(?:passed|failed|skipped|xfailed|xpassed|deselected|errors?|warnings?)(?:,\s*)?)+)\s+in\s+[\d.]+s\b[^\n]*$/gim)) {
    for (const count of m[1].matchAll(/(\d+)\s+(\w+)/g)) {
      if (/^(skipped|xfailed)$/i.test(count[2])) skipped += Number(count[1]);
      if (/^(passed|failed|xpassed|errors?)$/i.test(count[2])) executed += Number(count[1]);
    }
  }
  return skipped > 0 && executed === 0;
}

function nodeTestRan(text, id, testPath) {
  const token = new RegExp(`${id}(?![0-9a-z])`, 'i');
  return text.split('\n').some((line) => {
    const m = /^\s*(?:[✔✖]\s+|(?:not )?ok\s+\d+\s+-\s+)(.+)$/.exec(line);
    if (!m || /#\s*(TODO|SKIP)\b/i.test(m[1])) return false;
    const title = m[1].replace(/\s+\([\d.]+(?:ms|s|µs)\).*$/, '').trim();
    return token.test(title) && title !== path.basename(testPath) && path.resolve(ROOT, title) !== path.resolve(ROOT, testPath);
  });
}

// ---------- commands ----------
function cmdInit() {
  const cfg = detectConfig();
  const rootManifests = fs.readdirSync(ROOT).filter((f) => MANIFESTS.test(f));
  const projects = detectProjects(new Set(rootManifests.map(ecoOf)));
  if (projects.length) { cfg.projects = projects; if (!rootManifests.length) cfg.checks = []; }
  const kept = fs.existsSync(CONFIG);
  if (!kept) writeJson(CONFIG, cfg);
  const shown = kept ? { ...cfg, ...readJson(CONFIG, {}) } : cfg;
  fs.mkdirSync(SPECS, { recursive: true });
  if (cfg.projects?.length) out(`${rootManifests.length ? 'root + ' : ''}projects: ${cfg.projects.map((p) => `${p.root} (${p.testCmd.slice(0, 2).join(' ')})`).join(', ')} — each test runs in its project directory`);
  else if (cfg.testCmd[0] === 'node' && !fs.existsSync(path.join(ROOT, 'package.json'))) out('WARNING: stack not recognised (no package.json/pytest.ini/pyproject.toml/requirements.txt/conftest.py/tests/test_*.py/go.mod/Cargo.toml/pom.xml/gradle/CMakeLists.txt; to use pytest add one of those and re-run init after deleting .sdd/config.json) — testCmd is a Node fallback. Set testCmd in .sdd/config.json to a runner that filters by test name, e.g. ["sh","run_tests.sh","{idu}"] (see SKILL.md "Other stacks").');
  out(`init ok: ${rel(CONFIG)}${kept ? ' (existing config kept — delete it to re-detect)' : ''} (testCmd: ${cfg.projects?.length && !rootManifests.length ? 'per project' : (shown.testCmd ?? []).join(' ')}; checks: ${(shown.checks ?? []).map((c) => c.name).join(',') || (cfg.projects?.length ? 'per project' : 'none')})`);
  out('next: write .sdd/specs/<feature>.md (see references/spec-template.md)');
}

// Review file schema: header lines `spec: sha256:<hash>`, `verdict: pass`, `open: <n>`; findings carry an explicit status.
// unresolved statuses (#138): anything but Closed/Resolved/Fixed counts as open
const OPEN_WORD = '(?:open|pending|reopened|re-opened|unresolved|todo|wip|in[ -]progress|blocked)';
const isOpenLine = (l) => /^\s*[-*]\s*\[ \]/.test(l) || new RegExp(`\\b(state|status)\\s*[:=]\\s*\\**${OPEN_WORD}\\b`, 'i').test(l) || new RegExp(`\\*\\*${OPEN_WORD}\\*\\*`, 'i').test(l) || new RegExp(`^\\s*[-*]\\s+${OPEN_WORD}\\b`, 'i').test(l) || (l.includes('|') ? l.split('|').some((c) => new RegExp(`^\\s*\\**${OPEN_WORD}\\b`, 'i').test(c)) : new RegExp(`^\\s*${OPEN_WORD}\\s*$`, 'i').test(l));
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
  const specLines = lines.filter((l) => /^\s*spec(?:\s*[:=]|\s+)/i.test(l));
  const cited = specLines.length === 1 ? /^\s*spec(?:\s*[:=]\s*|\s+)(?:sha256:)?([0-9a-f]{12,64})(?:…|\.\.\.)?\s*$/i.exec(specLines[0])?.[1]?.toLowerCase() : null;
  if (!cited || !specHash.startsWith(cited)) probs.push(`must reference the spec hash in one matching header (spec: sha256:${specHash.slice(0, 12)}…)`);
  return probs;
}
function cmdReview() {
  const [sub, a] = pos.slice(1);
  if (sub === 'template') {
    const spec = loadSpecs().find((x) => x.feature === a);
    if (!a || !spec) { out(`${a ? `unknown feature "${a}"` : 'feature required'}: review template <feature> (known: ${loadSpecs().map((x) => x.feature).join(', ') || 'none'})`); return 2; }
    out(`spec: sha256:${spec ? fileSha(spec.path) : '<spec sha256>'}\nverdict: pending\nopen: 0\n\n## Findings\n| ID | Severity | Where | Status |\n|----|----------|-------|--------|\n(add one row per finding with Status Open or Closed, then set verdict: pass|fail)`);
    return 0;
  }
  if (sub === 'check') {
    if (!a || typeof flags.feature !== 'string') { out('usage: review check <file> --feature <feature> (both required)'); return 2; }
    const spec = loadSpecs().find((x) => x.feature === flags.feature);
    if (!spec) { out(`unknown feature "${flags.feature}" (known: ${loadSpecs().map((x) => x.feature).join(', ') || 'none'})`); return 2; }
    if (!fs.existsSync(path.join(ROOT, a)) || !fs.statSync(path.join(ROOT, a)).isFile()) { out(`review file not found: ${a}`); return 2; }
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
  if (sub === 'retire') {
    const all = readJson(APPROVALS, {});
    if (!all[feature]) { out(`no lock for "${feature ?? ''}"`); return 2; }
    if (specs.some((s) => s.feature === feature)) { out(`REFUSED: spec ${feature} still exists; retire only applies to removed specs`); return 1; }
    const by = typeof flags.by === 'string' ? flags.by.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069\u00ad]/g, '').trim() : '';
    if (!by || /^ai\s*(:|$)/i.test(by)) { out('REFUSED: retiring a locked spec needs a human approver: approve retire <feature> --by <human name>'); return 1; }
    delete all[feature];
    writeJson(APPROVALS, all);
    out(`retired lock ${feature} by ${by}`);
    return 0;
  }
  const spec = specs.find((s) => s.feature === feature);
  if (!spec) { out(`unknown feature "${feature ?? ''}". known: ${specs.map((s) => s.feature).join(', ') || 'none'}`); return 2; }
  if (sub === 'prepare') {
    writeJson(PREPARE_SHOWN, { ...readJson(PREPARE_SHOWN, {}), [spec.feature]: artifactSha(spec.path) });
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
    flags.by = flags.by.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069\u00ad]/g, '').trim().replace(/^ai\s*:\s*/i, (m) => m.replace(/\s/g, ''));
    if (!flags.by || /^ai$/i.test(flags.by)) { out('REFUSED: --by needs a non-empty approver name (ai:<reviewer> for AI, a human name otherwise)'); return 2; }
    const isAi = /^ai:/i.test(flags.by);
    const drift = lockDrift(spec);
    if (drift && isAi) { out(`REFUSED: ${spec.feature} was locked under a stricter policy (${drift}); loosening it needs a human approver`); return 1; }
    if (spec.approval === 'human' && isAi) { out(`REFUSED: ${spec.feature} requires a human approver (approval: human)`); return 1; }
    const dp = designProblem(spec);
    if (dp) { out(`REFUSED: ${dp}`); return 1; }
    const review = typeof flags.review === 'string' ? flags.review.trim() : '';
    if (isAi && (/^ai:\s*(self)?$/i.test(flags.by) || !review)) { out(`REFUSED: ai approver needs a named reviewer (not ai:self) and --review <path-or-summary>, e.g. approve record ${spec.feature} --by ai:<reviewer> --review .sdd/review.md (template: review template ${spec.feature})`); return 1; }
    const reviewIsFile = !!review && fs.existsSync(path.join(ROOT, review)) && fs.statSync(path.join(ROOT, review)).isFile();
    if (isAi && !reviewIsFile && /^[^\s]+\.(md|markdown|txt)$/i.test(review)) { out(`REFUSED: --review ${review} looks like a file path but does not exist (a free-text summary must contain spaces)`); return 1; }
    if (isAi && !reviewIsFile && loadConfig().requireReviewFile) { out('REFUSED: config requireReviewFile — --review must be a file (e.g. .sdd/review.md)'); return 1; }
    if (isAi && reviewIsFile) {
      const probs = reviewProblems(fs.readFileSync(path.join(ROOT, review), 'utf8'), fileSha(spec.path));
      if (probs.length) { out(`REFUSED: ${review} is not an acceptable review file`); probs.slice(0, 6).forEach((x) => out(`  ${x}`)); out('  see: review template <feature>'); return 1; }
    }
    if (spec.approval === 'human') {
      if (/^(bot|agent|copilot|assistant|claude|gpt|human|user|ai|me|test)$/i.test(flags.by)) { out(`REFUSED: "${flags.by}" is not a person's name; approval: human needs the approving human's own name`); return 1; }
      const prep = readJson(PREPARE_SHOWN, {})[spec.feature];
      if (prep !== artifactSha(spec.path)) { out(`REFUSED: no matching \`approve prepare ${spec.feature}\` for the current spec — run it, show the human the exact paths/hashes, then record (after any spec/design edit, prepare again)`); return 1; }
    }
    const all = readJson(APPROVALS, {});
    all[spec.feature] = { by: flags.by, kind: isAi ? 'ai' : 'human', review: review || undefined, reviewSha: review && fs.existsSync(path.join(ROOT, review)) && fs.statSync(path.join(ROOT, review)).isFile() ? fileSha(review) : undefined, at: new Date().toISOString(), artifacts: Object.fromEntries(spec.artifacts.map((p) => [p, artifactSha(p)])), tier: spec.tier, requireHuman: spec.approval === 'human', code: spec.approval === 'human' ? implFileShas(spec) : undefined };
    writeJson(APPROVALS, all);
    out(needsLock(spec) ? `locked ${spec.feature} by ${flags.by}: ${spec.artifacts.join(', ')}` : `recorded ${spec.feature} by ${flags.by}: ${spec.artifacts.join(', ')} — note: ${spec.tier} specs without approval: human are NOT lock-enforced (only T2 / approval: human are verified by gate)`);
    return 0;
  }
  out('usage: approve prepare|record <feature> [--by name]');
  return 2;
}

// files carrying @implements for a spec's REQs: for human-approved features their later edits are surfaced (#88)
function featureGreen(spec) {
  const entries = readLedger();
  const { ents } = scanEntities(listFiles());
  return spec.reqs.filter((q) => !q.deferred && !q.testOnly).every((q) => [...ents.values()].some((e) => e.kind === 'TEST' && e.refs.verifies.includes(q.id) && entries.some((x) => x.test === e.id && x.type === 'green')));
}

function implFileShas(spec) {
  const ids = new Set(spec.reqs.map((r) => r.id));
  const { ents } = scanEntities(listFiles());
  const files = new Set([...ents.values()].filter((e) => e.kind === 'CODE' && e.refs.implements.some((r) => ids.has(r))).map((e) => e.path));
  return Object.fromEntries([...files].sort().map((f) => [f, fileSha(f)]));
}

function cmdGuard() {
  const specs = loadSpecs().filter((s) => !pos[1] || s.feature === pos[1]);
  if (!specs.length) { out('GUARD FAIL: no spec found in .sdd/specs'); return 1; }
  let bad = 0;
  for (const s of specs) {
    const st = needsLock(s) ? approvalState(s) : 'n/a';
    const dp = designProblem(s);
    if (dp) { out(`GUARD FAIL ${s.feature} (T2): ${dp}`); bad++; }
    if (st !== 'ok' && st !== 'n/a') { out(`GUARD FAIL ${s.feature} (T2): approval ${st}`); bad++; }
  }
  const { ents, dups } = scanEntities(listFiles());
  const orphans = traceCheck(ents, dups, loadSpecs()).errors.filter((e) => /references unknown REQ-/.test(e));
  for (const o of orphans.slice(0, 10)) { out(`GUARD FAIL: ${o}`); bad++; }
  if (!bad) out(`GUARD OK (${specs.length} spec${specs.length > 1 ? 's' : ''})`);
  return bad ? 1 : 0;
}

// ---- typed languages: infer arity, arg and return types from the call sites in the test
const LIT = '("(?:[^"\\\\]|\\\\.)*"|-?\\d+\\.\\d+|-?\\d+|true|false)';
const litType = (t) => /^-?\d+[lL]$/.test(t) ? 'long' : /^-?\d+$/.test(t) ? 'int' : /^-?\d+\.\d+$/.test(t) ? 'float' : /^"/.test(t) ? 'str' : /^(true|false)$/.test(t) ? 'bool' : /^&/.test(t) ? 'ptr' : null;
function callInfo(src, name) {
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, 'g');
  const m = re.exec(src);
  if (!m) return { args: [], ret: null, multi: false };
  let i = re.lastIndex, depth = 1, cur = '';
  const args = [];
  for (; i < src.length && depth; i++) {
    const c = src[i];
    // string / char literals are opaque: `"a, b"` is one argument (#149)
    if (c === '"' || (c === "'" && /^'(?:\\.|[^'\\])'/.test(src.slice(i, i + 4)))) {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      if (src[j] === c) { cur += src.slice(i, j + 1); i = j; continue; }
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (!depth) break; }
    if (c === ',' && depth === 1) { args.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  const after = src.slice(i + 1, i + 80), before = src.slice(Math.max(0, m.index - 60), m.index);
  const lit = new RegExp(`^\\s*(?:==|!=|,)\\s*${LIT}`).exec(after)?.[1] ?? new RegExp(`${LIT}\\s*(?:==|!=|,)\\s*$`).exec(before)?.[1];
  // `== Some((0, 0))` => Option<(i64, i64)> (#87)
  const some = new RegExp(`^\\s*(?:==|!=|,)\\s*Some\\(\\s*(?:\\(\\s*${LIT}(?:\\s*,\\s*${LIT})+\\s*\\)|${LIT})\\s*\\)`).exec(after) ?? (/^\s*(?:==|!=|,)\s*None\b/.test(after) ? ['None'] : null);
  const RT = { int: 'i64', float: 'f64', str: 'String', bool: 'bool' };
  const optInner = some && (/^\s*(?:==|!=|,)\s*Some\(\s*\(/.test(after) ? `(${[...some[0].slice(some[0].indexOf('(', some[0].indexOf('Some(') + 5)).matchAll(new RegExp(LIT, 'g'))].map((x) => RT[litType(x[1])] ?? 'i64').join(', ')})` : RT[litType(/Some\(\s*(\S+?)\s*\)/.exec(some[0])?.[1] ?? '0')] ?? 'i64');
  const ret = optInner ? `opt:${optInner}` : /^\s*\.(is_err|is_ok|unwrap_err|unwrap|expect|expect_err)\(/.test(after) || /^\s*(?:==|!=|,)\s*(?:Err|Ok)\(/.test(after) || /\b(?:Err|Ok)\(\s*$/.test(before) ? 'result' : lit ? litType(lit) : null;
  // `_, err := New().Record(..)`: the tuple belongs to the chained method, not to this call (#113)
  return { args: args.map(litType), raws: args, ret, multi: /,\s*\w+\s*:?=\s*$/.test(before) && !/^\s*\./.test(after), chained: /^\s*\./.test(after), argc: args.length };
}
const probe = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, LC_ALL: 'C' } }); return (r.stdout ?? '') + (r.stderr ?? ''); };

function stubGo(testPath, src, dir, add, made) {
  const pkg = /^package\s+(\w+)/m.exec(src)?.[1]?.replace(/_test$/, '') ?? 'main';
  const T = { int: 'int', float: 'float64', str: 'string', bool: 'bool' };
  const params = (c) => Array.from({ length: c.args.length }, (_, i) => `a${i}`).join(', ') + (c.args.length ? ' any' : '');
  // `a, ok, err := X(...)` fixes the number of results (#76)
  // functions whose first result must be a struct (field/method access on the result), and bare New() constructors (#84)
  const retTypes = new Map();
  const capPkg = pkg.charAt(0).toUpperCase() + pkg.slice(1);
  const first = (c, name) => retTypes.get(name) ?? T[c.ret] ?? 'any';
  const retOf = (c, name) => {
    const lhs = name && new RegExp(`((?:[\\w.]+\\s*,\\s*)+[\\w.]+)\\s*:?=\\s*(?:[\\w.]+\\.)?${name}\\(`).exec(src)?.[1].split(',').map((x) => x.trim());
    if (lhs && c.multi) return `(${lhs.map((x, i) => (/^err\w*$/i.test(x) && i === lhs.length - 1 ? 'error' : i === 0 ? first(c, name) : /^(ok|found|has|exists)$/i.test(x) ? 'bool' : 'any')).join(', ')})`;
    if (name && !c.chained && new RegExp(`errors\\.(?:Is|As)\\(\\s*(?:[\\w.]+\\.)?${name}\\(|\\berr\\s*:?=\\s*(?:[\\w.]+\\.)?${name}\\(`).test(src)) return 'error';
    let r = first(c, name);
    // `x := f(..)` followed by len(x) / range x / x[i] needs a slice-like result (#113)
    const sv = name && new RegExp(`\\b(\\w+)\\s*:?=\\s*(?:[\\w.]+\\.)?${name}\\(`).exec(src)?.[1];
    if (r === 'any' && sv && new RegExp(`\\blen\\(\\s*${sv}\\s*\\)|\\brange\\s+${sv}\\b|\\b${sv}\\[`).test(src)) r = '[]any';
    return c.multi ? `(${r}, error)` : r;
  };
  const funcs = new Set();
  // constructors (`New`, `NewX`) return a zero value so setup never panics: the Red then comes from the behaviour under test (#129)
  const fbody = (f, r) => {
    const m = /^\(?\*(\w+)(, error)?\)?$/.exec(r);
    return /^New/.test(f) && m ? `return &${m[1]}{}${m[2] ? ', nil' : ''}` : `panic("not implemented: ${f}")`;
  };
  const errs = new Set();
  const consts = new Set();
  const types = new Map();
  const methods = new Map();
  const base = path.basename(testPath).replace(/_test\.go$/, '');
  let target = path.join(dir, base + '.go');
  for (let n = 1; fs.existsSync(target); n++) target = path.join(dir, `${base}_stub${n > 1 ? n : ''}.go`);
  const render = () => {
    const parts = [];
    for (const [t, fields] of types) parts.push(`type ${t} struct {\n${[...fields].map((f) => `\t${f} any\n`).join('')}}\n`);
    for (const f of funcs) { const c = callInfo(src, f); const ctor = /^New([A-Z]\w*)$/.exec(f)?.[1]; const r = ctor ? (c.multi ? `(*${ctor}, error)` : `*${ctor}`) : retOf(c, f); parts.push(`func ${f}(${params(c)}) ${r} {\n\t${fbody(f, r)}\n}\n`); }
    for (const [t, ms] of methods) for (const m of ms) { const c = callInfo(src.replace(new RegExp(`\\b\\w+\\([^()]*\\)\\.${m}\\(`, 'g'), `${m}(`).replace(new RegExp(`[\\w.]+\\.${m}\\(`, 'g'), `${m}(`), m); parts.push(`func (*${t}) ${m}(${params(c)}) ${retOf(c, m)} {\n\tpanic("not implemented: ${t}.${m}")\n}\n`); }
    for (const e of errs) parts.unshift(`var ${e} = errors.New("${e}")\n`);
    for (const k of consts) parts.unshift(`const ${k} = 0\n`);
    return `package ${pkg}\n\n${errs.size ? 'import "errors"\n\n' : ''}${parts.join('\n')}`;
  };
  // external test package (`package x_test`): stub the qualified symbols of the imported project packages (#113)
  // when it imports project packages, the stub lives there: the in-package pass below must not render over it (#129)
  let extDone = false;
  if (/^package\s+\w+_test\b/m.test(src)) {
    let gr = dir;
    while (gr !== path.dirname(gr) && !fs.existsSync(path.join(gr, 'go.mod'))) gr = path.dirname(gr);
    const mod = fs.existsSync(path.join(gr, 'go.mod')) ? /^module\s+(\S+)/m.exec(fs.readFileSync(path.join(gr, 'go.mod'), 'utf8'))?.[1] : null;
    const exts = [];
    if (mod) for (const m of src.matchAll(/^\s*(?:import\s+)?(?:(\w+)\s+)?"([^"\n]+)"/gm)) {
      if (m[2] !== mod && !m[2].startsWith(mod + '/')) continue;
      const idir = path.join(gr, m[2].slice(mod.length).replace(/^\//, ''));
      const last = m[2].split('/').pop();
      const sources = fs.existsSync(idir) ? fs.readdirSync(idir).filter((f) => /\.go$/.test(f) && !/_test\.go$/.test(f)) : [];
      const hasGo = sources.length > 0;
      const packageName = sources.map((f) => /^\s*package\s+(\w+)/m.exec(fs.readFileSync(path.join(idir, f), 'utf8'))?.[1]).find(Boolean) ?? last;
      const alias = m[1] ?? packageName;
      let file = path.join(idir, hasGo ? `${last}_stub.go` : `${last}.go`);
      for (let n = 2; fs.existsSync(file); n++) file = path.join(idir, `${last}_stub${n}.go`);
      exts.push({ alias, idir, last, packageName, importPath: m[2], hasGo, file, funcs: new Set(), types: new Map(), consts: new Set(), errs: new Set(), methods: new Map() });
    }
    extDone = exts.length > 0;
    for (const e of exts) {
      const q = (x) => x.replace(new RegExp(`\\b${e.alias}\\.`, 'g'), '');
      const qualifier = `(?:${e.alias}|${e.packageName}|"${e.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`;
      const render = () => {
        const parts = [];
        for (const [t, fields] of e.types) parts.push(`type ${t} struct {\n${[...fields].map((f) => `\t${f} any\n`).join('')}}\n`);
        for (const f of e.funcs) { const c = callInfo(q(src), f); const ctor = /^New([A-Z]\w*)$/.exec(f)?.[1]; const r = ctor ? (c.multi ? `(*${ctor}, error)` : `*${ctor}`) : retOf(c, f); parts.push(`func ${f}(${params(c)}) ${r} {\n\t${fbody(f, r)}\n}\n`); }
        for (const [t, ms] of e.methods) for (const m of ms) { const c = callInfo(q(src).replace(new RegExp(`\\b\\w+\\([^()]*\\)\\.${m}\\(`, 'g'), `${m}(`).replace(new RegExp(`[\\w.]+\\.${m}\\(`, 'g'), `${m}(`), m); parts.push(`func (*${t}) ${m}(${params(c)}) ${retOf(c, m)} {\n\tpanic("not implemented: ${t}.${m}")\n}\n`); }
        for (const x of e.errs) parts.unshift(`var ${x} = errors.New("${x}")\n`);
        for (const k of e.consts) parts.unshift(`const ${k} = 0\n`);
        return `package ${e.packageName}\n\n${e.errs.size ? 'import "errors"\n\n' : ''}${parts.join('\n')}`;
      };
      if (!e.hasGo) { fs.mkdirSync(e.idir, { recursive: true }); fs.writeFileSync(e.file, `package ${e.packageName}\n`); }
      for (let pass = 0; pass < 5; pass++) {
        const out = probe('go', ['test', '-count=1', '-gcflags=-e', '-run', '^$', '.'], dir);
        let grew = false;
        for (const m of out.matchAll(new RegExp(`undefined: ${e.alias}\\.(\\w+)`, 'g'))) {
          const n = m[1];
          if (!new RegExp(`\\b${e.alias}\\.${n}\\b`).test(src)) continue;
          const isCall = new RegExp(`${e.alias}\\.${n}\\s*\\(`).test(src);
          const isType = !isCall && /^[A-Z]/.test(n) && new RegExp(`${e.alias}\\.${n}\\s*\\{|[*\\]]${e.alias}\\.${n}\\b|\\bvar\\s+\\w+\\s+\\*?${e.alias}\\.${n}\\b`).test(src);
          if (/^Err[A-Z]/.test(n) && !isCall) { if (e.errs.has(n)) continue; e.errs.add(n); }
          else if (isCall) {
            if (e.funcs.has(n)) continue;
            e.funcs.add(n);
            const ct = /^New([A-Z]\w*)$/.exec(n)?.[1];
            if (ct && !e.types.has(ct)) e.types.set(ct, new Set());
            // the type the test names (`*pkg.Store`) wins over a package-derived one (#148)
            if (n === 'New') { const named = new RegExp(`\\*${e.alias}\\.([A-Z]\\w*)\\b`).exec(src)?.[1]; const bt = named ?? e.last.charAt(0).toUpperCase() + e.last.slice(1); retTypes.set(n, `*${bt}`); if (!e.types.has(bt)) e.types.set(bt, new Set()); }
          }
          else if (isType) { if (e.types.has(n)) continue; e.types.set(n, new Set()); }
          else { if (e.consts.has(n)) continue; e.consts.add(n); }
          grew = true;
        }
        for (const m of out.matchAll(new RegExp(`(\\S+)\\.(\\w+) undefined \\(type \\*?${qualifier}\\.(\\w+) has no field or method`, 'g'))) {
          const [, recv, member, t] = m;
          if (!new RegExp(`\\.${member}\\b`).test(src)) continue;
          if (new RegExp(`${recv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${member}\\s*\\(`).test(src)) { if (!e.methods.has(t)) e.methods.set(t, new Set()); if (e.methods.get(t).has(member)) continue; e.methods.get(t).add(member); }
          else { if (!e.types.has(t) || e.types.get(t).has(member)) continue; e.types.get(t).add(member); }
          grew = true;
        }
        for (const m of out.matchAll(new RegExp(`unknown field (\\w+) in struct literal of type ${qualifier}\\.(\\w+)`, 'g'))) {
          if (e.types.has(m[2]) && !e.types.get(m[2]).has(m[1])) { e.types.get(m[2]).add(m[1]); grew = true; }
        }
        if (!grew) break;
        fs.writeFileSync(e.file, render());
      }
      if (e.funcs.size || e.types.size || e.consts.size || e.errs.size || e.methods.size) made.push(rel(e.file));
      else if (!e.hasGo) fs.rmSync(e.file, { force: true });
    }
  }
  // each pass reveals the next layer: undefined names, then methods/fields of the types just created (#69)
  for (let pass = 0; pass < 4 && !extDone; pass++) {
    const out = probe('go', ['test', '-count=1', '-gcflags=-e', '-run', '^$', '.'], dir);
    let grew = false;
    for (const m of out.matchAll(/undefined: (\w+)/g)) {
      const n = m[1];
      if (!new RegExp(`\\b${n}\\b`).test(src)) continue;
      const isType = /^[A-Z]/.test(n) && (new RegExp(`\\b${n}\\s*\\{|[*\\]]${n}\\b|\\bvar\\s+\\w+\\s+${n}\\b|\\b\\w+\\s+\\*?${n}\\s*[,)]`).test(src)) && !new RegExp(`(?<![\\w.])${n}\\s*\\(`).test(src);
      const isCall = new RegExp(`(?<![\\w.])${n}\\s*\\(`).test(src);
      if (/^Err[A-Z]/.test(n) && !isCall) { if (errs.has(n)) continue; errs.add(n); grew = true; continue; }
      if (/^[A-Z]/.test(n) && !isType && !isCall && !/^New/.test(n)) { if (consts.has(n)) continue; consts.add(n); grew = true; continue; }
      if (isType ? types.has(n) : funcs.has(n)) continue;
      if (n === 'New' && isCall && !isType) {
        // a helper parameter `e *Engine` names the real type (#148)
        const named = [...src.matchAll(/[(,]\s*\w+\s+\*([A-Z]\w*)\b/g)].map((x) => x[1]).find((x) => !/^T$/.test(x)) ?? capPkg;
        funcs.add(n); retTypes.set(n, `*${named}`); if (!types.has(named)) types.set(named, new Set()); grew = true; continue;
      }
      if (isType) types.set(n, new Set()); else { funcs.add(n); const ct = /^New([A-Z]\w*)$/.exec(n)?.[1]; if (ct && !types.has(ct)) types.set(ct, new Set()); }
      grew = true;
    }
    for (const m of [...out.matchAll(/(\S+)\.(\w+) undefined \(type \*?(\w+) has no field or method \w+\)/g)].map((x) => Object.assign([x[0], x[2], x[3]], { recv: x[1] }))) {
      const [, member, t] = m;
      if (t === 'any' || !new RegExp(`\\.${member}\\b`).test(src)) continue;
      const isCall = new RegExp(`\\.${member}\\s*\\(`).test(src) && !(m.recv && !new RegExp(`${m.recv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${member}\\s*\\(`).test(src));
      if (isCall) { if (!methods.has(t)) methods.set(t, new Set()); if (methods.get(t).has(member)) continue; methods.get(t).add(member); }
      else { if (!types.has(t)) continue; if (types.get(t).has(member)) continue; types.get(t).add(member); }
      grew = true;
    }
    for (const m of out.matchAll(/(\w+)\.(\w+) undefined \(type any has no field or method \w+\)/g)) {
      const [, v, member] = m;
      const as = [...src.matchAll(/((?:\w+\s*,\s*)*\w+)\s*:?=\s*(?:[\w.]+\.)?(\w+)\(/g)].find((x) => x[1].split(',').map((y) => y.trim())[0] === v);
      if (!as || retTypes.has(as[2])) continue;
      const tn = `${as[2]}Result`;
      retTypes.set(as[2], tn);
      types.set(tn, new Set());
      funcs.add(as[2]);
      grew = true;
    }
    for (const m of out.matchAll(/unknown field (\w+) in struct literal of type (\w+)/g)) {
      if (types.has(m[2]) && !types.get(m[2]).has(m[1])) { types.get(m[2]).add(m[1]); grew = true; }
    }
    if (!grew) break;
    fs.writeFileSync(target, render());
  }
  if (!extDone && fs.existsSync(target)) made.push(rel(target));
  // compile-check what was written: an honest verdict instead of an assumed "Red-safe" (#129)
  const after = made.length ? probe('go', ['test', '-count=1', '-gcflags=-e', '-run', '^$', '.'], dir) : '';
  const err = /^(?:vet: )?\S+\.go:\d+:\d+: .*$/m.exec(after);
  return Object.assign([...new Set(made)], made.length ? (err ? { verified: 'fail', verifyError: err[0].slice(0, 160) } : { verified: 'ok' }) : {});
}

function stubRust(testPath, src, dir, made) {
  const root = (() => { let d = dir; while (d !== path.dirname(d)) { if (fs.existsSync(path.join(d, 'Cargo.toml'))) return d; d = path.dirname(d); } return null; })();
  if (!root || !/(^|\/)tests\//.test(testPath)) return made;
  const ownLib = path.join(root, 'src/lib.rs');
  const probeFile = !fs.existsSync(ownLib);
  if (probeFile) { fs.mkdirSync(path.dirname(ownLib), { recursive: true }); fs.writeFileSync(ownLib, ''); }
  const T = { int: 'i64', float: 'f64', str: 'String', bool: 'bool', result: 'Result<i64, String>' };
  // capitalised names are types: `Name::Variant` => enum, otherwise a unit struct (never a function)
  // associated fns `Type::new(..)` and instance methods `v.m(..)` on `let v = Type::new(..)` (#103)
  const rustImpl = (n) => {
    const assoc = [...new Set([...src.matchAll(new RegExp(`(?<![\\w:])${n}::([a-z_]\\w*)\\s*\\(`, 'g'))].map((m) => m[1]))];
    const vars = [...new Set([...src.matchAll(new RegExp(`\\blet\\s+(?:mut\\s+)?(\\w+)\\s*(?::[^=]+)?=\\s*${n}::[a-z_]\\w*\\s*\\(`, 'g'))].map((m) => m[1]))];
    const inst = [...new Set(vars.flatMap((v) => [...src.matchAll(new RegExp(`(?<![\\w.])${v}\\s*\\.\\s*([a-z_]\\w*)\\s*\\(`, 'g'))].map((m) => m[1])))].filter((k) => !assoc.includes(k));
    // methods called only on `let mut v` bindings take `&mut self` (#114)
    const mutVars = new Set([...src.matchAll(new RegExp(`\\blet\\s+mut\\s+(\\w+)\\s*(?::[^=]+)?=\\s*${n}::[a-z_]\\w*\\s*\\(`, 'g'))].map((m) => m[1]));
    const needsMut = (k) => { const cs = vars.filter((v) => new RegExp(`(?<![\\w.])${v}\\s*\\.\\s*${k}\\s*\\(`).test(src)); return cs.length > 0 && cs.every((v) => mutVars.has(v)) && cs.some((v) => new RegExp(`^\\s*${v}\\s*\\.\\s*${k}\\s*\\(`, 'm').test(src)); };
    if (!assoc.length && !inst.length) return '';
    const gen = (c) => c.args.map((_, i) => `A${i}`);
    const sig = (k, self) => { const c = callInfo(src.replace(/\b\w+\./g, ''), k); const g = gen(c); return `    pub fn ${k}${g.length ? `<${g.join(', ')}>` : ''}(${[self ? (needsMut(k) ? '&mut self' : '&self') : '', ...g.map((t, i) => `_a${i}: ${t}`)].filter(Boolean).join(', ')}) -> ${self ? (c.ret?.startsWith('opt:') ? `Option<${c.ret.slice(4)}>` : T[c.ret] ?? 'i64') : c.ret === 'result' ? 'Result<Self, String>' : 'Self'} {\n        ${!self && /^(new|default|with_\w+|from_\w+|create|empty)$/.test(k) ? (c.ret === 'result' ? 'Ok(Self)' : 'Self') : `unimplemented!("${n}::${k}")`}\n    }\n`; };
    return `\nimpl ${n} {\n${[...assoc.map((k) => sig(k, false)), ...inst.map((k) => sig(k, true))].join('\n')}}\n`;
  };
  const typeStub = (n) => {
    const vs = [...new Set([...src.matchAll(new RegExp(`\\b${n}::([A-Z]\\w*)`, 'g'))].map((m) => m[1]))];
    if (vs.length) return `#[derive(Debug, Clone, Copy, PartialEq, Eq)]\npub enum ${n} {\n${vs.map((v) => `    ${v},\n`).join('')}}\n`;
    // struct literal `N { x: 1, y: "a" }` => named fields typed from the values (#130)
    const lit = new RegExp(`(?<!\\w)${n}\\s*\\{\\s*([a-z_]\\w*\\s*:[^{}]*)\\}`).exec(srcNoUse);
    const fields = lit ? lit[1].split(',').map((f) => /^\s*([a-z_]\w*)\s*:\s*([^]*?)\s*$/.exec(f)).filter(Boolean).map((m) => [m[1], /^-?\d+\.\d*/.test(m[2]) ? 'f64' : /^-?\d+$/.test(m[2]) ? 'i64' : /^"/.test(m[2]) || /String::from|\.to_string\(|\.to_owned\(/.test(m[2]) ? 'String' : /^(true|false)$/.test(m[2]) ? 'bool' : /^vec!/.test(m[2]) ? 'Vec<i64>' : 'i64']) : [];
    return fields.length ? `#[derive(Debug, Clone, Default, PartialEq)]\npub struct ${n} {\n${fields.map(([f, t]) => `    pub ${f}: ${t},\n`).join('')}}\n${rustImpl(n)}` : `#[derive(Debug, Clone, Default, PartialEq)]\npub struct ${n};\n${rustImpl(n)}`;
  };
  const itemStub = (n) => { if (/^[A-Z]/.test(n)) return typeStub(n); const c = callInfo(src, n); const g = c.args.map((_, i) => `A${i}`); return `pub fn ${n}${g.length ? `<${g.join(', ')}>` : ''}(${c.args.map((_, i) => `_a${i}: A${i}`).join(', ')}) -> ${c.ret?.startsWith('opt:') ? `Option<${c.ret.slice(4)}>` : T[c.ret] ?? 'i64'} {\n    unimplemented!("${n}")\n}\n`; };
  // `use <crate>::a::b::{X, f};` => missing modules `a`, `a/b` (declared in the parent) holding the imported items (#69). Existing modules are never touched.
  const pkgName = (toml) => /\[package\][^[]*?^\s*name\s*=\s*"([^"]+)"/ms.exec(fs.readFileSync(toml, 'utf8'))?.[1]?.replace(/-/g, '_');
  // every workspace member crate by name, so `use other_crate::a::X` is stubbed in that crate (#76)
  const crates = new Map();
  for (const f of spawnSync('git', ['ls-files', '-co', '--exclude-standard', '--', 'Cargo.toml', '**/Cargo.toml'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean)) { const n = pkgName(path.join(ROOT, f)); if (n) crates.set(n, path.resolve(ROOT, path.dirname(f))); }
  const modNames = new Set();
  const freshMods = new Set();
  const srcNoUse = src.replace(/^\s*use\s[^;]*;/gm, '');
  // inline paths `krate::geo::Point { .. }` / `krate::util::f(..)` count as imports of that item (#130)
  const inline = [...srcNoUse.matchAll(/(?<![\w:])(\w+)((?:::[a-z_]\w*)+)::([A-Za-z_]\w*)/g)].filter((m) => crates.has(m[1])).map((m) => `use ${m[1]}${m[2]}::${m[3]};`).join('\n');
  for (const m of (src + '\n' + inline).matchAll(/^\s*use\s+(\w+)((?:::[a-z_]\w*)+)::(\{[^}]*\}|\w+)\s*;/gm)) {
    const croot = crates.get(m[1]);
    if (!croot) continue;
    const items = (m[3].startsWith('{') ? m[3].slice(1, -1).split(',') : [m[3]]).map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => /^[A-Za-z_]\w*$/.test(x) && x !== 'self' && new RegExp(`\\b${x}\\b`).test(srcNoUse));
    if (!items.length) continue;
    const lib = path.join(croot, 'src/lib.rs');
    if (!fs.existsSync(lib)) { fs.mkdirSync(path.dirname(lib), { recursive: true }); fs.writeFileSync(lib, ''); made.push(rel(lib)); }
    const segs = m[2].split('::').filter(Boolean);
    segs.forEach((x) => modNames.add(x));
    let parent = lib;
    let created = false;
    let last = lib;
    for (let i = 0; i < segs.length; i++) {
      const f = path.join(croot, 'src', ...segs.slice(0, i + 1)) + '.rs';
      const mf = path.join(croot, 'src', ...segs.slice(0, i + 1), 'mod.rs');
      created = false;
      if (!fs.existsSync(f) && !fs.existsSync(mf)) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, '');
        const prev = fs.readFileSync(parent, 'utf8');
        if (!new RegExp(`\\bmod\\s+${segs[i]}\\b`).test(prev)) fs.writeFileSync(parent, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + `pub mod ${segs[i]};\n`);
        made.push(rel(parent), rel(f));
        created = true;
      }
      parent = fs.existsSync(f) ? f : mf;
      last = parent;
    }
    if (created) { fs.writeFileSync(last, items.map(itemStub).join('\n')); freshMods.add(last); }
    else if (freshMods.has(last)) fs.appendFileSync(last, '\n' + items.filter((x) => !new RegExp(`\\b(?:struct|enum|fn)\\s+${x}\\b`).test(fs.readFileSync(last, 'utf8'))).map(itemStub).join('\n'));
  }
  const cargoTest = () => probe('cargo', ['test', '--no-run', '--offline', '--test', path.basename(testPath, '.rs')], root);
  const out = cargoTest();
  const names = [...new Set([...out.matchAll(/cannot find function `(\w+)`|unresolved import `[\w:]+::(\w+)`|no `(\w+)` in the root|cannot find struct, variant or union type `(\w+)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]))].filter((n) => !modNames.has(n) && new RegExp(`\\b${n}\\b`).test(srcNoUse));
  // compile-check what was written: an honest verdict instead of an assumed "Red-safe" (#130)
  const verified = () => {
    const after = made.length || names.length ? cargoTest() : out;
    const err = /^error(?:\[\w+\])?: .*$/m.exec(after.replace(/^error: could not compile.*$/gm, ''));
    return err ? { verified: 'fail', verifyError: err[0].slice(0, 160) } : { verified: 'ok' };
  };
  if (!names.length) { if (probeFile && !made.length) fs.rmSync(ownLib); return Object.assign([...new Set(made)], verified()); }
  const body = names.map(itemStub).join('\n');
  const prev = fs.readFileSync(ownLib, 'utf8');
  fs.writeFileSync(ownLib, prev + (prev && !prev.endsWith('\n\n') ? '\n' : '') + body);
  made.push(rel(ownLib));
  return Object.assign([...new Set(made)], verified());
}

function stubJava(testPath, src, dir, add, made) {
  const pkg = /^package\s+([\w.]+);/m.exec(src)?.[1];
  // generated classes carry a marker so a later `tdd stub` can extend them; real code is never touched (#149)
  const JMARK = '// sdd-stub: throwing stub generated by `tdd stub` — replace with the real implementation\n';
  const plainAdd = add;
  add = (abs, body) => {
    if (!fs.existsSync(abs)) return plainAdd(abs, JMARK + body);
    const cur = fs.readFileSync(abs, 'utf8');
    if (!cur.startsWith('// sdd-stub')) return;
    const fresh = [...body.matchAll(/^    public [^\n]*\{\n(?:        [^\n]*\n)+    \}\n/gm)].map((m) => m[0]).filter((m) => !cur.includes(m.split('\n')[0]));
    if (!fresh.length) return;
    fs.writeFileSync(abs, cur.slice(0, cur.lastIndexOf('}')).replace(/\n*$/, '\n\n') + fresh.join('\n') + '}\n');
    made.push(rel(abs));
  };
  const imports = [...src.matchAll(/^import\s+(static\s+)?([\w.]+)\.(\w+)\s*;/gm)].map((m) => ({ st: !!m[1], p: m[2], n: m[3] }));
  // classes imported from the project's own package (same first two segments as the test) are project code to stub, not libraries (#130)
  const projPkg = (p) => pkg && p.split('.').slice(0, 2).join('.') === pkg.split('.').slice(0, 2).join('.');
  const pkgOf = new Map(imports.filter((i) => !i.st && /^[A-Z]/.test(i.n) && projPkg(i.p)).map((i) => [i.n, i.p]));
  const imported = new Set(imports.filter((i) => !pkgOf.has(i.n)).map((i) => i.n));
  const local = new Set([...src.matchAll(/\b(?:class|interface|enum|record)\s+(\w+)/g)].map((m) => m[1]));
  const known = new Set(listFiles().filter((f) => { try { return !fs.readFileSync(path.join(ROOT, f), 'utf8').startsWith('// sdd-stub'); } catch { return true; } }).map((f) => path.basename(f).replace(/\.java$/, '')));
  const JDK = /^(System|Math|String|Integer|Long|Double|Boolean|Character|Objects|Arrays|List|Map|Set|Collections|Optional|Thread|Assertions?|Assert|Files|Paths|Path|Instant|Duration|LocalDate|LocalDateTime|StringBuilder|Stream|Collectors|Pattern|UUID|BigDecimal|BigInteger)$/;
  // names that a java.*/javax.* wildcard import (or java.lang) already provides must never be stubbed into the project (#115)
  const wild = [...src.matchAll(/^import\s+((?:java|javax)[\w.]*)\.\*\s*;/gm)].map((m) => m[1]).concat('java.lang');
  const jdkCache = new Map();
  const isJdk = (n) => JDK.test(n) || (jdkCache.has(n) ? jdkCache.get(n) : (jdkCache.set(n, wild.some((p) => spawnSync('javap', [`${p}.${n}`], { stdio: 'ignore' }).status === 0)), jdkCache.get(n)));
  const byClass = new Map();
  for (const m of src.matchAll(/(?<![\w.])([A-Z]\w*)\.([a-z]\w*)\s*\(/g)) {
    if (imported.has(m[1]) || local.has(m[1]) || known.has(m[1]) || isJdk(m[1])) continue;
    byClass.set(m[1], [...(byClass.get(m[1]) ?? []), m[2]]);
  }
  // `new X(...)` needs a constructible class too (#76)
  const ctors = new Set();
  for (const m of src.matchAll(/\bnew\s+([A-Z]\w*)\s*\(/g)) {
    if (imported.has(m[1]) || local.has(m[1]) || known.has(m[1]) || isJdk(m[1]) || /^(Exception|RuntimeException|IllegalArgumentException|IllegalStateException|ArrayList|HashMap|HashSet|LinkedList|Object|Random|Scanner)$/.test(m[1])) continue;
    ctors.add(m[1]);
    if (!byClass.has(m[1])) byClass.set(m[1], []);
  }
  const rootRel = rel(dir);
  const mainDir = /src\/test\/java/.test(rootRel + '/') ? path.resolve(ROOT, rootRel.replace('src/test/java', 'src/main/java')) : /(^|\/)test$/.test(rootRel) ? path.resolve(dir, '../src') : dir;
  const T = { int: 'int', long: 'long', float: 'double', str: 'String', bool: 'boolean' };
  // `Cls.UPPER` (no call) => enum constant; a class used only that way becomes an enum (#76)
  const consts = new Map();
  for (const m of src.matchAll(/(?<![\w.])([A-Z]\w*)\.([A-Z][A-Z0-9_]*)\b(?!\s*\()/g)) {
    if (imported.has(m[1]) || local.has(m[1]) || known.has(m[1]) || isJdk(m[1])) continue;
    consts.set(m[1], [...new Set([...(consts.get(m[1]) ?? []), m[2]])]);
    if (!byClass.has(m[1])) byClass.set(m[1], []);
  }
  // exceptions used in assertThrows / catch / expected= / `new X(..)` / `X.class` become RuntimeException subclasses (#130)
  const excs = new Set();
  for (const m of src.matchAll(/\b(?:assertThrows|assertThatThrownBy|expected\s*=|catch\s*\(|new|extends)\s*\(?\s*([A-Z]\w*(?:Exception|Error))\b|\b([A-Z]\w*(?:Exception|Error))\.class\b/g)) {
    const n = m[1] ?? m[2];
    if (imported.has(n) || local.has(n) || known.has(n) || isJdk(n) || /^(Exception|Error|Throwable|RuntimeException|AssertionError|\w*(IllegalArgument|IllegalState|NullPointer|UnsupportedOperation|IndexOutOfBounds|Arithmetic|Number|ClassCast|IO|FileNotFound|Timeout|NoSuchElement|Interrupted|CloneNotSupported|Security|Illegal)\w*)$/.test(n)) continue;
    excs.add(n);
    byClass.delete(n);
  }
  // `Type v = <call>` / `Type v = new ..` where Type is a project class nobody defined: it must exist for the stub to compile
  const javaRoot = pkg && mainDir.endsWith(path.join(...pkg.split('.'))) ? mainDir.slice(0, mainDir.length - path.join(...pkg.split('.')).length - 1) : mainDir;
  const fileOf = (cls) => pkgOf.has(cls) ? path.join(javaRoot, ...pkgOf.get(cls).split('.'), cls + '.java') : path.join(mainDir, cls + '.java');
  const pkgLine = (cls) => { const p = pkgOf.get(cls) ?? pkg; return p ? `package ${p};\n\n` : ''; };
  for (const n of excs) add(fileOf(n), `${pkgLine(n)}public class ${n} extends RuntimeException {\n    public ${n}() {\n        super();\n    }\n\n    public ${n}(String message) {\n        super(message);\n    }\n}\n`);
  // return type of a call: declared type (`T v = ..m(`), enum constant it is compared with, a static factory returns its own class, else a literal it is compared with (never when the call is chained)
  // only when the call is the whole initializer: `T v = x.m(..);` not `T v = x.m(..).n()`
  const allDecl = (n, st, cls) => {
    const re = new RegExp(`\\b(int|long|double|boolean|String|[A-Z]\\w*(?:<[^;=()]*>)?)\\s+\\w+\\s*=\\s*(?:\\([\\w<>]+\\)\\s*)?${st ? `${cls}\\.` : '(?:[\\w.()"]*\\.)?'}${n}\\s*\\(`, 'g');
    for (let m; (m = re.exec(src));) { let depth = 1, k = re.lastIndex; for (; k < src.length && depth; k++) { if (src[k] === '(') depth++; else if (src[k] === ')') depth--; } if (!/^\s*\./.test(src.slice(k))) return m[1]; }
    return undefined;
  };
  const enumCmp = (n) => new RegExp(`assert(?:Equals|Same)\\(\\s*([A-Z]\\w*)\\.[A-Z][A-Z0-9_]*\\s*,\\s*[\\w.()",\\s]*?\\.${n}\\s*\\(`).exec(src)?.[1];
  const chain = (n) => new RegExp(`\\.${n}\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*\\.\\s*([a-z]\\w*)\\s*\\(`).exec(src)?.[1];
  const arities = (n, text, st) => { const re = new RegExp(`(?<![\\w${st ? '.' : ''}])${n}\\s*\\(`, 'g'); const seen = new Map(); let m; while ((m = re.exec(text))) { const c = callInfo(text.slice(Math.max(0, m.index - 60)), n); if (!seen.has(c.args.length)) seen.set(c.args.length, c); else if (!seen.get(c.args.length).ret && c.ret) seen.set(c.args.length, c); } return [...seen.values()]; };
  const chainClasses = new Map();
  const retOf = (cls, n, c, isStatic, text) => {
    const d = allDecl(n, isStatic, cls);
    if (d && !/^var$/.test(d)) return d;
    const e = enumCmp(n);
    if (e) return e;
    const ch = chain(n);
    if (ch && !(isStatic && /^(of|create|from|zero|empty|parse|valueOf|none|one|default\w*|new\w*|with\w*|unit)$/.test(n))) { const rc = n[0].toUpperCase() + n.slice(1) + 'Result'; chainClasses.set(rc, [...new Set([...(chainClasses.get(rc) ?? []), ch])]); return rc; }
    if (isStatic && /^(of|create|from|zero|empty|parse|valueOf|none|one|default\w*|new\w*|with\w*|unit)$/.test(n) && !c.ret) return cls;
    return c.ret && !c.chained ? (T[c.ret] ?? 'int') : 'int';
  };
  const sigs = (cls, n, text, isStatic) => arities(n, text, isStatic).map((c) => `    public ${isStatic ? 'static ' : ''}${retOf(cls, n, c, isStatic, text)} ${n}(${c.args.map((_, i) => `Object a${i}`).join(', ')}) {\n        throw new UnsupportedOperationException("not implemented: ${isStatic ? '' : cls + '.'}${n}");\n    }\n`).join('\n');
  // receivers: `new Cls(..).m(`, variables built from Cls, variables declared `Cls v`, and `Cls.factory(..).m(`
  const instOf = (cls) => {
    const ms = new Set(methodsOf(src, cls));
    const vars = [...src.matchAll(new RegExp(`\\b${cls}\\s+(\\w+)\\s*(?:=|;|,|\\))`, 'g'))].map((m) => m[1]);
    for (const v of vars) for (const m of src.matchAll(new RegExp(`(?<![\\w.])${v}\\s*\\.\\s*([a-z]\\w*)\\s*\\(`, 'g'))) ms.add(m[1]);
    for (const m of src.matchAll(new RegExp(`\\b${cls}\\.[a-z]\\w*\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*\\.\\s*([a-z]\\w*)\\s*\\(`, 'g'))) ms.add(m[1]);
    return [...ms].filter((k) => !/^(equals|hashCode|toString|getClass|compareTo|assert\w*)$/.test(k));
  };
  for (const m of src.matchAll(/\b([A-Z]\w*)\s+\w+\s*=\s*(?:new\s+\1\s*\(|\1\.[a-z]\w*\s*\()|\b([A-Z]\w*)\s+\w+\s*=\s*[\w.]+\.[a-z]\w*\s*\(/g)) {
    const c = m[1] ?? m[2];
    if (c && !byClass.has(c) && !excs.has(c) && !imported.has(c) && !local.has(c) && !known.has(c) && !isJdk(c) && !/^(Object|Exception|Throwable)$/.test(c)) byClass.set(c, []);
  }
  // element types of declared generic results (`List<Token> ts = ..`) must exist too (#149)
  for (const m of src.matchAll(/\b(?:List|Set|Optional|Collection|Iterable|Stream|Deque|Queue)<([A-Z]\w*)>\s+\w+\s*=\s*[\w.]+\.[a-z]\w*\s*\(/g)) {
    const c = m[1];
    if (!byClass.has(c) && !excs.has(c) && !imported.has(c) && !local.has(c) && !known.has(c) && !isJdk(c) && !/^(Object|Exception|Throwable|Integer|Long|Double|String|Boolean|Character)$/.test(c)) byClass.set(c, []);
  }
  const existing = new Map(listFiles().filter((f) => /\.java$/.test(f)).map((f) => [path.basename(f, '.java'), f]));
  for (const cls of new Set([...src.matchAll(/(?<![\w.])([A-Z]\w*)\.[a-z]\w*\s*\(/g)].map((m) => m[1]))) {
    const f = existing.get(cls);
    if (!f || local.has(cls)) continue;
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (text.startsWith('// sdd-stub')) continue;
    const miss = [...new Set([...src.matchAll(new RegExp(`(?<![\\w.])${cls}\\.([a-z]\\w*)\\s*\\(`, 'g'))].map((m) => m[1]))].filter((n) => !new RegExp(`\\b${n}\\s*\\(`).test(text));
    if (miss.length) (made.realMissing ??= []).push(`${miss.join(', ')} in ${f}`);
  }
  for (const [cls, ms] of byClass) {
    if (consts.has(cls) && !ms.length && !ctors.has(cls)) { add(fileOf(cls), `${pkgLine(cls)}public enum ${cls} {\n    ${consts.get(cls).join(', ')}\n}\n`); continue; }
    const cc = consts.get(cls)?.map((k) => `    public static final int ${k} = 0;\n`).join('') ?? '';
    const ctorSrc = ctors.has(cls) ? callInfo(src.replace(new RegExp(`\\bnew\\s+${cls}\\s*\\(`, 'g'), `${cls}(`), cls) : null;
    const ctorDecl = ctorSrc ? `    public ${cls}(${ctorSrc.args.map((t, i) => `${T[t] ?? 'Object'} a${i}`).join(', ')}) {}\n` : '';
    const body = [...new Set(ms)].map((n) => sigs(cls, n, src.replace(new RegExp(`\\b${cls}\\.`, 'g'), ''), true)).join('\n');
    const inst = instOf(cls).filter((n) => !ms.includes(n)).map((n) => sigs(cls, n, src.replace(/\b\w+\./g, '').replace(/\)\s*\.\s*/g, ') '), false)).join('\n');
    const all = [body, inst].filter(Boolean).join('\n');
    add(fileOf(cls), `${pkgLine(cls)}${/<|\bList\b|\bMap\b/.test(all) ? 'import java.util.*;\n\n' : ''}public class ${cls} {\n${cc}${ctorDecl}${(cc || ctorDecl) && all ? '\n' : ''}${all}}\n`);
  }
  // `foo().bar()` results get their own class so the chain compiles
  // a chained result that is iterated/streamed (`.stream()`, `.get(0)`, `.size()`) is a list so the chain compiles (#149)
  const COLL = /^(get|stream|size|isEmpty|contains|iterator|forEach|add|first|last)$/;
  for (const [rc, ms] of chainClasses) add(path.join(mainDir, rc + '.java'), `${pkg ? `package ${pkg};\n\n` : ''}${ms.some((k) => COLL.test(k)) ? 'import java.util.*;\n\n' : ''}public class ${rc}${ms.some((k) => COLL.test(k)) ? ' extends ArrayList<Object>' : ''} {\n${ms.filter((k) => !COLL.test(k)).map((k) => sigs(rc, k, src.replace(/\b\w+\./g, '').replace(/\)\s*\.\s*/g, ') '), false)).join('\n')}}\n`);
  return made;
}

function stubC(testPath, src, dir, add, made) {
  const cpp = /\.(cc|cpp|cxx)$/.test(testPath);
  const missing = [...src.matchAll(/#include\s+"([^"]+)"/g)].map((m) => m[1]).filter((h) => !fs.existsSync(path.resolve(dir, h)) && !fs.existsSync(path.resolve(ROOT, h)));
  const cc = cpp ? 'c++' : 'cc';
  const incs = [dir, ...['include', 'src'].map((d) => path.join(ROOT, d)), ROOT].flatMap((d) => ['-I', d]);
  // compile-check the result: an honest verdict instead of an assumed "Red-safe" (#130)
  const verified = () => { const o = probe(cc, ['-fsyntax-only', ...incs, path.join(ROOT, testPath)], dir); const e = /^[^\n]*\berror:.*$/m.exec(o); return e ? { verified: 'fail', verifyError: e[0].replace(ROOT + '/', '').slice(0, 200) } : { verified: 'ok' }; };
  if (!missing.length) return Object.assign(made, verified());
  for (const h of missing) { fs.mkdirSync(path.dirname(path.resolve(dir, h)), { recursive: true }); fs.writeFileSync(path.resolve(dir, h), ''); }
  const out = probe(cpp ? 'c++' : 'cc', ['-fsyntax-only', '-I', dir, path.join(ROOT, testPath)], dir);
  // anything an already-present project header declares must not be redeclared (#96)
  const present = gitFiles('*.h').concat(gitFiles('*.hpp')).map((f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
  const declared = (n) => new RegExp(`\\b${n}\\s*\\(`).test(present);
  // C++ classes the test constructs (`lsm::BloomFilter f(1000, 0.01); f.add("a");`) become throwing class stubs, not functions (#149)
  const cppCls = new Map();
  const cppVars = new Set();
  if (cpp) {
    const lit = { int: 'int', float: 'double', str: 'std::string', bool: 'bool' };
    const get = (ns, c) => { const k = ns + c; if (!cppCls.has(k)) cppCls.set(k, { ns: ns.replace(/::$/, ''), c, ms: new Map() }); return cppCls.get(k); };
    const present0 = gitFiles('*.h').concat(gitFiles('*.hpp')).map((f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
    for (const m of src.matchAll(/(?<![\w:<])((?:[a-z_]\w*::)*)([A-Z]\w*)\s+(\w+)\s*(?:\([^;]*\)|\{[^;]*\})?\s*;/g)) {
      if (/^std::/.test(m[1]) || /^(?:return|delete|new|throw|case)$/.test(m[2]) || new RegExp(`\\b(?:class|struct)\\s+${m[2]}\\b`).test(present0)) continue;
      get(m[1], m[2]);
      cppVars.add(m[3]);
      const mine = [...src.matchAll(new RegExp(`(?<![\\w.>])${m[3]}\\s*\\.\\s*(\\w+)\\s*\\(`, 'g'))];
      for (const u of mine) { const c = callInfo(src.replace(new RegExp(`(?<![\\w.>])${m[3]}\\s*\\.\\s*`, 'g'), ''), u[1]); get(m[1], m[2]).ms.set(u[1], { ret: lit[c.ret] ?? 'int', st: false }); }
    }
    for (const m of src.matchAll(/(?<![\w:<])((?:[a-z_]\w*::)*)([A-Z]\w*)::([a-z_]\w*)\s*\(/g)) {
      if (!cppCls.has(m[1] + m[2])) continue;
      const o = get(m[1], m[2]);
      if (!o.ms.has(m[3])) o.ms.set(m[3], { ret: new RegExp(`\\b${m[2]}\\s+\\w+\\s*=\\s*(?:[\\w:]*::)?${m[2]}::${m[3]}\\s*\\(`).test(src) ? m[2] : 'int', st: true });
    }
  }
  const cppBody = [...cppCls.values()].map((o) => `${o.ns ? `namespace ${o.ns.replace(/::/g, ' { namespace ')} {\n` : ''}class ${o.c} {\npublic:\n    ${o.c}() = default;\n    ${o.c}(const ${o.c}&) = default;\n    template <class A0, class... A>\n    explicit ${o.c}(A0&&, A&&...) {}\n${[...o.ms].map(([k, v]) => `    template <class... A>\n    ${v.st ? 'static ' : ''}${v.ret} ${k}(A&&...) { throw std::logic_error("not implemented: ${o.c}::${k}"); }\n`).join('')}};\n${o.ns ? '}'.repeat(o.ns.split('::').length) + '\n' : ''}`).join('\n');
  const names = [...new Set([...out.matchAll(/implicit declaration of function '(\w+)'|'(\w+)' was not declared in this scope|use of undeclared identifier '(\w+)'|call to undeclared function '(\w+)'/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]))].filter((n) => !declared(n) && !cppVars.has(n) && new RegExp(`(?<![\\w.>])${n}\\s*\\(`).test(src));
  const T = { int: 'int', float: 'double', str: 'const char *', bool: 'int' };
  // `arena_t *a = ...; f(a)` => the parameter is `arena_t *` (#87)
  const declaredPtr = (expr) => { const v = /^&?([A-Za-z_]\w*)$/.exec(expr ?? '')?.[1]; const m = v && new RegExp(`\\b((?:const\\s+)?(?:struct\\s+)?[A-Za-z_]\\w*)\\s*(\\*+)\\s*${v}\\b`).exec(src); return m && !/^(return|else|sizeof)$/.test(m[1]) ? `${m[1]} ${m[2]}` : null; };
  // unknown `foo_t` types become opaque structs so pointer use compiles
  const SYS = /^(size_t|ssize_t|ptrdiff_t|intptr_t|uintptr_t|u?int\d+_t|u?intmax_t|time_t|clock_t|off_t|wchar_t|FILE|va_list|bool|sig_atomic_t|pid_t|mode_t|jmp_buf|div_t|fpos_t|pthread_\w+)$/;
  const opaque = [...new Set([...src.matchAll(/\b([a-z_][a-z0-9_]*_t)\b/g)].map((m) => m[1]))].filter((t) => !SYS.test(t) && !new RegExp(`\\b${t}\\b`).test(present) && !new RegExp(`typedef[^;{]*\\b${t}\\b|\\b(?:struct|enum|union)\\s+\\w*\\s*\\{[^}]*\\}\\s*${t}\\b`).test(src));
  // an opaque type whose fields the test reads (`e->vlen`, `v.x`) needs a complete struct (#130)
  const fieldsOf = (t) => { const vs = [...src.matchAll(new RegExp(`\\b${t}\\s*(\\*+\\s*)?(\\w+)\\s*[=;,)\\[]`, 'g'))].map((m) => [m[2], !!m[1]]); return [...new Set(vs.flatMap(([v, ptr]) => [...src.matchAll(new RegExp(`(?<![\\w.>])${v}\\s*${ptr ? '->' : '\\.'}\\s*(\\w+)`, 'g'))].map((m) => m[1])))]; };
  const body0 = opaque.map((t) => { const fs2 = fieldsOf(t); return fs2.length ? `typedef struct ${t.replace(/_t$/, '')} {\n${fs2.map((f) => `    long ${f};\n`).join('')}} ${t};\n` : `typedef struct ${t.replace(/_t$/, '')} ${t};\n`; }).join('') + (opaque.length ? '\n' : '');
  const SCALAR = /^(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:int|long|short|char|float|double|size_t|ssize_t|u?int\d+_t|\w+_t)$/;
  // pointer/array/scalar argument types from casts, `&x`, declarations and arrays (#130)
  const argType = (raw, t) => {
    if (T[t]) return T[t];
    const r = (raw ?? '').trim();
    const cast = /^\(\s*((?:const\s+)?(?:struct\s+)?[A-Za-z_]\w*(?:\s*\*)*)\s*\)\s*[\w&"(*-]/.exec(r)?.[1];
    if (cast) return cast.replace(/\s*\*/g, ' *').replace(/\s+/g, ' ').replace(/ \*( \*)/g, ' *$1');
    const addr = /^&\s*(\w+)/.exec(r)?.[1];
    if (addr) { const d = new RegExp(`\\b((?:const\\s+)?(?:struct\\s+)?[A-Za-z_]\\w*)\\s+${addr}\\b\\s*[=;,\\[]`).exec(src)?.[1]; return d && !/^(return|else)$/.test(d) ? `${d} *` : 'void *'; }
    const v = /^[A-Za-z_]\w*$/.exec(r)?.[0];
    if (v) {
      const arr = new RegExp(`\\b((?:const\\s+)?[A-Za-z_]\\w*)\\s+${v}\\s*\\[`).exec(src)?.[1];
      if (arr && !/^(return|else)$/.test(arr)) return `${arr} *`;
      const sc = new RegExp(`\\b((?:const\\s+)?(?:unsigned\\s+)?[A-Za-z_]\\w*)\\s+${v}\\s*[=;,)]`).exec(src)?.[1];
      if (sc && SCALAR.test(sc)) return sc;
    }
    return declaredPtr(raw);
  };
  const body = body0 + (cppBody ? cppBody + '\n' : '') + names.map((n) => {
    const c = callInfo(src, n), pt = new RegExp(`\\b((?:const\\s+)?(?:struct\\s+)?[A-Za-z_]\\w*)\\s*\\*\\s*\\w+\\s*=\\s*${n}\\s*\\(`).exec(src)?.[1], r = pt && !cpp ? (opaque.includes(pt) ? `${pt} *` : 'void *') : T[c.ret] ?? 'int';
    if (cpp) return `template <class... A>\ninline ${r} ${n}(A&&...) {\n    throw std::logic_error("not implemented: ${n}");\n}\n`;
    const ps = c.args.map((t, i) => `${t === 'ptr' ? 'void *' : argType(c.raws?.[i], t) ?? 'int'} a${i}`).join(', ') || 'void';
    const unused = c.args.map((_, i) => `    (void)a${i};\n`).join('');
    return `static inline ${r} ${n}(${ps}) {\n${unused}    fprintf(stderr, "not implemented: ${n}\\n");\n    abort();\n}\n`;
  }).join('\n');
  const head = cpp ? '#pragma once\n#include <stdexcept>\n#include <string>\n\n' : '#pragma once\n#include <stdio.h>\n#include <stdlib.h>\n\n';
  // a missing header belongs next to the production code (include/ or src/), not in tests/ where it would shadow it (#76)
  const home = ['include', 'src'].map((d) => path.join(ROOT, d)).find((d) => fs.existsSync(d) && !path.resolve(dir).startsWith(d));
  for (const h of missing) { fs.rmSync(path.resolve(dir, h)); add(home ? path.join(home, h) : path.resolve(dir, h), head + body); }
  return Object.assign(made, verified());
}

// php / julia / R: stub the file the test loads (require/include/source) with throwing functions for the unknown calls
function stubScript(lang, src, dir, add, made) {
  const loadRe = { php: /(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+\.php)['"]/g, jl: /\binclude\(\s*"([^"]+\.jl)"/g, r: /\bsource\(\s*"([^"]+\.[Rr])"/g }[lang];
  const code = src.split('\n').filter((l) => !/^\s*(#|\/\/|\*|\/\*)/.test(l)).join('\n');
  const defined = new Set([...code.matchAll(/\bfunction\s+&?([A-Za-z_]\w*!?)|^\s*([A-Za-z_]\w*)\s*<-\s*function|^\s*([A-Za-z_]\w*!?)\(.*\)\s*=(?!=)/gm)].map((m) => m[1] ?? m[2] ?? m[3]));
  // names the test defines itself (`const f(x) = ..`, `f = x -> ..`, `f, g = pair`, structs) and names already provided by included files that exist are never stubbed (#131)
  if (lang === 'jl') {
    for (const m of code.matchAll(/^\s*(?:const\s+|local\s+|global\s+)?(?:mutable\s+)?struct\s+(\w+)|^\s*(?:const\s+|local\s+|global\s+)(\w+)\s*\(/gm)) defined.add(m[1] ?? m[2]);
    for (const m of code.matchAll(/^\s*(?:(?:const|local|global)\s+)?([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=(?![=>])/gm)) m[1].split(',').forEach((x) => defined.add(x.trim()));
  }
  const existingLoads = [...src.matchAll(loadRe)].map((m) => path.resolve(dir, m[1].replace(/^\/+/, ''))).filter((abs) => fs.existsSync(abs));
  for (const abs of existingLoads) { const t = fs.readFileSync(abs, 'utf8'); for (const m of t.matchAll(/\bfunction\s+&?([A-Za-z_]\w*!?)|^\s*([A-Za-z_]\w*!?)\s*(?:<-\s*function|\(.*\)\s*=(?!=))|\b(?:struct|macro|abstract\s+type)\s+(\w+)/gm)) defined.add(m[1] ?? m[2] ?? m[3]); }
  // Julia mutating functions end in `!` (`next!(r)`) (#151)
  const called = [...new Set([...code.matchAll(/(?<![\w$@.>:\\])([A-Za-z_]\w*(?:!(?=\())?)\s*\(/g)].map((m) => m[1]))].filter((n) => !defined.has(n) && !/^(function|if|for|while|switch|catch|elseif|foreach|array|isset|empty|use|using|test_that|testset|require|require_once|include|include_once|source|library|describe|it|context|fn|match|list|new|echo|print|return|exit|die|unset|isset|empty|eval|declare|static|function|assert|try|throw)$/.test(n) && !/^(expect_|test|assert)/.test(n));
  // exception types the Julia test expects: `@test_throws X` => `struct X <: Exception end`
  const excNames = lang === 'jl' ? [...new Set([...code.matchAll(/@test_throws\s+(?:\w+\.)?([A-Z]\w*)/g)].map((m) => m[1]))].filter((n) => !defined.has(n)) : [];
  const probe = { php: ['php', ['-r', 'foreach (array_slice($argv, 1) as $n) if (!function_exists($n)) echo $n, "\n";', '--', ...called]], jl: ['julia', ['-e', 'for n in ARGS; isdefined(Base, Symbol(n)) || println(n); end', ...called, ...excNames]], r: ['Rscript', ['-e', 'for (n in commandArgs(TRUE)) if (!exists(n)) cat(n, "\n", sep = "")', ...called]] }[lang];
  let unknown = [...called, ...excNames];
  if (unknown.length) { const r = spawnSync(probe[0], probe[1], { encoding: 'utf8', timeout: 60000 }); if (r.status === 0) unknown = r.stdout.split('\n').filter(Boolean); }
  const fn = { php: (n) => `if (!function_exists('${n}')) {\n    function ${n}(...$args) {\n        throw new \\LogicException('not implemented: ${n}');\n    }\n}\n`, jl: (n) => `${n}(args...; kwargs...) = error("not implemented: ${n}")\n`, r: (n) => `${n} <- function(...) stop("not implemented: ${n}")\n` }[lang];
  // PHP classes used as Class::method( / new Class( get a class with throwing static methods (#87)
  const phpClasses = new Map();
  const exc = new Set();
  let psrDone = false;
  // instance methods called on `$v = new C(..)`, `$this->v = new C(..)` and `(new C(..))->m()` receivers (#131)
  const phpInst = (c) => {
    const ms = new Set();
    for (const m of code.matchAll(new RegExp(`(\\$this\\s*->\\s*\\w+|\\$\\w+)\\s*=\\s*new\\s+\\\\?${c}\\b`, 'g'))) for (const k of code.matchAll(new RegExp(`${m[1].replace(/\$/g, '\\$').replace(/\s*->\s*/, '\\s*->\\s*')}\\s*->\\s*(\\w+)\\s*\\(`, 'g'))) ms.add(k[1]);
    for (const k of code.matchAll(new RegExp(`new\\s+\\\\?${c}\\s*\\([^()]*\\)\\s*\\)?\\s*->\\s*(\\w+)\\s*\\(`, 'g'))) ms.add(k[1]);
    return [...ms].filter((k) => !/^(assert\w*|expect\w*|__\w+)$/.test(k));
  };
  const phpConsts = new Map(), phpEnums = new Set();
  const classBody = (c, ms) => phpEnums.has(c) ? `enum ${c}: string\n{\n${[...[...(phpConsts.get(c) ?? [])].map((k) => `    case ${k} = '${k}';\n`), ...[...ms].map((n) => `\n    public static function ${n}(...$args)\n    {\n        throw new \\LogicException('not implemented: ${c}::${n}');\n    }\n`)].join('')}}\n` : exc.has(c) ? `class ${c} extends \\Exception\n{\n}\n` : `class ${c}\n{\n${[...[...(phpConsts.get(c) ?? [])].map((k) => `    public const ${k} = '${k}';\n`), ...[...ms].map((n) => `    public static function ${n}(...$args)\n    {\n        throw new \\LogicException('not implemented: ${c}::${n}');\n    }\n`), ...phpInst(c).filter((n) => !ms.has(n)).map((n) => `    public function ${n}(...$args)\n    {\n        throw new \\LogicException('not implemented: ${c}->${n}');\n    }\n`)].join('\n')}}\n`;
  if (lang === 'php') {
    for (const m of code.matchAll(/(?<![\w$\\])([A-Z]\w*)::([A-Za-z_]\w*)\s*\(/g)) phpClasses.set(m[1], new Set([...(phpClasses.get(m[1]) ?? []), m[2]]));
    for (const m of code.matchAll(/\bnew\s+([A-Z]\w*)/g)) if (!phpClasses.has(m[1])) phpClasses.set(m[1], new Set());
    // `Cls::CONST` / `Enum::CASE->value` reference a class too: constants become `const`s, enum-style use (`->value`/`->name`) an enum (#150)
    for (const m of code.matchAll(/(?<![\w$\\])([A-Z]\w*)::([A-Za-z_]\w*)\b(?!\s*\()(\s*->\s*(?:value|name)\b)?/g)) {
      if (m[2] === 'class' || !(m[3] || /^[A-Z][A-Z0-9_]*$/.test(m[2]))) continue;
      if (!phpClasses.has(m[1])) phpClasses.set(m[1], new Set());
      phpConsts.set(m[1], new Set([...(phpConsts.get(m[1]) ?? []), m[2]]));
      if (m[3]) phpEnums.add(m[1]);
    }
    for (const c of [...phpClasses.keys()]) if (new RegExp(`\\b(?:class|interface|enum)\\s+${c}\\b`).test(code) || /^(self|static|parent|DateTime\w*|Exception|\w*Exception|Closure|ArrayObject|ArrayIterator|stdClass|Throwable|Error|Generator|SplStack|SplQueue|SplObjectStorage|JsonException|DateInterval|DateTimeZone)$/.test(c)) phpClasses.delete(c);
    for (const m of code.matchAll(/expectException\(\s*\\?([A-Z]\w*)::class/g)) { exc.add(m[1]); if (!phpClasses.has(m[1])) phpClasses.set(m[1], new Set()); }
    // `catch (X $e)` / `throw new X` / `class Y extends X`: X is an exception (#131)
    for (const m of code.matchAll(/\bcatch\s*\(\s*([\\\w|\s]+?)\s*\$/g)) for (const x of m[1].split('|')) { const n = x.trim().replace(/^\\/, ''); if (/^[A-Z]\w*$/.test(n)) { exc.add(n); if (!phpClasses.has(n)) phpClasses.set(n, new Set()); } }
    for (const m of code.matchAll(/\bthrow\s+new\s+\\?([A-Z]\w*)/g)) { exc.add(m[1]); if (!phpClasses.has(m[1])) phpClasses.set(m[1], new Set()); }
    // classes already defined in the project, or built into PHP, are never stubbed (#95)
    const projFq = phpProjectFqcns();
    // `use Ns\Cls;` binds the short name to a FQCN: a same-named class in another namespace is not this one (#150)
    const imported = new Map([...code.matchAll(/^\s*use\s+([A-Za-z_][\w\\]*\\[A-Za-z_]\w*)(?:\s+as\s+(\w+))?\s*;/gm)].map((m) => [m[2] ?? m[1].split('\\').pop(), m[1]]));
    const names = [...phpClasses.keys()];
    const bi = names.length ? spawnSync('php', ['-r', 'foreach (array_slice($argv, 1) as $n) if (class_exists($n, false) || interface_exists($n, false)) echo $n, "\n";', '--', ...names], { encoding: 'utf8' }) : null;
    const builtin = new Set(bi?.status === 0 ? bi.stdout.split('\n').filter(Boolean) : []);
    for (const c of names) if (imported.has(c) ? projFq.has(imported.get(c)) : builtin.has(c) || [...projFq].some((x) => x === c || x.endsWith('\\' + c))) phpClasses.delete(c);
    unknown = unknown.filter((n) => !phpClasses.has(n) && !new RegExp(`\\bnew\\s+${n}\\b`).test(code));
    // `use Ns\\Cls;` classes become PSR-4 files (composer.json autoload mapping, else first namespace segment => src/) with a `namespace` line (#117)
    const psr4 = [];
    try { const cj = JSON.parse(fs.readFileSync(path.join(ROOT, 'composer.json'), 'utf8')); for (const sec of [cj.autoload, cj['autoload-dev']]) for (const [k, v] of Object.entries(sec?.['psr-4'] ?? {})) psr4.push([k, [].concat(v)[0]]); } catch {}
    psr4.sort((a, b) => b[0].length - a[0].length);
    for (const m of code.matchAll(/^\s*use\s+([A-Za-z_][\w\\]*\\)([A-Za-z_]\w*)\s*;/gm)) {
      const ns = m[1].replace(/\\$/, ''), cls = m[2];
      if (!phpClasses.has(cls) || /^(PHPUnit|Mockery|Prophecy|Pest)\\/.test(ns + '\\')) continue;
      // vendor / already autoloadable classes are never stubbed (#131)
      if (fs.existsSync(path.join(ROOT, 'vendor/autoload.php')) && spawnSync('php', ['-r', 'require "vendor/autoload.php"; exit(class_exists($argv[1]) || interface_exists($argv[1]) || trait_exists($argv[1]) ? 0 : 1);', '--', `${ns}\\${cls}`], { cwd: ROOT, stdio: 'ignore' }).status === 0) { phpClasses.delete(cls); continue; }
      if (projFq.has(`${ns}\\${cls}`)) continue;
      const hit = psr4.find(([k]) => (ns + '\\').startsWith(k));
      const rest = hit ? (ns + '\\').slice(hit[0].length).split('\\').filter(Boolean) : ns.split('\\').slice(1);
      const fileAbs = path.join(ROOT, hit ? hit[1] : 'src', ...rest, cls + '.php');
      add(fileAbs, `<?php\n\nnamespace ${ns};\n\n${classBody(cls, phpClasses.get(cls) ?? new Set())}`);
      phpClasses.delete(cls);
      psrDone = true;
    }
  }
  const loads = [...src.matchAll(loadRe)].map((m) => path.resolve(dir, m[1].replace(/^\/+/, ''))).filter((abs) => !fs.existsSync(abs));
  const used = new Set();
  for (const abs of loads) {
    const stem = path.basename(abs).replace(/\.php$/, '');
    const mine = lang === 'php' ? [...phpClasses].filter(([c]) => c.toLowerCase() === stem.toLowerCase() || (loads[0] === abs && !loads.some((o) => path.basename(o, '.php').toLowerCase() === c.toLowerCase()))).filter(([c]) => !used.has(c)) : [];
    mine.forEach(([c]) => used.add(c));
    const fns = abs === loads[0] ? unknown.filter((n) => !excNames.includes(n)).map(fn) : [];
    if (lang === 'jl') {
      // `using .Mod` / `import .Mod` needs the included file to define `module Mod` exporting the stubs (#131)
      const usingNames = [...code.matchAll(/^\s*(?:using|import)\s+\.+(\w+)/gm)].map((m) => m[1]);
      const stemOf = (f) => path.basename(f).replace(/\.jl$/, '').toLowerCase();
      const others = new Set([...src.matchAll(loadRe)].map((m) => stemOf(m[1])).filter((s) => s !== stemOf(abs)));
      // the module of a missing include: the `using .X` named like the file, else the Nth `using` that no other include claims (#151)
      const mod = usingNames.find((u) => u.toLowerCase() === stemOf(abs)) ?? usingNames.filter((u) => !others.has(u.toLowerCase()))[Math.max(0, loads.indexOf(abs))];
      const excs = abs === loads[0] ? excNames.filter((n) => unknown.includes(n)).map((n) => `struct ${n} <: Exception end\n`) : [];
      const exp = [...unknown.filter((n) => abs === loads[0] && !excNames.includes(n)), ...excNames.filter((n) => abs === loads[0] && unknown.includes(n))];
      add(abs, mod ? `module ${mod}\n\n${exp.length ? `export ${exp.join(', ')}\n\n` : ''}${[...excs, ...fns].join('\n')}\nend # module ${mod}\n` : [...excs, ...fns].join('\n'));
      continue;
    }
    add(abs, (lang === 'php' ? '<?php\n\n' : '') + [...mine.map(([c, ms]) => classBody(c, ms)), ...fns].join('\n'));
  }
  // every include already exists: missing names are appended to a stub-only module (inside its `module`, exported), real code is never edited (#151)
  if (lang === 'jl' && !loads.length && existingLoads.length && (unknown.length)) {
    const stubOnly = existingLoads.filter((f) => { const t = fs.readFileSync(f, 'utf8'); return /not implemented/.test(t) && !t.split('\n').some((l) => /^\s*(?:function\s|[A-Za-z_]\w*!?\(.*\)\s*=(?!=))/.test(l) && !/not implemented/.test(l)); });
    const target = stubOnly[0];
    if (target) {
      let t = fs.readFileSync(target, 'utf8');
      const names = unknown.filter((n) => !excNames.includes(n)), excs = unknown.filter((n) => excNames.includes(n));
      const body = [...excs.map((n) => `struct ${n} <: Exception end\n`), ...names.map(fn)].join('\n');
      const mm = /^module\s+(\w+)\s*\n/m.exec(t);
      if (mm) {
        t = t.replace(/^(?:end\s*(?:#[^\n]*)?\s*)$(?![\s\S]*^end\b)/m, (e) => `${body}\n${e}`);
        const ex = /^export\s+([^\n]*)$/m.exec(t);
        t = ex ? t.replace(ex[0], `${ex[0]}, ${unknown.join(', ')}`) : t.replace(mm[0], `${mm[0]}\nexport ${unknown.join(', ')}\n`);
      } else t += (t.endsWith('\n') ? '\n' : '\n\n') + body;
      fs.writeFileSync(target, t); made.push(rel(target));
    } else if (existingLoads.length) (made.realMissing ??= []).push(`${unknown.join(', ')} in ${existingLoads.map(rel).join(', ')}`);
  }
  return made;
}

// methods the test calls on instances of a stubbed class: `new C().m(`, `C().m(`, `v = new C(); v.m(` (#97)
function methodsOf(src, cls, strict = false) {
  // `new Foo<T>(..)` is `new Foo(..)` (#151)
  src = src.replace(/\b(new\s+[\w$]+)\s*<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>\s*\(/g, '$1(');
  const out = new Set();
  const skip = /^(assert\w*|then|catch|toString|valueOf|constructor|call|apply|bind)$/;
  for (const m of src.matchAll(new RegExp(`(?:new\\s+)?\\b${cls}\\s*\\([^()]*\\)\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) out.add(m[1]);
  const directCtor = (text, start) => {
    let depth = 1, i = start, quote = '';
    for (; i < text.length && depth; i++) {
      const c = text[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
      else if (/['"`]/.test(c)) quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    return depth === 0 && !/^\s*\)*\s*(?:\?\.|\.|\[)/.test(text.slice(i));
  };
  const vars = [...src.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*(?::[^=\\n]+)?=\\s*(?:await\\s+)?(?:new\\s+)?${cls}\\s*\\(`, 'g'))].filter((m) => directCtor(src, m.index + m[0].length)).map((m) => m[1]);
  // objects built inside a helper (`const { s } = setup()`, `c, j = setup()`, `setup().s.m(`): methods called on whatever the helper returns (#112)
  const lines = src.split('\n');
  const DEF = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|def\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\()/;
  const defs = lines.map((l, i) => ({ i, n: DEF.exec(l) })).filter((d) => d.n).map((d) => ({ i: d.i, name: d.n[1] ?? d.n[2] ?? d.n[3] }));
  // strict (existing real classes): a helper counts only when it returns `new Cls(..)` itself, and its body ends at the next test block
  const retRe = new RegExp(`(?:=>|\\breturn)\\s*[\\[({\\s]*(?:[\\w$]+\\s*:\\s*)?(?:await\\s+)?new\\s+${cls}\\b`);
  const ret = { test: (l) => retRe.test(l) && [...l.matchAll(new RegExp(`\\bnew\\s+${cls}\\s*\\(`, 'g'))].some((m) => directCtor(l, m.index + m[0].length)) && ![...l.matchAll(/\bnew\s+([\w$]+)/g)].some((x) => x[1] !== cls) };
  const bodyEnd = (k) => { let e = k + 1 < defs.length ? defs[k + 1].i : lines.length; for (let j = defs[k].i + 1; j < e; j++) if (/^\s*(?:\/\*\*|\/\/\s*@id|(?:test|it|describe)\s*[(.])/.test(lines[j])) { e = j; break; } return e; };
  const helpers = defs.filter((d, k) => lines.slice(d.i, bodyEnd(k)).some((l) => strict ? ret.test(l) : [...l.matchAll(new RegExp(`\\b${cls}\\s*\\(`, 'g'))].some((m) => directCtor(l, m.index + m[0].length)))).map((d) => d.name).filter((n) => !/^test/i.test(n));
  for (const h of helpers) {
    // `return Eng(log), log` + `eng, log = make()`: only the tuple slot that holds the class instance is the SUT variable (#131)
    let sutIdx = -1, slots = 0, sutKeys = null;
    const hd = defs.find((d) => d.name === h);
    if (hd) {
      const di = defs.indexOf(hd), hl = lines.slice(hd.i, di + 1 < defs.length ? defs[di + 1].i : lines.length);
      // `return { b: new Box(..), out }` + `const { b, out } = mk()`: only the keys holding the class instance are SUT variables (#151)
      const ho = /(?:\breturn|=>)\s*\(?\s*\{/.exec(hl.join('\n'));
      if (ho) {
        const t = hl.join('\n').slice(ho.index + ho[0].length);
        const ents = []; let depth = 1, cur = '';
        for (const ch of t) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) { depth--; if (!depth) break; } if (ch === ',' && depth === 1) { ents.push(cur.trim()); cur = ''; } else cur += ch; }
        if (cur.trim()) ents.push(cur.trim());
        const ctorVars = new Set([...hl.join('\n').matchAll(new RegExp(`\\b([\\w$]+)\\s*(?::[^=\\n]+)?=\\s*(?:await\\s+)?(?:new\\s+)?${cls}\\s*\\(`, 'g'))].map((x) => x[1]));
        const keys = ents.map((e) => { const kv = /^([\w$]+)\s*:\s*([\s\S]*)$/.exec(e); return kv ? { k: kv[1], v: kv[2] } : /^[\w$]+$/.test(e) ? { k: e, v: e } : null; }).filter(Boolean);
        if (keys.length > 1) sutKeys = keys.filter((x) => new RegExp(`\\b${cls}\\s*\\(`).test(x.v) || ctorVars.has(x.v)).map((x) => x.k);
      }
      const ret = hl.map((l) => /^\s*return\s+(.+?)\s*;?\s*$/.exec(l)?.[1]).filter(Boolean).pop();
      if (ret && !ret.startsWith('{')) {
        const els = []; let depth = 0, cur = '';
        for (const ch of ret.replace(/^[\[(]/, '').replace(/[\])]$/, '')) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; if (ch === ',' && !depth) { els.push(cur.trim()); cur = ''; } else cur += ch; }
        els.push(cur.trim());
        const ctorVars = new Set([...hl.join('\n').matchAll(new RegExp(`\\b([\\w$]+)\\s*(?::[^=\\n]+)?=\\s*(?:await\\s+)?(?:new\\s+)?${cls}\\s*\\(`, 'g'))].map((x) => x[1]));
        sutIdx = els.length > 1 ? els.findIndex((e) => new RegExp(`\\b${cls}\\s*\\(`).test(e) || ctorVars.has(e)) : -1;
        slots = els.length;
        // the helper returns an instance of a different class: its methods are not this class's (#147)
        if (els.length === 1) { const e = els[0], hs = hl.join('\n'); const c = /^([A-Z][\w$]*)\s*\(/.exec(e)?.[1] ?? (/^[\w$]+$/.test(e) ? new RegExp(`\\b${e}\\s*(?::[^=\\n]+)?=\\s*(?:await\\s+)?(?:new\\s+)?([A-Z][\\w$]*)\\s*\\(`).exec(hs)?.[1] : undefined); if (c && c !== cls) continue; }
      }
    }
    for (const m of src.matchAll(new RegExp(`\\b${h}\\s*\\([^()]*\\)\\s*(?:\\.\\s*[A-Za-z_$][\\w$]*\\s*)?\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) out.add(m[1]);
    for (const m of src.matchAll(new RegExp(`^\\s*(?:(?:const|let|var)\\s+)?[\\[{(]?\\s*([\\w$]+(?:\\s*[,:]\\s*[\\w$]+)*)\\s*[\\]})]?\\s*(?::[^=\\n]+)?=\\s*(?:await\\s+)?${h}\\s*\\(`, 'gm'))) { const lhs = m[0].split('=')[0]; if (sutKeys?.length && /\{/.test(lhs)) { for (const e of lhs.replace(/^[^{]*\{/, '').replace(/\}[^}]*$/, '').split(',')) { const kv = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?\s*$/.exec(e); if (kv && sutKeys.includes(kv[1])) vars.push(kv[2] ?? kv[1]); } continue; } const names = m[1].split(/\s*[,:]\s*/).filter((x) => x && x !== '_'); vars.push(...(sutIdx >= 0 && names.length === slots && !/[{:]/.test(lhs) ? [names[sutIdx]] : names)); }
  }
  // a variable rebound to another class (`s = Counter()` ... `s = Sub()`) belongs to the class of its latest preceding construction (#147)
  for (const v of new Set(vars)) {
    const ve = v.replace(/\$/g, '\\$');
    const binds = [...src.matchAll(new RegExp(`(?<![\\w$.])${ve}\\s*(?::[^=\\n]+)?=(?!=)\\s*(?:await\\s+)?(?:new\\s+)?([A-Z][\\w$]*)\\s*\\(`, 'g'))].map((x) => ({ at: x.index, c: x[1] }));
    for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${ve}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) {
      const prev = binds.filter((b) => b.at < m.index).pop();
      if (!prev || prev.c === cls) out.add(m[1]);
    }
  }
  return [...out].filter((n) => !skip.test(n));
}

// C#: `dotnet build` diagnostics (CS0246/CS0103/CS0234/CS0117/CS1061) in the requested test are the source of truth; throwing stubs are added until nothing in scope fails to compile (#136)
const CS_MARK = '// sdd-stub: throwing stub generated by `tdd stub` — replace with the real implementation';
function stubCs(testPath, src, id, made) {
  const abs = path.resolve(ROOT, testPath);
  const g = dotnetGraph(ROOT);
  const testProj = g?.ownersOf(testPath)?.[0];
  if (!g || !testProj) return made;
  if (spawnSync('dotnet', ['--version'], { stdio: 'ignore' }).status !== 0) { (made.notes ??= []).push('dotnet SDK not found: nothing was generated or compile-checked'); return made; }
  const lines = src.split('\n');
  const ids = lines.map((l, i) => (/@id\s/.test(l) ? i : -1)).filter((i) => i >= 0);
  const start = ids.find((i) => new RegExp(`@id\\s+${id}\\b`).test(lines[i])) ?? -1;
  const first = ids[0] ?? lines.length;
  const next = ids.find((i) => i > start) ?? lines.length;
  const inScope = (i) => start < 0 || i < first || (i >= start && i < next);
  const text = start < 0 ? src : lines.filter((_, i) => inScope(i)).join('\n');
  const ENV2 = { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', VSLANG: '1033', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };
  const build = () => {
    const r = spawnSync('dotnet', ['build', path.join(ROOT, testProj.file), '--nologo', '-v', 'q', '-clp:NoSummary'], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64e6, env: ENV2 });
    const outp = (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? String(r.error.message) : '');
    const diags = new Map();
    for (const m of outp.matchAll(/^(.+?)\((\d+),(\d+)(?:,\d+,\d+)?\):\s+error\s+([A-Z]+\d+):\s*(.*?)(?:\s+\[[^\]]+\])?\s*$/gm)) {
      const d = { file: rel(path.resolve(ROOT, m[1])), line: +m[2], col: +m[3], code: m[4], msg: m[5] };
      diags.set(`${d.file}:${d.line}:${d.col}:${d.code}`, d);
    }
    const infra = /error (NU\d+|NETSDK\d+)|Unable to load the service index|could not be resolved|dotnet: command not found/i.test(outp);
    return { ok: r.status === 0, diags: [...diags.values()], infra, raw: outp };
  };
  const q = (m) => [...m.matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const usingNs = (l) => /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/.exec(l)?.[1];
  const ownNs = /^\s*namespace\s+([\w.]+)/m.exec(src)?.[1];
  const usings = [...src.matchAll(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm)].map((m) => m[1]);
  const refProjs = [...g.deps(testProj.file)].filter((f) => f !== testProj.file).map((f) => g.projs.get(f)).filter((p) => !p.test);
  const pname = (p) => path.posix.basename(p.file).replace(/\.\w+proj$/, '');
  const ours = new Set();
  const typeFile = new Map();
  const findType = (n) => {
    if (typeFile.has(n)) return typeFile.get(n);
    for (const f of gitFiles('*.cs')) { try { const c = fs.readFileSync(path.join(ROOT, f), 'utf8'); if (new RegExp(`\\b(?:class|record|struct|interface|enum)\\s+${n}\\b`).test(c)) { const r = { file: f, marked: c.includes(CS_MARK) }; typeFile.set(n, r); return r; } } catch {}
    }
    return null;
  };
  const esc = (n) => n.replace(/[$]/g, '\\$&');
  const FACTORY = /^(Of|Create|From\w*|Parse|TryParse|New\w*|Zero|One|Empty|Default|Make\w*|Unit)$/;
  const lit = (a) => { a = a.trim(); return /^-?\d+$/.test(a) ? 'int' : /^-?\d*\.\d+m$|^-?\d+m$/i.test(a) ? 'decimal' : /^-?\d*\.\d+d?$/.test(a) ? 'double' : /^"(?:[^"\\]|\\.)*"$/.test(a) ? 'string' : /^(true|false)$/.test(a) ? 'bool' : 'dynamic'; };
  const callArgs = (t, n) => { const m = new RegExp(`\\bnew\\s+${esc(n)}\\s*\\(`).exec(t); if (!m) return null; let d = 1, k = m.index + m[0].length, cur = '', parts = []; for (; k < t.length && d; k++) { const ch = t[k]; if (ch === '(' || ch === '[' || ch === '{') d++; else if (ch === ')' || ch === ']' || ch === '}') { d--; if (!d) break; } if (ch === ',' && d === 1) { parts.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) parts.push(cur); return parts; };
  const thr = (n) => `throw new System.NotImplementedException("${n}")`;
  const memberOf = (T, kind, name, o) => {
    const ret = o.ret ?? (/Async$/.test(name) ? 'System.Threading.Tasks.Task<dynamic>' : 'dynamic');
    if (kind === 'interface') return o.method ? `    ${ret} ${name}(params dynamic[] _args);` : `    ${ret} ${name} { get; set; }`;
    if (o.method) return `    public ${o.stat ? 'static ' : ''}${ret} ${name}(params dynamic[] _args) => ${thr(`${T}.${name}`)};`;
    return `    public ${o.stat ? 'static ' : ''}${ret} ${name} ${o.set ? `{ get => ${thr(`${T}.${name}`)}; set { } }` : `=> ${thr(`${T}.${name}`)};`}`;
  };
  const decl = (n, kind, body, extra) => kind === 'enum' ? `public enum ${n}\n{\n${body}\n}\n` : kind === 'exception' ? `public class ${n} : System.Exception\n{\n    public ${n}() { }\n    public ${n}(string message) : base(message) { }\n    public ${n}(string message, System.Exception inner) : base(message, inner) { }\n}\n` : kind === 'record' ? `public record ${n}(${extra});\n` : kind === 'static' ? `public static class ${n}\n{\n${body}\n}\n` : kind === 'interface' ? `public interface ${n}\n{\n${body}\n}\n` : `public class ${n}\n{\n    public ${n}(params dynamic[] _args) { }\n${body}\n}\n`;
  const projFor = (ns, n) => {
    const hit = refProjs.filter((p) => ns && (ns === pname(p) || ns.startsWith(pname(p) + '.'))).sort((a, b) => pname(b).length - pname(a).length)[0];
    if (hit) return hit;
    if (refProjs.length === 1) return refProjs[0];
    const rel1 = refProjs.find((p) => { const l = pname(p).split('.').pop(); return l && (n.includes(l) || l.includes(n)); });
    if (rel1) return rel1;
    (made.notes ??= []).push(`${n}: no referenced project matches namespace ${ns ?? '(none)'} — placed in the test project ${testProj.file}, move it to the project that should own it`);
    return testProj;
  };
  const unresolved = new Set();
  const pickNs = (n, cand) => {
    const l = (s) => s.split('.').pop();
    // a `using` of a parent namespace of a referenced project (`using ParserKit;` + ParserKit.Core), and the namespace that names the test's own project, beat the test's namespace (#150)
    const tpn = pname(testProj);
    const own = tpn.replace(/\.(?:Unit|Integration)?Tests?$/, '');
    const byProj = cand.filter((c) => own === c || own.startsWith(c + '.')).sort((a, b) => b.length - a.length)[0];
    const parentUse = usings.find((u) => refProjs.some((p) => pname(p) === u || pname(p).startsWith(u + '.')));
    return cand.find((c) => n.includes(l(c)) || l(c).includes(n)) ?? byProj ?? cand[0] ?? usings.find((u) => refProjs.some((p) => u === pname(p) || u.startsWith(pname(p) + '.'))) ?? parentUse ?? ownNs?.replace(/\.(?:Unit|Integration)?Tests?$/, '');
  };
  const classify = (n) => {
    if (/Exception$/.test(n) || new RegExp(`(?:Throws|ThrowsAsync|ThrowsException|ThrowsExceptionAsync|Catch)\\s*<\\s*${esc(n)}\\b|catch\\s*\\(\\s*${esc(n)}\\b`).test(text)) return 'exception';
    if (/^I[A-Z]/.test(n)) return 'interface';
    const calls = [...text.matchAll(new RegExp(`(?<![\\w.])${esc(n)}\\.([A-Z]\\w*)\\s*\\(`, 'g'))].map((m) => m[1]);
    const props = [...text.matchAll(new RegExp(`(?<![\\w.])${esc(n)}\\.([A-Z]\\w*)\\b(?!\\s*[(<])`, 'g'))].map((m) => m[1]);
    const inst = new RegExp(`\\bnew\\s+${esc(n)}\\b|\\b${esc(n)}\\??\\s+[A-Za-z_]\\w*\\s*[=;,)(]|<\\s*${esc(n)}\\s*>|:\\s*${esc(n)}\\b|\\b(?:is|as)\\s+${esc(n)}\\b|typeof\\s*\\(\\s*${esc(n)}\\s*\\)`).test(text);
    if (!inst && !calls.length && props.length) return 'enum';
    const named = callArgs(text, n)?.map((a) => /^\s*([A-Za-z_]\w*)\s*:/.exec(a)?.[1]);
    if (named?.length && named.every(Boolean)) return 'record';
    return inst ? 'class' : 'static';
  };
  const statics = (n, kind) => {
    const out = [];
    const seen = new Set();
    for (const m of text.matchAll(new RegExp(`(?<![\\w.])${esc(n)}\\.([A-Z]\\w*)\\s*(\\()?`, 'g'))) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      if (kind === 'enum') { out.push(`    ${m[1]},`); continue; }
      const own = FACTORY.test(m[1]) && kind !== 'static' ? n : undefined;
      out.push(memberOf(n, kind, m[1], { stat: true, method: !!m[2], ret: own }));
    }
    return out.join('\n');
  };
  const createType = (n, nsCand) => {
    const kind = classify(n);
    const ns = pickNs(n, nsCand);
    const proj = projFor(ns, n);
    const extra = kind === 'record' ? callArgs(text, n).map((a) => { const m = /^\s*([A-Za-z_]\w*)\s*:\s*([\s\S]*)$/.exec(a); return `${lit(m[2])} ${m[1][0].toUpperCase() + m[1].slice(1)}`; }).join(', ') : '';
    const body = statics(n, kind === 'record' ? 'class' : kind);
    const file = path.join(ROOT, proj.dir, `${n}.cs`);
    if (fs.existsSync(file)) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${CS_MARK}\n${ns ? `namespace ${ns};\n\n` : ''}${decl(n, kind, body, extra)}`);
    made.push(rel(file)); ours.add(rel(file)); typeFile.set(n, { file: rel(file), marked: true });
    return true;
  };
  const addMember = (n, member, o) => {
    const t = findType(n);
    if (!t) return false;
    const f = path.join(ROOT, t.file);
    let c = fs.readFileSync(f, 'utf8');
    const miss = (s) => { const a = (made.realMissing ??= []); if (!a.includes(s)) a.push(s); return false; };
    if (!c.includes(CS_MARK)) return miss(`${n}.${member} in ${t.file}`);
    if (o.op ? c.includes(member) : new RegExp(`\\b${esc(member)}\\b`).test(c.replace(CS_MARK, ''))) return false;
    // our own exception stubs take members too (`ex.Line`); records stay fixed (#150)
    const kind = /\binterface\s/.test(c) ? 'interface' : /\benum\s/.test(c) ? 'enum' : /\brecord\s/.test(c) ? null : 'class';
    if (!kind) return miss(`${n}.${member} in ${t.file} (record stubs are fixed)`);
    const line = kind === 'enum' ? `    ${member},` : o.op ? `    public static ${n} ${member}(${n} a, ${n} b) => ${thr(`${n}.${member}`)};` : memberOf(n, kind, member, o);
    c = c.replace(/\n}\s*$/, `\n${line}\n}\n`);
    fs.writeFileSync(f, c);
    if (!made.includes(t.file)) made.push(t.file);
    return true;
  };
  let res = build();
  const pre = res.diags.length;
  const handled = new Set();
  for (let round = 0; round < 8 && !res.ok; round++) {
    if (res.infra && !res.diags.some((d) => /^CS/.test(d.code))) { (made.notes ??= []).push(`dotnet build could not run (restore/infra): ${(res.raw.split('\n').find((l) => /error/.test(l)) ?? '').trim().slice(0, 160)} — nothing was compile-checked`); return made; }
    const mine = res.diags.filter((d) => d.file === testPath && inScope(d.line - 1) && /^CS/.test(d.code));
    if (!mine.length) break;
    const cand = [];
    const missingTypes = new Map();
    const members = [];
    for (const d of mine) {
      const l = lines[d.line - 1] ?? '';
      const un = usingNs(l);
      const n = q(d.msg)[0];
      if (un && /^CS(0246|0234|0400)$/.test(d.code)) { unresolved.add(un); if (!cand.includes(un)) cand.push(un); continue; }
      if (d.code === 'CS0246' || d.code === 'CS0103') {
        if (!n || /[<>]/.test(n)) { (made.notes ??= []).push(`${d.code} ${n ?? ''}: not stubbed (generic or unparseable)`); continue; }
        if (/^[A-Z]/.test(n) && (d.code === 'CS0246' || new RegExp(`\\b${esc(n)}\\s*\\.`).test(l.slice(Math.max(0, d.col - 1), d.col + n.length + 1)) || new RegExp(`\\bnew\\s+${esc(n)}\\b|\\b(?:is|as)\\s+${esc(n)}\\b|<\\s*${esc(n)}\\s*>|typeof\\s*\\(\\s*${esc(n)}\\s*\\)`).test(l))) missingTypes.set(n, true);
        else (made.notes ??= []).push(`${d.code} '${n}' in ${testPath}:${d.line}: not stubbed (a local name or helper, not a type)`);
        continue;
      }
      // CS1501 (`No overload for method 'Append' takes 4 arguments`) is what Roslyn reports instead of CS1061 when the name collides with a LINQ extension method: the receiver type is taken from the line (#150)
      if (d.code === 'CS1501') {
        const mname = q(d.msg)[0];
        const at = mname ? l.indexOf(mname, Math.max(0, d.col - 1)) : -1;
        const recv = at > 0 ? /([A-Za-z_]\w*|\))\s*\.\s*$/.exec(l.slice(0, at))?.[1] : undefined;
        let T;
        if (recv === ')') { const mm = [...l.slice(0, at).matchAll(/\bnew\s+([A-Z]\w*)\s*\(/g)].pop(); T = mm?.[1]; }
        else if (recv && /^[A-Z]/.test(recv)) T = recv;
        else if (recv) T = new RegExp(`\\b(?:([A-Z]\\w*)\\s+${esc(recv)}\\s*[=;,)]|${esc(recv)}\\s*=\\s*new\\s+([A-Z]\\w*))`).exec(text)?.slice(1).find(Boolean);
        if (T && findType(T)) members.push({ T, mname, method: true, stat: !!recv && /^[A-Z]/.test(recv) && recv === T });
        else (made.notes ??= []).push(`${d.code} at ${testPath}:${d.line}: ${d.msg.slice(0, 100)} — receiver type unknown, not stubbed`);
        continue;
      }
      if (d.code === 'CS1061' || d.code === 'CS0117') {
        const [T, mname] = q(d.msg);
        const at = l.indexOf(mname, Math.max(0, d.col - 1));
        const after = at >= 0 ? l.slice(at + mname.length) : '';
        members.push({ T, mname, method: /^\s*\(/.test(after), set: /^\s*=[^=]/.test(after), stat: d.code === 'CS0117' });
        continue;
      }
      // Assert.Throws(() => x.M()) with a dynamic M binds to the obsolete Func<Task> overload: such a stub method returns object instead
      if (d.code === 'CS0619') { const lm = /=>\s*(?:[\w.]+\.)?(\w+)\s*\(/.exec(l); if (lm) members.push({ fix: lm[1] }); continue; }
      if (d.code === 'CS0019') {
        const [op, T1] = q(d.msg);
        if (op && T1 && /^[-+*\/%]$/.test(op)) members.push({ T: T1, mname: `operator ${op}`, op: true, stat: true });
        continue;
      }
      (made.notes ??= []).push(`${d.code} at ${testPath}:${d.line}: ${d.msg.slice(0, 100)} — not stubbed`);
    }
    let progress = false;
    const nsAssigned = new Set();
    for (const n of missingTypes.keys()) { if (!findType(n)) { const before = made.length; createType(n, cand); progress ||= made.length > before; } }
    for (const n of missingTypes.keys()) { const t = findType(n); if (t) nsAssigned.add(/^\s*namespace\s+([\w.]+)/m.exec(fs.readFileSync(path.join(ROOT, t.file), 'utf8'))?.[1]); }
    // a `using` of a namespace nothing was placed in still has to resolve
    for (const un of cand) if (!nsAssigned.has(un)) {
      const p = projFor(un, un.split('.').pop());
      const file = path.join(ROOT, p.dir, `Namespace.${un}.cs`);
      if (!fs.existsSync(file)) { fs.writeFileSync(file, `${CS_MARK}\nnamespace ${un};\n\ninternal static class SddNamespaceMarker { }\n`); made.push(rel(file)); ours.add(rel(file)); progress = true; }
    }
    for (const m of members.filter((x) => x.fix)) for (const f of gitFiles('*.cs')) { try { const c = fs.readFileSync(path.join(ROOT, f), 'utf8'); const c2 = c.includes(CS_MARK) ? c.replace(new RegExp(`\\bdynamic(\\s+${esc(m.fix)}\\s*\\()`, 'g'), 'object$1') : c; if (c2 !== c) { fs.writeFileSync(path.join(ROOT, f), c2); progress = true; } } catch {} }
    for (const m of members.filter((x) => !x.fix)) if (addMember(m.T, m.mname, { op: m.op, method: m.method, set: m.set, stat: m.stat, ret: FACTORY.test(m.mname) && m.stat ? m.T : undefined })) progress = true;
    if (!progress) break;
    res = build();
  }
  // a namespace marker is only needed while no type lives in that namespace
  for (const f of [...ours].filter((x) => /(^|\/)Namespace\.[\w.]+\.cs$/.test(x))) {
    const ns = /^namespace\s+([\w.]+);/m.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'))?.[1];
    if ([...ours].some((o) => o !== f && new RegExp(`^namespace\\s+${ns.replace(/\./g, '\\.')};`, 'm').test(fs.readFileSync(path.join(ROOT, o), 'utf8')))) { fs.rmSync(path.join(ROOT, f)); made.splice(made.indexOf(f), 1); ours.delete(f); }
  }
  if (!made.length && res.ok) return made;
  const inS = res.diags.filter((d) => d.file === testPath && inScope(d.line - 1));
  const outS = res.diags.filter((d) => !(d.file === testPath && inScope(d.line - 1)));
  const show = (d) => `${d.file}:${d.line} ${d.code} ${d.msg}`.slice(0, 160);
  if (res.ok) made.verified = 'ok';
  else if (!inS.length && outS.length && !res.infra) { made.verified = 'partial'; made.verifyError = `${outS.length} compile error(s) remain outside ${id} (first: ${show(outS[0])})`; }
  else { made.verified = 'fail'; made.verifyError = show(inS[0] ?? outS[0] ?? { file: testPath, line: 0, code: 'CS', msg: res.raw.slice(0, 120) }); }
  made.pre = pre;
  return made;
}

function stubFor(testPath, id) {
  const src = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  // the requested test only: shared preamble (before the first @id) + that test's own body (#130)
  const scoped = (() => { if (!id) return src; const ls = src.split('\n'); const first = ls.findIndex((l) => /@id\s/.test(l)); const body = testBody(testPath, id); return first < 0 || !body.length ? src : ls.slice(0, first).concat(body).join('\n'); })();
  const dir = path.resolve(ROOT, path.dirname(testPath));
  const made = [];
  const add = (abs, body) => { if (fs.existsSync(abs)) return; fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); made.push(rel(abs)); };
  const names = (clause) => {
    const typeOnly = /^type\s+[{*\w$]/.test(clause);
    const c = clause.replace(/^type\s+(?=[{*\w$])/, '');
    const ns = /^\*\s+as\s+([\w$]+)$/.exec(c)?.[1] ?? null;
    const ents = /\{([^}]*)\}/.exec(c)?.[1].split(',').map((x) => x.trim()).filter(Boolean) ?? [];
    const types = ents.filter((x) => typeOnly || /^type\s/.test(x)).map((x) => x.replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
    const named = typeOnly ? [] : ents.filter((x) => !/^type\s/.test(x)).map((x) => x.split(/\s+as\s+/)[0]);
    const def = typeOnly || ns ? undefined : /^\s*([A-Za-z_$][\w$]*)\s*(,|$)/.exec(c)?.[1];
    return { named, def, ns, types };
  };
  // `import * as ns` => the `ns.x` members the test uses, seen as plain names (#128)
  const prep = (clause) => {
    const { named, def, ns, types } = names(clause);
    const e = ns?.replace(/\$/g, '\\$');
    const S = ns ? scoped.replace(new RegExp(`(?<![\\w$./'"\`-])${e}\\.(?=[A-Za-z_$])`, 'g'), '') : scoped;
    const members = ns ? [...new Set([...scoped.matchAll(new RegExp(`(?<![\\w$./'"\`-])${e}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map((m) => m[1]))] : [];
    return { named: [...new Set([...named, ...members])], def, types, S };
  };
  // static methods the test calls on an imported class: `Foo.create(` (#128)
  const staticsOf = (S, n) => [...new Set([...S.matchAll(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))].map((m) => m[1]))].filter((k) => !/^(then|catch|toString|valueOf|call|apply|bind|constructor)$/.test(k));
  const isError = (S, n) => {
    if (/(Error|Exception)$/.test(n) || new RegExp(`\\b(?:toThrow|toThrowError)\\(\\s*${n}\\s*\\)`).test(S)) return true;
    for (const m of S.matchAll(/\b(?:throws|rejects)\s*\(/g)) {
      let depth = 1, quote = '';
      for (let i = m.index + m[0].length; i < S.length && depth; i++) {
        const c = S[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
        else if (/['"`]/.test(c)) quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 1) {
          if (new RegExp(`^\\s*${n}\\s*[,)]`).test(S.slice(i + 1))) return true;
          break;
        }
      }
    }
    return false;
  };
  const isCls = (S, n) => isError(S, n) || new RegExp(`\\bnew\\s+${n}\\b|\\bextends\\s+${n}\\b|\\binstanceof\\s+${n}\\b|\\btoBeInstanceOf\\(\\s*${n}\\s*\\)`).test(S) || (/^[A-Z]/.test(n) && !/^[A-Z0-9_]+$/.test(n) && staticsOf(S, n).length > 0);
  const mth = (n, k, stat) => `\n  ${stat ? 'static ' : ''}${k}(..._args${ts ? ': any[]): any' : ')'} {\n    throw new Error('not implemented: ${n}.${k}');\n  }\n`;
  // a name the test never calls is a value (`CONFIG.max`, `initialState`): any use fails deliberately instead of reading `undefined`
  const valueStub = (n) => `export const ${n}${ts ? ': any' : ''} = new Proxy(function () {}, {\n  get(_t${ts ? ': any' : ''}, p${ts ? ': any' : ''}) { if (typeof p === 'string' && p !== 'then') throw new Error(\`not implemented: ${n}.\${p}\`); },\n  apply() { throw new Error('not implemented: ${n}'); },\n});\n`;
  const exportOf = (n, S, dflt) => {
    const fnBody = ts ? `(..._args: any[]): any {\n  throw new Error('not implemented: ${n}');\n}\n` : `() {\n  throw new Error('not implemented: ${n}');\n}\n`;
    // error types (`FooError`, `toThrow(Foo)`, `instanceof`-checked names ending in Error/Exception) extend Error so `new Foo()` and `instanceof` behave (#151)
    if (isError(S, n)) return `export ${dflt ? 'default ' : ''}class ${n} extends Error {\n  constructor(..._args${ts ? ': any[]' : ''}) {\n    super(typeof _args[0] === 'string' ? _args[0] : undefined);\n    this.name = '${n}';\n  }\n${[...staticsOf(S, n).map((k) => mth(n, k, true)), ...methodsOf(S, n).map((k) => mth(n, k))].join('')}}\n`;
    if (isCls(S, n)) return `export ${dflt ? 'default ' : ''}class ${n} {\n  constructor(..._args${ts ? ': any[]' : ''}) {}\n${[...staticsOf(S, n).map((k) => mth(n, k, true)), ...methodsOf(S, n).map((k) => mth(n, k))].join('')}}\n`;
    if (dflt) return `export default function ${n}${fnBody}`;
    if (new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}\\s*\\(`).test(S)) return `export function ${n}${fnBody}`;
    const plainConst = /^[A-Z][A-Z0-9_]+$/.test(n) && !new RegExp(`(?<![\\w$.])${n}\\s*[.\\[]`).test(S);
    return plainConst ? `export const ${n}${ts ? ': any' : ''} = undefined;\n` : valueStub(n);
  };
  if (/\.py$/.test(testPath)) {
    // class stubs must construct: a throwing __init__ in a fixture/setup makes every test a weak Red
    for (const m of scoped.matchAll(/^\s*from\s+(\.*[\w.]+)\s+import\s+(\([^)]*\)|[^\n#]+)/gm)) {
      const mod = m[1];
      // stdlib / installed packages must not be shadowed by a stub (probe with cwd removed from sys.path so project dirs do not count; user site and PYTHONPATH do)
      if (!mod.startsWith('.') && spawnSync('python3', ['-c', 'import importlib.util,sys;sys.path=[p for p in sys.path if p not in ("",".")];sys.exit(0 if importlib.util.find_spec(sys.argv[1].split(".")[0]) else 1)', mod], { cwd: os.tmpdir() }).status === 0) continue;
      const proot = path.resolve(ROOT, projectFor(testPath)?.root ?? '.');
      const top = mod.replace(/^\.+/, '').split('.')[0];
      const has = (b) => fs.existsSync(path.join(b, top)) || fs.existsSync(path.join(b, top + '.py'));
      // src layout: put new modules under src/ when the package already lives there (or src/ is the only package root) (#68)
      const srcLayout = !has(proot) && (has(path.join(proot, 'src')) || (fs.existsSync(path.join(proot, 'src')) && fs.readdirSync(path.join(proot, 'src')).some((x) => fs.existsSync(path.join(proot, 'src', x, '__init__.py')))));
      // pytest `pythonpath = src` (pytest.ini / pyproject / setup.cfg / tox.ini) names the package root even when that directory does not exist yet (#131)
      const ppDir = (() => { for (const f of ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini']) { try { const m = /^\s*pythonpath\s*=\s*(\[[^\]]*\]|[^\n]*(?:\n[ \t]+[^\n]+)*)/m.exec(fs.readFileSync(path.join(proot, f), 'utf8')); const d = m && [...m[1].matchAll(/[\w./-]+/g)].map((x) => x[0]).find((x) => x !== '.'); if (d) return d; } catch {} } return null; })();
      const base = mod.startsWith('.') ? dir : ppDir && !has(proot) ? path.join(proot, ppDir) : srcLayout ? path.join(proot, 'src') : proot;
      const abs = path.join(base, ...mod.replace(/^\.+/, '').split('.')) + '.py';
      // `from pkg import x` where pkg/ is a namespace package: never create pkg.py next to it
      if (fs.existsSync(abs.replace(/\.py$/, '')) && fs.statSync(abs.replace(/\.py$/, '')).isDirectory() && !fs.existsSync(abs.replace(/\.py$/, '/__init__.py'))) continue;
      const bindings = m[2].replace(/#[^\n]*/g, '').replace(/[()]/g, '').split(',').map((x) => x.trim().split(/\s+as\s+/)).filter(([n]) => n);
      const ns = bindings.map(([n]) => n);
      const localOf = (n) => bindings.find(([name]) => name === n)?.[1] ?? n;
      // pytest.raises(X) / assertRaises(X) / except X => an Exception subclass, else the Red is "must derive from BaseException"
      const isExc = (n) => new RegExp(`(raises|assertRaises|assertRaisesRegex)\\(\\s*${n}\\b|\\bexcept\\s+\\(?\\s*${n}\\b`).test(scoped);
      // ALL_CAPS names that are never called are constants, not classes (#112)
      const isConst = (n) => /^[A-Z][A-Z0-9_]+$/.test(n) && !new RegExp(`\\b${n}\\s*\\(`).test(scoped);
      const stubOf = (n) => isExc(n) ? `class ${n}(Exception):\n    pass\n` : isConst(n) ? `${n} = None\n` : /^[A-Z]/.test(n) ? `class ${n}:\n    def __init__(self, *a, **k):\n        pass\n${methodsOf(scoped, n).map((k) => `\n    def ${k}(self, *a, **k):\n        raise NotImplementedError("${k}")\n`).join('')}` : `def ${n}(*a, **k):\n    raise NotImplementedError("${n}")\n`;
      const existing = fs.existsSync(abs) ? abs : fs.existsSync(abs.replace(/\.py$/, '/__init__.py')) ? abs.replace(/\.py$/, '/__init__.py') : null;
      if (existing) {
        // a module that still holds only stubs gets the newly imported names; real code is never touched
        const cur = fs.readFileSync(existing, 'utf8');
        const rest = cur.replace(/^class \w+(\(Exception\))?:\n(?:    def __init__\(self, \*a, \*\*k\):\n        pass\n|    pass\n)(?:\n    def \w+\(self, \*a, \*\*k\):\n        raise NotImplementedError\("\w+"\)\n)*/gm, '').replace(/^def \w+\(\*a, \*\*k\):\n    raise NotImplementedError\("\w+"\)\n/gm, '');
        let missing = ns.filter((n) => !new RegExp(`^(class|def)\\s+${n}\\b|^${n}\\s*=`, 'm').test(cur));
        // `from pkg import mod` used as `mod.f(...)` is a submodule: create pkg/mod.py and leave __init__.py alone (#112)
        if (/__init__\.py$/.test(existing)) {
          const sub = missing.filter((n) => /^[a-z_]\w*$/.test(n) && new RegExp(`\\b${localOf(n)}\\.\\w`).test(scoped) && !new RegExp(`(?<![\\w.])${localOf(n)}\\s*\\(`).test(scoped));
          for (const n of sub) {
            const fns = [...new Set([...scoped.matchAll(new RegExp(`\\b${localOf(n)}\\.([A-Za-z_]\\w*)\\s*\\(`, 'g'))].map((x) => x[1]))];
            add(path.join(path.dirname(existing), n + '.py'), fns.map((f) => `def ${f}(*a, **k):\n    raise NotImplementedError("${f}")\n`).join('\n\n') || 'pass\n');
          }
          missing = missing.filter((n) => !sub.includes(n));
        }
        if (missing.length && !rest.trim()) { fs.appendFileSync(existing, (cur.endsWith('\n') ? '\n\n' : '\n\n\n') + missing.map(stubOf).join('\n\n')); made.push(rel(existing)); }
        else if (missing.length) (made.realMissing ??= []).push(`${missing.join(', ')} in ${rel(existing)}`);
        continue;
      }
      add(abs, ns.map(stubOf).join('\n\n'));
    }
    return Object.assign([...new Set(made)], { realMissing: made.realMissing });
  }
  if (/_test\.go$/.test(testPath)) return stubGo(testPath, scoped, dir, add, made);
  if (/\.rs$/.test(testPath)) return stubRust(testPath, scoped, dir, made);
  if (/\.java$/.test(testPath)) return stubJava(testPath, scoped, dir, add, made);
  if (/\.cs$/.test(testPath)) return stubCs(testPath, src, id, made);
  if (/\.(c|cc|cpp|cxx)$/.test(testPath)) return stubC(testPath, scoped, dir, add, made);
  const lang = /\.php$/.test(testPath) ? 'php' : /\.jl$/.test(testPath) ? 'jl' : /\.[Rr]$/.test(testPath) ? 'r' : null;
  if (lang) return stubScript(lang, scoped, dir, add, made);
  const testTs = /\.[cm]?tsx?$/.test(testPath);
  let ts = testTs;
  const newBody = (clause) => {
    const { named, def, types, S } = prep(clause);
    let body = named.map((n) => exportOf(n, S)).join('\n');
    if (ts && types.length) body += (body ? '\n' : '') + types.map((n) => `export type ${n} = any;\n`).join('\n');
    if (def) body += (body ? '\n' : '') + exportOf(def, S, true);
    return body || 'export {};\n';
  };
  // the module exists but lacks a name the test imports (or a method of a class it already has): add throwing stubs, never touch existing lines (#112)
  const jsExisting = (file, clause) => {
    const { named, def, types, S } = prep(clause);
    let cur = fs.readFileSync(file, 'utf8');
    // names a barrel already re-exports (`export * from './x'`, `export { a } from './x'`) are real, never stubbed over (#151)
    const barrel = (f, seen = new Set()) => {
      if (seen.has(f)) return '';
      seen.add(f);
      let t = '';
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/export\s+(?:\*(?:\s+as\s+\w+)?|(?:type\s+)?\{[^}]*\})\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const b = path.resolve(path.dirname(f), m[1]), st = b.replace(/\.[cm]?[jt]sx?$/, '');
        const hit = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.js'].flatMap((e) => [b + e, st + e]).find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
        if (hit) t += '\n' + fs.readFileSync(hit, 'utf8') + barrel(hit, seen);
      }
      return t;
    };
    const via = barrel(file);
    const has = (n) => new RegExp(`\\b(?:function|class|const|let|var|enum|interface|type)\\s+${n}\\b|\\bexport\\s*\\{[^}]*\\b${n}\\b|\\bas\\s+${n}\\b`).test(cur + via);
    const add2 = named.filter((x) => !has(x)).map((n) => exportOf(n, S));
    if (ts) for (const n of types.filter((x) => !has(x))) add2.push(`export type ${n} = any;\n`);
    let changed = false;
    for (const n of [...named, def].filter((x) => x && has(x))) {
      const cm = new RegExp(`\\bclass\\s+${n}\\b[^{]*\\{`).exec(cur);
      if (!cm) continue;
      let depth = 1, i = cm.index + cm[0].length;
      for (; i < cur.length && depth > 0; i++) { if (cur[i] === '{') depth++; else if (cur[i] === '}') depth--; }
      const body = cur.slice(cm.index + cm[0].length, i - 1);
      // only methods whose receiver is provably this class (`new X().m(`, `v = new X(); v.m(`, `X.m(`) go into real code (#128)
      const miss = methodsOf(S, n, true).filter((k) => !new RegExp(`(?:^|\\s)(?:async\\s+|static\\s+|get\\s+|set\\s+)*${k}\\s*\\(|\\b${k}\\s*[=:]`).test(body));
      const missStatic = staticsOf(S, n).filter((k) => !new RegExp(`\\bstatic\\s+(?:async\\s+)?${k}\\b`).test(body));
      if (!miss.length && !missStatic.length) continue;
      const ins = [...missStatic.map((k) => mth(n, k, true)), ...miss.map((k) => mth(n, k))].join('');
      cur = cur.slice(0, i - 1) + ins + cur.slice(i - 1);
      changed = true;
    }
    if (add2.length) { cur += (cur.endsWith('\n') ? '\n' : '\n\n') + add2.join('\n'); changed = true; }
    if (changed) { fs.writeFileSync(file, cur); made.push(rel(file)); }
  };
  // static `import … from './x'` (multi-line clauses too) and dynamic `(const {a} | x) = await import('./x')`, also in .cjs tests (#76, #128)
  // bare package specifiers that a workspace package.json name or tsconfig path resolves to a source file are stubbed in that entry file (#128)
  const pkgEntry = (spec) => {
    const hit = aliasMap(new Set(gitFiles('*')), true).find(([name, , isDir]) => name === spec && !isDir);
    return hit ? path.join(ROOT, hit[1]) : null;
  };
  const imps = [...scoped.matchAll(/import\s+([^'";]*?)\s+from\s+['"]([^'"\n]+)['"]/g)].map((m) => ({ 1: m[1].replace(/\s+/g, ' ').trim(), 2: m[2] }));
  for (const m of scoped.matchAll(/(?:(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*)?await\s+import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) imps.push({ 1: m[1] && m[1].startsWith('{') ? m[1] : '', 2: m[2] });
  for (const m of imps) {
    ts = testTs;
    const spec = m[2];
    if (!/^\.{1,2}\//.test(spec)) {
      if (/^(node:|data:|https?:)/.test(spec) || builtinModules.includes(spec)) continue;
      const entry = pkgEntry(spec);
      if (entry) { ts = /\.[cm]?tsx?$/.test(entry); if (fs.existsSync(entry)) jsExisting(entry, m[1]); else add(entry, newBody(m[1])); continue; }
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      let up = dir, installed = false;
      for (;; up = path.dirname(up)) { if (fs.existsSync(path.join(up, 'node_modules', pkgName))) { installed = true; break; } if (up === path.dirname(up)) break; }
      if (!installed) (made.warnings ??= []).push(`${spec} (package import: no workspace package or tsconfig path resolves it)`);
      continue;
    }
    const abs = path.resolve(dir, spec);
    const exts = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.js'];
    const stem = abs.replace(/\.[cm]?[jt]sx?$/, '');
    const found = exts.map((e) => (fs.existsSync(abs + e) && fs.statSync(abs + e).isFile() ? abs + e : fs.existsSync(stem + e) && fs.statSync(stem + e).isFile() ? stem + e : null)).find(Boolean);
    if (found) { jsExisting(found, m[1]); continue; }
    const target = /\.[cm]?[jt]sx?$/.test(abs) ? (ts ? stem + '.ts' : abs) : abs + (ts ? '.ts' : '.js');
    add(target, newBody(m[1]));
  }
  return made;
}

// body of the test annotated with `@id <id>` (up to the next @id), as lines
function testBody(testPath, id) {
  const ls = fs.readFileSync(path.join(ROOT, testPath), 'utf8').split('\n');
  if (/\.py$/.test(testPath)) {
    const range = pythonScope(ls.join('\n'))?.find((r) => r.ids.includes(id));
    if (range) return ls.slice(range.start, range.end);
  }
  const start = ls.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  if (start < 0) return [];
  let end = ls.findIndex((l, i) => i > start && /@id\s/.test(l));
  if (end < 0) end = ls.length;
  return ls.slice(start, end);
}
const ASSERT_LINE = /(expect\s*\(|\b(?:Assert|CollectionAssert|StringAssert|FileAssert)\.\w+|\.Should\(|\bASSERT\w*\s*\(|\bCHECK\w*\s*\(|\bEXPECT\w*\s*\(|\bassert|raises|toThrow|\.should|assertEquals|@test\b|expect_|\bif\b.*[!=]=|t\.(Error|Fatal))/;
// lines that belong to an assertion, including the continuation lines of a multi-line `assert_eq!(` / `expect(` call (#89)
function markAsserts(lines) {
  const flags = lines.map(() => false);
  for (let i = 0; i < lines.length; i++) {
    if (!ASSERT_LINE.test(lines[i])) continue;
    flags[i] = true;
    const from = lines[i].search(ASSERT_LINE);
    let depth = 0;
    for (let j = i, first = true; j < lines.length; j++, first = false) {
      const seg = first ? lines[j].slice(from) : lines[j];
      for (const c of seg) { if (c === '(') depth++; else if (c === ')') depth--; }
      if (!first) flags[j] = true;
      if (depth <= 0 || j - i > 12) break;
    }
  }
  return flags;
}
// Red caused by a stub called from setup (not from the asserted behaviour) is not evidence for the REQ
function setupOrigin(line, testPath, id, text = '') {
  // a missing method on a constructor-only stub (`x.m is not a function`, `has no attribute 'm'`) is a setup failure too (#75)
  const m = /not implemented:?\s*(?:in\s+)?(?:[\w$]+(?:::|\.|->))*([\w$]+)|NotImplementedError:?\s*\(?["']?([\w$]+)|unimplemented!?\(?\s*"?([\w$]+)|\.([\w$]+) is not a function|has no attribute '([\w$]+)'/i.exec(line ?? '');
  let x = m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5];
  if (x && /^(in|at|yet|for|by|on|here|the|a|an|from|and|is|to|of|error|exception)$/i.test(x)) x = undefined;
  // Go: a `panic: <msg>` stub; the first non-runtime frame is the stubbed function (#142)
  if (!x && /^panic: /m.test(text) && /^goroutine \d+/m.test(text)) {
    const gi = text.search(/^goroutine \d+/m);
    x = text.slice(gi).split('\n').slice(1).map((l) => /^(?:[\w.\/-]+)\.(?:\([^)]*\)\.)?([A-Za-z_]\w*)\(/.exec(l)).find((f) => f && !/^(panic|Fatal|Fatalf|Errorf|Skip)$/.test(f[1]) && !/^(?:runtime|testing)\./.test(f.input))?.[1];
  }
  // Rust: `unimplemented!()` / `todo!()` without a message: the panic location points into the stub fn (#142)
  if (!x && /not implemented|not yet implemented/i.test(`${line ?? ''}\n${text}`)) {
    const pl = /panicked at ([^\s:]+):(\d+)/.exec(text);
    if (pl) {
      const rel = pl[1];
      const cands = [path.resolve(ROOT, rel), ...(() => { const o = []; let dd = path.resolve(ROOT, path.dirname(testPath)); for (let k = 0; k < 4; k++) { o.push(path.resolve(dd, rel)); dd = path.dirname(dd); } return o; })()];
      const f = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (f) { const src = fs.readFileSync(f, 'utf8').split('\n'); for (let k = Number(pl[2]) - 1; k >= 0; k--) { const fm = /\bfn\s+([\w$]+)/.exec(src[k] ?? ''); if (fm) { x = fm[1]; break; } } }
    }
  }
  const typeInit = /TypeInitializationException/.test(`${line ?? ''}\n${text}`);
  // .NET: `NotImplementedException` carries no member name; use `NotImplementedException : Ns.Type.Member` or the first stack frame `at Ns.Type.Member(` (#124)
  if (!x && /NotImplementedException|method or operation is not implemented/i.test(`${line ?? ''}\n${text}`)) {
    const named = /NotImplementedException\s*:\s*(?:[\w$]+\.)*([\w$]+)\s*$/m.exec(text);
    const frame = /^\s*at\s+(?:[\w$<>`+]+\.)*([\w$<>`]+)\(/m.exec(text);
    x = (named?.[1] && !/^(The|A)$/.test(named[1]) ? named[1] : frame?.[1])?.replace(/[<>`]/g, '');
  }
  // C#: a static field initializer / type initializer that calls a stub fails before any test body runs (#142)
  if (typeInit) return x ?? 'static initializer';
  if (!x) return null;
  if (/ERROR at setup of/.test(text)) return x; // pytest fixture failure is always setup
  const re = new RegExp(`(?<![\\w$])${x.replace(/[$]/g, '\\$&')}(?![\\w$])`);
  const all = fs.readFileSync(path.join(ROOT, testPath), 'utf8').split('\n');
  const start = all.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  let end = all.findIndex((l, i) => i > start && /@id\s/.test(l));
  if (end < 0) end = all.length;
  const inA = new Array(start).fill(false).concat(markAsserts(all.slice(start, end)));
  // a bare `eng.run()` statement is the act only when the assertions inspect state rather than call other code (otherwise a stubbed call before them is setup)
  const isBareAct = (l) => {
    if (!/^\s*(?:await\s+)?(?:\(new\s+[\w\\]+\(.*?\)\)|(?:[\w$.]|->)+)(?:::[\w$]+|->[\w$]+)*\s*\(.*\)\s*;?\s*$/.test(l)) return false;
    const bl = testBody(testPath, id), bf = markAsserts(bl);
    const own = /(?:\b(?:(?:Assert|CollectionAssert|StringAssert)\.\w+|assert\w*|expect\w*|ASSERT\w*|EXPECT\w*|CHECK\w*|len|sorted|list|set|tuple|dict|str|sum|vec|toBe\w*|toEqual|toHaveLength|toContain|equal|deepEqual|deepStrictEqual|strictEqual|eq|ne|raises)!?|@test)\s*\(/g;
    return !bl.filter((_, i) => bf[i]).some((a) => /[\w$]\s*\(/.test(a.replace(own, '')));
  };
  // `const r = sut(...)` followed by assertions on r is the act under test, not setup
  const assertedResult = (hitLines) => {
    const WRAP = '(?:(?:list|len|sorted|set|tuple|dict|str|int|float|sum|bool|String|Number|JSON\\.stringify|Object\\.\\w+|Array\\.from)\\(\\s*)*';
    // single, tuple-unpacked (`a, b = f()` / `let (a, b) = f()`) and Go `:=` targets (#110)
    let vars = hitLines.flatMap((l) => { const m = /^\s*(?:(?:const|let|var)\s+(?:mut\s+)?)?\(?\s*([A-Za-z_$][\w$]*(?:\s*,\s*(?:mut\s+)?[A-Za-z_$][\w$]*)*)\s*\)?\s*(?::(?!=)[^=]+)?:?=(?!=)/.exec(l); return m ? m[1].split(/\s*,\s*(?:mut\s+)?/).filter((v) => v !== '_') : []; });
    const bl = testBody(testPath, id), bf = markAsserts(bl);
    const body = bl.filter((_, i) => bf[i]);
    const esc = (v) => v.replace(/[$]/g, '\\$&');
    const subject = (v) => new RegExp(`(?:expect\\(\\s*(?:await\\s+)?|(?:Assert|CollectionAssert|StringAssert)\\.\\w+\\(\\s*|assert\\w*!?(?:\\.\\w+)?\\(\\s*|\\bassert\\s+(?:not\\s+)?)${WRAP}&?${esc(v)}(?![\\w$])`);
    // the variable anywhere in an assertion as a plain value (chained comparison, tuple, non-leading argument, `v.attr`, `[...v]`, `helper(v)`), but not as a call receiver (#142)
    const plainRe = (v) => new RegExp(`(?<![\\w$])(?<![\\w$)\\]]\\.)${esc(v)}(?![\\w$])(?!\\s*\\()(?!\\.[\\w$]+\\s*\\()`);
    const ASSERT_KW = /(?:\b(?:(?:Assert|CollectionAssert|StringAssert)\.\w+|assert\w*|expect\w*|ASSERT\w*|EXPECT\w*|CHECK\w*|toBe\w*|toEqual|equal|deepEqual|deepStrictEqual|strictEqual|eq|ne)!?)\s*\(/g;
    // an assertion that also calls unrelated code (`assert add(1, 2) == 3 + seed`) does not make `seed` the asserted result
    const plain = (v) => ({ test: (l) => plainRe(v).test(l) && ![...l.replace(ASSERT_KW, '(').matchAll(/[\w$]\s*\(([^()]*)\)/g)].some((c) => !plainRe(v).test(c[1]) && !new RegExp(`(?<![\\w$])${esc(v)}(?![\\w$])`).test(c[1])) });
    // a variable computed from the act result (`got = [t for t in toks ...]`, `x = obj(r)`) that is asserted makes the act the asserted subject (#142)
    for (let k = 0; k < 2; k++) {
      const derived = bl.filter((_, i) => !bf[i]).flatMap((l) => { const m = /^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?!=)(.*)$/.exec(l); return m && vars.some((v) => plain(v).test(m[2])) ? [m[1]] : []; });
      vars = [...new Set([...vars, ...derived])];
    }
    const goIf = (v) => new RegExp(`\\bif\\b[^{]*?(?<![\\w$.])${v.replace(/[$]/g, '\\$&')}(?![\\w$])`);
    return vars.some((v) => body.some((l) => subject(v).test(l) || goIf(v).test(l) || plain(v).test(l)));
  };
  // the stub is hit inside a helper defined outside the test: the test's calls to that helper are setup unless its result is asserted (#106)
  let helperAsserted = false;
  const helperVerdict = () => {
    const DEF = /^\s*(?:pub\s+)?(?:async\s+)?(?:fn|def|function|func)\s+(\w+)|^\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/;
    const defs = all.map((l, i) => ({ i, n: DEF.exec(l) })).filter((d) => d.n).map((d) => ({ i: d.i, name: d.n[1] ?? d.n[2] }));
    const bodyOf = (d, k) => all.slice(d.i, k + 1 < defs.length ? defs[k + 1].i : all.length);
    const helpers = defs.filter((d, k) => (d.i < start || d.i >= end) && bodyOf(d, k).some((l) => re.test(l)) && !/^test/i.test(d.name)).map((d) => d.name);
    const bl = testBody(testPath, id), bf = markAsserts(bl);
    for (const h of helpers) {
      const hre = new RegExp(`(?<![\\w$])${h}\\s*\\(`);
      const calls = bl.filter((l, i) => hre.test(l) && !DEF.test(l));
      if (!calls.length) continue;
      if (bl.some((l, i) => bf[i] && hre.test(l))) { helperAsserted = true; return null; }
      if (assertedResult(calls)) { helperAsserted = true; return null; }
      return x;
    }
    return null;
  };
  const base = path.basename(testPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sites = [...new Set([...text.matchAll(new RegExp(`${base}:(?:line )?(\\d+)`, 'g')).map((f) => Number(f[1]) - 1)])].filter((i) => i >= start && i < end);
  if (sites.length) {
    const hit = sites.filter((i) => re.test(all[i])).map((i) => ({ l: all[i], i }));
    // a call inside `with pytest.raises(...)` / assertRaises / assertThrows on the preceding line is the asserted behaviour
    if (hit.some(({ i }) => /raises|assertRaises|assertThrows|assert_raises/.test(all[i - 1] ?? ''))) return null;
    if (!hit.length) return helperVerdict();
    if (hit.some(({ i }) => inA[i])) return null;
    // `match f(..).unwrap() { .. }` / `match Regex::new(..) { .. }`: the scrutinee is the behaviour under test (#110)
    if (hit.some(({ l }) => /^\s*(?:match|switch)\b/.test(l))) return null;
    const firstAssert = inA.findIndex((v, i) => v && i >= start);
    const prevStmt = (() => { for (let k = firstAssert - 1; k > start; k--) if (all[k].trim() && !/^\s*(\/\/|#)/.test(all[k])) return k; return -1; })();
    if (hit.some(({ i, l }) => i === prevStmt && /\.(unwrap|expect)\s*\(/.test(l))) return null;
    if (hit.some(({ i, l }) => i === prevStmt && isBareAct(l))) return null; // bare act statement (#124)
    return assertedResult(hit.map(({ l }) => l)) ? null : x;
  }
  const bl = testBody(testPath, id), bf = markAsserts(bl);
  const asserts = bl.filter((_, i) => bf[i]);
  if (!asserts.length) return null;
  if (asserts.some((l) => re.test(l))) return null;
  const viaHelper = helperVerdict();
  if (viaHelper) return viaHelper;
  if (helperAsserted) return null; // the helper's result is the asserted subject (#124)
  // `step(..).unwrap();` as the last statement before the first assertion is the act under test (#106)
  const firstA = bf.findIndex(Boolean);
  const lastStmt = bl.slice(0, firstA).map((l, i) => ({ l, i })).filter(({ l }) => l.trim() && !/^\s*(\/\/|#)/.test(l)).at(-1);
  if (lastStmt && re.test(lastStmt.l) && /\.(unwrap|expect)\s*\(/.test(lastStmt.l)) return null;
  // a bare call statement (`eng.run()`, `run_with_retry(..)`) directly before the first assertion is the act, its side effect is asserted (#124)
  if (lastStmt && re.test(lastStmt.l) && isBareAct(lastStmt.l)) return null;
  return assertedResult(bl.filter((l, i) => re.test(l) && !bf[i])) ? null : x;
}

function goTestTarget(testPath, id) {
  const src = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  const at = new RegExp(`@id\\s+${id}\\b`).exec(src);
  if (!at) return null;
  const clean = src.replace(/"(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
  const close = (open) => {
    let depth = 1;
    for (let i = open + 1; i < clean.length; i++) {
      if (clean[i] === '{') depth++;
      if (clean[i] === '}' && --depth === 0) return i;
    }
    return clean.length;
  };
  const adjacent = (start) => start >= at.index && !clean.slice(at.index, start).trim();
  const funcs = [...clean.matchAll(/^func\s+(Test\w+)\s*\([^)]*\)\s*\{/gm)].map((m) => ({ name: m[1], start: m.index, open: m.index + m[0].length - 1 }));
  const fn = funcs.find((f) => adjacent(f.start)) ?? funcs.find((f) => f.open < at.index && close(f.open) > at.index);
  if (!fn) return null;
  const runs = [...src.matchAll(/\b\w+\.Run\s*\(\s*("(?:\\.|[^"\\])*"|`[^`]*`|[^,{}]+)\s*,\s*func\s*\([^)]*\)\s*\{/g)].filter((m) => clean.slice(m.index, m.index + 1).trim()).map((m) => {
    let name = null;
    try { name = m[1].startsWith('`') ? m[1].slice(1, -1) : JSON.parse(m[1]); } catch {}
    const open = m.index + m[0].length - 1;
    return { name: typeof name === 'string' ? name.replace(/\s/g, '_') : null, start: m.index, open, end: close(open) };
  }).filter((r) => r.start > fn.open && r.end < close(fn.open));
  const direct = runs.find((r) => adjacent(r.start));
  const containers = runs.filter((r) => r.open < at.index && r.end > at.index);
  if (direct) containers.push(direct);
  containers.sort((a, b) => a.open - b.open);
  if (containers.some((r) => r.name === null)) return null;
  const parts = [fn.name, ...containers.map((r) => r.name)];
  return { name: parts.join('/'), pattern: parts.flatMap((n) => n.split('/')).map((n) => '^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$').join('/') };
}
function goResult(text, target) {
  let result = null;
  for (const line of text.split('\n')) {
    const m = /^\s*--- (PASS|FAIL|SKIP):\s+(\S+)/.exec(line);
    if (m?.[2] === target) result = m[1].toLowerCase();
    if (line.startsWith('{')) {
      try { const e = JSON.parse(line); if (e.Test === target && /^(pass|fail|skip)$/.test(e.Action)) result = e.Action; } catch {}
    }
  }
  return result;
}
function goOutput(text) {
  return text.split('\n').map((line) => {
    if (!line.startsWith('{')) return line + '\n';
    try { const e = JSON.parse(line); return typeof e.Output === 'string' ? e.Output : ''; } catch { return line + '\n'; }
  }).join('');
}

// name used for {idu}: the lowercase ID when the file contains it, else the name of the test declared right below `@id` (camelCase / @DisplayName styles)
function testName(testPath, id) {
  const idu = id.toLowerCase().replaceAll('-', '_');
  const text = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
  if (/_test\.go$/.test(testPath)) {
    const target = goTestTarget(testPath, id);
    if (target) return target.name;
    const name = /^func\s+(Test\w+)\s*\(/m.exec(testBody(testPath, id).join('\n'))?.[1];
    if (name) return name;
  }
  if (/\.py$/.test(testPath)) {
    const body = testBody(testPath, id).join('\n');
    const name = /^\s*(?:async\s+)?def\s+(\w+)\s*\(/m.exec(body)?.[1];
    if (name) return name;
  }
  // keep the case used in the file: NUnit/xUnit FullyQualifiedName~ is case-sensitive (#141)
  const cased = new RegExp(`(?<![0-9A-Za-z_])${idu}(?![0-9A-Za-z_])`, 'i').exec(text)?.[0] ?? new RegExp(idu, 'i').exec(text)?.[0];
  if (cased) return cased;
  const ls = text.split('\n');
  const at = ls.findIndex((l) => new RegExp(`@id\\s+${id}\\b`).test(l));
  for (const l of ls.slice(at + 1, at + 8)) {
    // C# attributes ([Test], [TestCase(1, 2)], [TestMethod], [DataRow(..)], [Fact]) are not the test name (#137)
    const d = l.replace(/^\s*(@\w+(\([^)]*\))?\s*)+/, '').replace(/^\s*(\[(?:[^\[\]"]|"(?:[^"\\]|\\.)*")*\]\s*)+/, '');
    if (!d.trim() || /^\s*(\/\/|\*|\/\*)/.test(d)) continue;
    const m = /(\w+)\s*\(/.exec(d);
    if (m && !/^(if|for|while|switch|return)$/.test(m[1])) return m[1];
  }
  return idu;
}

// merging two branches that both appended to the ledger: union of both sides (deduped), ordered by time, re-chained (#79)
function mergeLedger() {
  if (!fs.existsSync(LEDGER)) { out('no ledger'); return 2; }
  const seen = new Set();
  const es = [];
  for (const l of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!l.trim() || /^(<{7}|={7}|>{7})/.test(l)) continue;
    let e;
    try { e = JSON.parse(l); } catch { out(`LEDGER CORRUPT: cannot parse line: ${l.slice(0, 80)}`); return 2; }
    const { seq, prev, hash, ...rest } = e;
    const k = JSON.stringify(rest);
    if (seen.has(k)) continue;
    seen.add(k);
    es.push(rest);
  }
  es.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let prev = '';
  const outLines = es.map((e, i) => { const full = { v: 1, ...e, seq: i + 1, prev }; delete full.hash; full.hash = entryHash(full); prev = full.hash; return JSON.stringify(full); });
  fs.writeFileSync(LEDGER, outLines.join('\n') + '\n');
  out(`ledger merged: ${es.length} entries re-chained (review with git diff; tdd check)`);
  return 0;
}

// Julia runs the whole file: read the "Test Summary:" table to see whether the target testset itself failed
function juliaSummaryRows(plain) {
  const i = plain.indexOf('Test Summary:');
  if (i < 0) return null;
  const lines = plain.slice(i).split('\n');
  const cols = lines[0].split('|')[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  return lines.slice(1).map((l) => { const [name, rest] = [l.split('|')[0].trim(), (l.split('|')[1] ?? '').trim().split(/\s+/)]; return { name, bad: cols.some((c, k) => /^(Fail|Error)$/.test(c) && +rest[k] > 0) }; }).filter((r) => r.name);
}
const juliaFailedSets = (plain) => (juliaSummaryRows(plain) ?? []).filter((r) => r.bad).map((r) => r.name);
function juliaSiblingFail(plain, id) {
  const rows = juliaSummaryRows(plain);
  if (!rows) return null;
  const mine = rows.filter((r) => r.name.toLowerCase().includes(id.toLowerCase()));
  // another top-level testset failed first and aborted the file: this testset never ran (#143)
  if (!mine.length) return rows.some((r) => r.bad) && rows.some((r) => /\bTEST-[\w-]+/i.test(r.name)) ? 'notrun' : null;
  return !mine.some((r) => r.bad) && rows.some((r) => r.bad) ? 'sibling' : null;
}

function cmdTdd() {
  const sub = pos[1];
  if (sub === 'merge-ledger') return mergeLedger();
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
    const allSpecs = loadSpecs();
    const unknownReq = allSpecs.length ? t.refs.verifies.filter((r) => !allSpecs.some((sp) => sp.reqs.some((q) => q.id === r))) : [];
    if (unknownReq.length) { out(`REFUSED: ${t.id} verifies ${unknownReq.join(', ')} which no spec defines — write the spec first`); return 1; }
    const made = stubFor(t.path, t.id);
    const scripted = /\.(?:[cm]?[jt]sx?|py)$/.test(t.path);
    if (made.length && made.verified === 'partial') out(`stubbed (throwing; NOT compile-checked — the project build still fails): ${made.join(', ')}`);
    else if (made.length) out(made.verified === 'ok' ? `stubbed (throwing, compile-checked): ${made.join(', ')} — now run: tdd red ${t.id}` : made.verified === 'fail' ? `stubbed (throwing): ${made.join(', ')} — ! the test still does not compile: ${made.verifyError}\n! could not fully stub ${t.id}: finish the stub by hand (types, struct fields, methods), then run: tdd red ${t.id}` : `stubbed (throwing; compile NOT verified${scripted ? '' : ' — no checker for this language'}): ${made.join(', ')} — now run: tdd red ${t.id}; if it reports a load/compile error, finish the stub by hand`);
    else if (made.verified === 'partial') out(`nothing was stubbed for ${t.id}: it has no compile errors of its own — NOT compile-checked`);
    else if (made.verified === 'fail') out(`nothing could be stubbed for ${t.id}: the test does not compile (${made.verifyError}) — write the missing code by hand`);
    else out(scripted ? `no missing relative imports in ${t.path}` : `nothing to stub for ${t.id} in ${t.path} (stubs only cover what this generator supports for the language); if the test still does not compile, write the missing code by hand`);
    if (made.verified === 'partial') out(`! ${made.verifyError} — the requested test has no compile errors of its own; stub or implement the other tests (\`tdd stub <their ID>\`) before running the project's tests`);
    for (const n of [...new Set(made.notes ?? [])]) out(`! ${n}`);
    if (made.realMissing?.length) out(`! not stubbed: ${made.realMissing.join('; ')} — those modules hold real code, which stubs never edit: add the names by hand`);
    if (made.warnings?.length) out(`! not stubbed: ${[...new Set(made.warnings)].join('; ')} — add the exports by hand`);
    return made.verified === 'fail' && /\.(?:c|cc|cpp|cxx)$/.test(t.path) ? 1 : 0;
  }
  if (!['red', 'green', 'refactor'].includes(sub)) { out('usage: tdd red|green|refactor <TEST-ID> [--req REQ] [--weak] | tdd stub <TEST-ID> | tdd check'); return 2; }
  if (!pos[2]) { out(`usage: tdd ${sub} <TEST-ID> [<TEST-ID>...] [--req REQ] [--weak]`); return 2; }
  if (flags.characterization === true) { out('usage: --characterization "<reason>" needs a reason text'); return 2; }
  // batch: run each ID in turn (flags such as --req/--characterization apply to every ID) (#126)
  if (pos.length > 3) {
    const ids = pos.slice(2);
    // validate every ID before the first ledger write: a typo must not leave a partial batch (#146)
    const missing = ids.filter((x) => ents.get(x)?.kind !== 'TEST');
    if (missing.length) { out(`${missing.join(', ')} not found as "@id TEST-..." annotation in source (nothing was run)`); return 2; }
    let rc = 0;
    for (const one of ids) { pos.length = 2; pos.push(one); rc = Math.max(rc, cmdTdd()); }
    return rc;
  }
  const id = pos[2];
  const t = ents.get(id);
  if (!t || t.kind !== 'TEST') { out(`${id} not found as "@id TEST-..." annotation in source`); return 2; }
  const req = typeof flags.req === 'string' ? flags.req : t.refs.verifies[0];
  const specs = loadSpecs();
  const spec = specs.find((s) => s.reqs.some((r) => r.id === req));
  if (!req || !spec) { out(`${id}: no @verifies REQ defined in a spec (.sdd/specs). add @verifies or --req`); return 2; }
  if (needsLock(spec) && approvalState(spec) !== 'ok') { out(`REFUSED: ${spec.tier} feature ${spec.feature} approval is ${approvalState(spec)}. run: ${spec.approval === 'human' ? `approve prepare ${spec.feature}, then approve record ${spec.feature} --by <human name>` : `approve record ${spec.feature} --by ai:<reviewer> --review <.sdd/review.md|summary>`}`); return 1; }

  const entries = readLedger();
  const before = testSha(t.path, id);
  const prior = entries.filter((e) => e.test === id);
  if (sub === 'green') {
    const r = prior.filter((e) => e.type === 'red').at(-1);
    if (!r) { out(`REFUSED: no Red recorded for ${id}`); return 1; }
    // reverting a wrong edit back to content that already has a Red is fine, not only the very last Red (#100)
    if (!prior.some((e) => e.type === 'red' && shaMatches(e.fileSha, t.path, id))) { out(`REFUSED: test file changed since Red (${t.path}). revert test edits to a recorded Red's content, or record a new Red`); return 1; }
  }
  const retest = sub === 'red' && flags.retest !== undefined ? (typeof flags.retest === 'string' ? flags.retest.trim() : '') : null;
  if (retest !== null) {
    if (!retest) { out('usage: tdd red <ID> --retest "<why the test expectation was wrong>" (reason required)'); return 2; }
    const last = prior.filter((e) => e.type === 'green' || e.type === 'red').at(-1);
    if (!last) { out(`REFUSED: --retest needs a previous Red/Green run for ${id}; use a normal tdd red`); return 1; }
    if (shaMatches(last.fileSha, t.path, id)) { out(`REFUSED: --retest: the test of ${id} is unchanged since its last ${last.type}; nothing to re-test`); return 1; }
  }
  if (sub === 'refactor' && !prior.some((e) => e.type === 'green')) { out(`REFUSED: no Green recorded for ${id}`); return 1; }

  const cfg = loadConfig();
  const proj = projectFor(t.path);
  const fileArg = proj ? path.posix.relative(proj.root, t.path) : t.path;
  const cmd = (proj?.testCmd ?? cfg.testCmd).map((a) => a.replaceAll('{id}', id).replaceAll('{idu}', testName(t.path, id)).replaceAll('{IDU}', id.toUpperCase().replaceAll('-', '_')).replaceAll('{file}', fileArg));
  // pytest -k is a substring match: exclude longer test names that extend this one (test_x_007 vs test_x_0071) (#98)
  const ki = cmd.indexOf('-k');
  if (ki >= 0 && /pytest/.test(cmd.join(' ')) && cmd[ki + 1] === testName(t.path, id)) {
    const me = cmd[ki + 1];
    const names = [...new Set([...fs.readFileSync(path.join(ROOT, t.path), 'utf8').matchAll(/\bdef\s+(test\w*)/g)].map((m) => m[1]))];
    const longer = names.filter((n) => n !== me && n.includes(me));
    const exact = names.includes(me);
    if (exact && longer.length) cmd[ki + 1] = [me, ...longer.map((n) => `not ${n}`)].join(' and ');
  }
  // a build failure in another Go package must not turn this test's Red into a load error (#94)
  if (/_test\.go$/.test(t.path) && cmd[0] === 'go' && cmd[1] === 'test' && cmd.includes('./...')) { const pd = path.posix.dirname(fileArg); cmd[cmd.indexOf('./...')] = pd === '.' ? '.' : './' + pd; }
  const goRunner = /_test\.go$/.test(t.path) && cmd[0] === 'go' && cmd[1] === 'test';
  if (goRunner && !cmd.includes('-v')) cmd.push('-v');
  const goTarget = goRunner ? goTestTarget(t.path, id) : null;
  if (goTarget) {
    const ri = cmd.findIndex((a) => a === '-run' || a.startsWith('-run='));
    if (ri < 0) cmd.push('-run', goTarget.pattern);
    else if (cmd[ri] === '-run') cmd[ri + 1] = goTarget.pattern;
    else cmd[ri] = '-run=' + goTarget.pattern;
  }
  const res = run(cmd, cfg.timeoutMs ?? 120000, proj?.root);
  const after = testSha(t.path, id);
  if (after !== before) { out(`REFUSED: ${t.path} changed while running (formatter/watch?)`); return 1; }

  const goVerdict = goRunner ? goResult(res.text, goTarget?.name ?? testName(t.path, id)) : null;
  if (goRunner) res.text = goOutput(res.text);
  const plain = res.text.replace(/\x1b\[[0-9;]*m/g, '');
  // Go t.Skip and JUnit @Disabled: every test that ran was skipped (#84)
  const allSkipped = (/--- SKIP:/.test(plain) && !/--- (PASS|FAIL):/.test(plain)) || [...plain.matchAll(/Tests run: (\d+), Failures: 0, Errors: 0, Skipped: (\d+)/g)].some((m) => m[1] === m[2] && +m[1] > 0 && [...plain.matchAll(/Tests run: (\d+), Failures: 0, Errors: 0, Skipped: (\d+)/g)].every((x) => x[1] === x[2]));
  // PHPUnit skipped / no assertions, dotnet Passed: 0 + Skipped: n executed nothing (#140)
  const noAssert = /Tests: \d+, Assertions: 0\b|OK, but (?:some tests were skipped|incomplete, skipped)|did not perform any assertions|Passed: 0,[^\n]*Skipped: [1-9]/i.test(plain);
  // Node >=22 can report a file-level pass: only an executed test result proves the ID matched (#154).
  const nodeNoMatch = res.exit === 0 && /(^|\n)\s*(ℹ tests \d+|# tests \d+)/.test(plain) && !nodeTestRan(plain, id, t.path);
  const goNoMatch = goRunner && !LOAD_ERR.test(plain) && (!goTarget || !goVerdict || goVerdict === 'skip');
  const zero = (ZERO_TESTS.test(res.text) && !RAN_TESTS.test(res.text)) || NO_PASSED.test(plain) || pytestNoExecution(plain) || allSkipped || noAssert || nodeNoMatch || goNoMatch;
  const siblingFail = juliaSiblingFail(plain, id);
  const timeoutWhy = `the test run timed out after ${(res.ms / 1000).toFixed(0)}s (raise timeoutMs in .sdd/config.json or fix the hang); a timeout is neither Red nor Green`;
  // forked JVM / test host died: the test matched but the runner crashed (#143)
  const crashed = res.exit !== 0 && (res.signal || /There was an error in the forked process|OutOfMemoryError|The forked VM terminated|Fatal error\. Internal CLR error|Test host process crashed|The active test run was aborted|Fatal Python error:/i.test(plain));
  const crashWhy = `the test runner process crashed (${res.signal ?? 'fatal Python error / forked JVM / test host failure'}), so the test result is unknown; make the failure an assertion or fix the crash`;
  const notRunWhy = `${id} never ran: an earlier top-level testset of the file failed and Julia aborted the file (whole-file runner); fix or Red/Green the earlier tests first`;
  let ok;
  let why = '';
  if (sub === 'red') {
    if (res.timedOut) { ok = false; why = timeoutWhy; }
    else if (crashed) { ok = false; why = crashWhy; }
    else if (siblingFail === 'notrun') { ok = false; why = notRunWhy; }
    else if (siblingFail === 'sibling') { ok = false; why = `${id} itself passes; the failure comes from another test of the same file (whole-file runner)`; }
    else if (goRunner && goVerdict === 'pass' && res.exit !== 0) { ok = false; why = `${id} itself passes; the failure comes from its parent, a sibling or suite setup`; }
    else if (zero) { ok = false; why = 'no test matched the ID, or the test is skipped/todo (check @id vs test title/method name; skipped tests cannot give Red/Green)'; }
    else if (res.exit === 0 && retest) ok = true;
    else if (res.exit === 0 && typeof flags.characterization === 'string' && flags.characterization.trim()) ok = true;
    else if (res.exit === 0) { ok = false; why = 'test passed; Red needs a real failure (data-only / characterization test? record it explicitly: --characterization "<why no implementation can fail it>")'; }
    else if (LOAD_ERR.test(res.text) && !flags.weak && !(flags['missing-module'] && declaredMissingModule(res.text, t.path))) { ok = false; why = 'load/compile error, not an assertion failure. new module? run `tdd stub <ID>` once (or `--missing-module`); if stub already ran or found nothing, add the missing code by hand; or --weak to record as weak Red'; }
    else if (typeof flags.expect === 'string' && !res.text.includes(flags.expect)) { ok = false; why = `failure output does not contain --expect "${flags.expect}" (Red for the wrong reason?)`; }
    else ok = true;
  } else {
    if (res.timedOut) { ok = false; why = timeoutWhy; }
    else if (crashed) { ok = false; why = crashWhy; }
    else if (siblingFail === 'notrun') { ok = false; why = notRunWhy; }
    else if (res.exit !== 0 && siblingFail !== 'sibling') { ok = false; why = 'test failed'; }
    else if (zero) { ok = false; why = 'no test matched the ID'; }
    else ok = true;
  }
  if (!ok) { out(`${sub.toUpperCase()} REJECTED ${id}: ${why}`); out(rejectTail(res.text)); return 1; }
  const rl = res.text.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim());
  const reason = sub === 'red' && res.exit !== 0 ? (rl.find((l) => /^E\s+\S/.test(l) && !/\d+ \/ \d+ \(\d+%\)|^E\s+\[\s*\d+%\]/.test(l))?.replace(/^E\s+/, '') ?? (() => { const i = rl.findIndex((l) => /panicked at/.test(l)); return i >= 0 && rl[i + 1] && !/^note:/.test(rl[i + 1]) ? rl[i + 1] : undefined; })() ?? specificReason(rl) ?? rl.find((l) => /not implemented/i.test(l) && !/^\d+\s*\|/.test(l)) ?? rl.find((l) => /(--- FAIL|AssertionError|Error:|assert |Failed asserting|FAILED|panicked|expected|\(Failed\)|not implemented|Test Failed|Error During Test|\w*Exception:|^Error in )/.test(l) && !/^(FAIL|❯|> Task|The following tests)/.test(l) && !/^\d+\s*\|/.test(l)) ?? rl.find((l) => /^(FAIL|not ok)\s+\S+$/.test(l)) ?? [...rl].reverse().find((l) => l && !/^(npm |note: |error: test failed|test result:|Failed!|Passed!)/.test(l)) ?? '').slice(0, 110) : '';
  const loadWeak = sub === 'red' && LOAD_ERR.test(res.text) && !(flags['missing-module'] && declaredMissingModule(res.text, t.path));
  const setupSym = sub === 'red' && !flags['allow-setup-red'] && typeof flags.expect !== 'string' ? setupOrigin(rl.find((l) => /^E\s+.*(not implemented|NotImplementedError|unimplemented|is not a function|has no attribute)/i.test(l)) ?? rl.find((l) => /not implemented|NotImplementedError|unimplemented|is not a function|has no attribute/i.test(l) && !/^\d+\s*\|/.test(l)) ?? reason, t.path, id, res.text) : null;
  const charac = sub === 'red' && res.exit === 0 && !retest ? String(flags.characterization).trim() : '';
  const retestWeak = sub === 'red' && res.exit === 0 && !!retest;
  const weakRed = loadWeak || !!setupSym || !!charac || retestWeak;
  // human-approved code baseline follows the first implementation: refresh until the feature is fully Green (#92)
  const humanSpecs = sub === 'red' ? [] : loadSpecs().filter((x) => x.approval === 'human' && x.reqs.some((q) => t.refs.verifies.includes(q.id)));
  const wasDone = new Map(humanSpecs.map((x) => [x.feature, featureGreen(x)]));
  appendLedger({ type: sub, test: id, req, reqSha: reqShaOf(req), reqShas: Object.fromEntries([...new Set([req, ...t.refs.verifies])].map((r) => [r, reqShaOf(r)]).filter(([, v]) => v)), file: t.path, fileSha: after, cmdSha: sha(cmd.join('\0')), exit: res.exit, ms: res.ms, weak: weakRed ? true : undefined, weakWhy: setupSym ? `setup:${setupSym}` : charac ? 'characterization' : retestWeak ? 'retest' : undefined, characterization: charac || undefined, retest: retestWeak ? retest : undefined });
  for (const x of humanSpecs) if (!wasDone.get(x.feature)) {
    const all = readJson(APPROVALS, {});
    if (all[x.feature]?.code) { all[x.feature].code = implFileShas(x); writeJson(APPROVALS, all); }
  }
  const lastGreen = prior.filter((e) => e.type === 'green' || e.type === 'refactor').at(-1);
  if (sub === 'refactor' && lastGreen && lastGreen.fileSha !== after) out(`⚠ ${id}: test body changed since the last Green (includes the file preamble: imports/includes/helpers); a refactor does not prove the new assertions can fail (no Red). If behaviour/assertions changed, use tdd red/green instead (#118)`);
  out(`${sub.toUpperCase()} ok ${id} (${req}) ${res.ms}ms${reason ? ` — fails with: ${reason}` : ''}${charac ? ` — characterization: ${charac} (test passed)` : retestWeak ? ` — retest: ${retest} (test passed)` : ''}${weakRed ? ' [weak]' : ''}${setupSym ? ` ⚠ Red comes from setup call "${setupSym}", not the asserted behaviour (use --expect <text> or --allow-setup-red)` : ''}`);
  return 0;
}

function traceCheck(ents, dups, specs) {
  const errors = [];
  const warnings = [];
  const reqs = new Map();
  for (const s of specs) for (const r of s.reqs) { if (reqs.has(r.id)) errors.push(`duplicate REQ ${r.id}`); else reqs.set(r.id, { ...r, spec: s }); }
  if (!specs.length) return { errors: [], warnings: ['no specs'], reqs, tested: new Set(), noSpecs: true };
  for (const d of dups.slice(0, 20)) errors.push(d.startsWith('INVALID:') ? `invalid @id ${d.slice(8)}: id suffixes must be uppercase (CODE-X-001B), a lowercase tail is not part of the id` : `duplicate @id ${d}`);
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
    // the spec table's Test column is part of the contract: ids must exist and verify that REQ (#146)
    for (const tid of r.tests ?? []) {
      const te = ents.get(tid);
      if (!te || te.kind !== 'TEST') warnings.push(`${r.id}: spec lists ${tid} but no such test exists (@id ${tid})`);
      else if (!te.refs.verifies.includes(r.id)) warnings.push(`${r.id}: spec lists ${tid} but that test does not @verifies ${r.id}`);
    }
    if (!implemented.has(r.id) && !r.testOnly) warnings.push(`${r.id} has no @implements code`);
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
    // errors without a file location (no test for a REQ, duplicate REQ) are repo-wide: never hide them in --changed mode (#60)
    // a REQ removed from a spec leaves dangling references in files that did not change: repo-wide too (#70)
    return base || !ch || !/^\S+:\d+ /.test(e) || / references unknown REQ-/.test(e) || [...ch].some((f) => e.includes(f));
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
  out(`TRACE ${t.errors.length ? 'FAIL' : 'OK'}: ${[...t.reqs.values()].filter((r) => !r.deferred).length} REQ${[...t.reqs.values()].some((r) => r.deferred) ? ` (+${[...t.reqs.values()].filter((r) => r.deferred).length} deferred)` : ''}, ${ents.size} annotated entities, ${t.errors.length} errors, ${t.warnings.length} warnings`);
  [...t.errors.slice(0, 10).map((e) => `  ✗ ${e}`), ...t.warnings.slice(0, 5).map((w) => `  ! ${w}`), ...(t.warnings.length > 5 ? [`  ! … +${t.warnings.length - 5} more`] : [])].forEach((l) => out(l));
  return t.errors.length ? 1 : 0;
}

function changedFiles() {
  const set = new Set();
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' });
  if (top.status !== 0) return set;
  const st = spawnSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: ROOT, encoding: 'utf8' });
  const add = (f) => {
    const p = path.relative(ROOT, path.resolve(top.stdout.trim(), f)).split(path.sep).join('/');
    if (p && p !== '..' && !p.startsWith('../') && !path.isAbsolute(p)) set.add(p);
  };
  if (st.status === 0) {
    const entries = st.stdout.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const l = entries[i];
      if (!l) continue;
      add(l.slice(3));
      if (/[RC]/.test(l.slice(0, 2)) && entries[i + 1]) add(entries[++i]);
    }
  }
  return set;
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/;
// dependsOn entries: `./contract`, `contract\\` and `contract/` all name the same repo-relative path (#146)
const normDep = (d) => path.posix.normalize(String(d).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/+$/, '');
function gitFiles(glob) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', glob], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter((f) => f && !/(^|\/)node_modules\//.test(f)) : [];
}
const stripJsonc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
// bare-specifier aliases: workspace package names and tsconfig paths -> source file candidates
function aliasMap(set, allowMissing = false) {
  const map = [];
  const pick = (dir, target, missing = allowMissing) => {
    if (typeof target !== 'string') return null;
    const t = path.posix.normalize(path.posix.join(dir, String(target)));
    const stem = t.replace(/\.[cm]?[jt]sx?$/, '');
    const srcStem = stem.replace(/^((?:.*\/)?)(dist|build|lib)\//, '$1src/');
    for (const c of [stem, srcStem]) for (const e of ['.ts', '.tsx', '.js', '.mjs', '.jsx', '/index.ts', '/index.js']) if (set.has(c + e)) return c + e;
    if (missing) return /\.[cm]?[jt]sx?$/.test(t) ? t : stem + '.ts';
    return null;
  };
  for (const pf of gitFiles('*package.json')) {
    const dir = path.posix.dirname(pf);
    const pkg = readJson(path.join(ROOT, pf), null);
    if (!pkg?.name) continue;
    const ex = typeof pkg.exports === 'string' || (pkg.exports && typeof pkg.exports === 'object' && !Object.keys(pkg.exports).some((k) => k.startsWith('.'))) ? { '.': pkg.exports } : pkg.exports ?? {};
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
      const t = pick(base, String(vs[0]).replace(/\/\*$/, ''), allowMissing && !star);
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
function jsRev(files) {
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
  for (const f of files.filter((x) => !/\.json$/.test(x))) {
    // type-only imports are erased at runtime and do not propagate a change (#111)
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/\bimport\s+type\b[^;'"]*?from\s*['"][^'"\n]+['"]/g, '')
      .replace(/\bimport\s*\{([^}]*)\}\s*from\s*(['"][^'"\n]+['"])/g, (all, specs, q) => (specs.trim() && specs.split(',').filter((x) => x.trim()).every((x) => /^\s*type\s/.test(x)) ? '' : all));
    for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*|require\(\s*)['"]([^'"\n]+)['"]/g)) {
      const t = m[1].startsWith('.') ? resolve(f, m[1]) : resolveBare(m[1]);
      if (t) { if (!rev.has(t)) rev.set(t, []); rev.get(t).push(f); }
    }
  }
  return rev;
}

function relatedTests(changed) {
  const files = listFiles().filter((f) => /\.[cm]?[jt]sx?$/.test(f));
  const set = new Set(files);
  const rev = jsRev(files);
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
  for (const s of specs.filter((x) => x.approval === 'human')) {
    const ap = readJson(APPROVALS, {})[s.feature];
    if (!ap?.code) continue;
    const now = implFileShas(s);
    const changed = Object.keys({ ...ap.code, ...now }).filter((f) => ap.code[f] !== now[f]);
    if (changed.length) lines.push(`! human-approved ${s.feature}: implementation changed since approval (${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ', …' : ''}) — a human should re-review, then approve record`);
  }
  for (const s of specs.filter(needsLock)) { const st = approvalState(s); const ap = readJson(APPROVALS, {})[s.feature]; add(st === 'ok', `lock ${s.feature}: ${st}${ap ? ` [${ap.kind}${ap.kind === 'ai' ? `, review ${ap.review ? (ap.reviewSha ? 'file' : 'summary') : 'none'}` : ''}]` : ''}${s.approval === 'human' ? ' (human required)' : ''}${lockDrift(s) ? ` (policy loosened: ${lockDrift(s)} — human re-approval needed)` : ''}`); const dp = designProblem(s); if (dp) add(false, `design ${s.feature}: missing`, [dp]); }
  for (const [f, a] of Object.entries(readJson(APPROVALS, {}))) if (!specs.some((s) => s.feature === f) && (a.tier === 'T2' || a.requireHuman)) add(false, `lock ${f}: spec removed`, [`a locked ${a.tier === 'T2' ? 'T2' : 'human'} spec disappeared — if intended: approve retire ${f} --by <human name>`]);

  const t = applyBaseline(traceCheck(ents, dups, specs));
  add(!t.errors.length, `trace: ${[...t.reqs.values()].filter((r) => !r.deferred).length} REQ, ${t.errors.length} errors${t.warnings.length ? `, ${t.warnings.length} warnings` : ''}`, t.errors.slice(0, 6));

  const entries = readLedger();
  const chain = verifyChain(entries);
  add(!chain, `ledger: ${chain ?? `${entries.length} entries, chain intact`}`);

  let relevant = new Set([...t.reqs.keys()]);
  if (flags.changed) {
    const ch = changedFiles();
    relevant = new Set();
    for (const e of ents.values()) if (ch.has(e.path)) [...e.refs.implements, ...e.refs.verifies].forEach((r) => relevant.add(r));
    for (const s of specs) if (ch.has(s.path)) s.reqs.forEach((r) => relevant.add(r.id));
    // a REQ edited in an already-committed spec is still stale evidence (#70)
    for (const e of ents.values()) if (e.kind === 'TEST') for (const r of e.refs.verifies) if (!relevant.has(r) && /changed in the spec/.test(evidenceStatus(e.id, e.path, entries).why ?? '')) relevant.add(r);
  }
  const problems = [];
  let covered = 0;
  let weak = 0;
  const weakIds = [];
  let charac = 0;
  let retestN = 0;
  const retestIds = [];
  let total = 0;
  const seenTests = new Set();
  for (const id of relevant) {
    const r = t.reqs.get(id);
    if (!r || r.deferred) continue;
    for (const e of ents.values()) {
      if (e.kind !== 'TEST' || !e.refs.verifies.includes(id) || seenTests.has(e.id)) continue;
      seenTests.add(e.id);
      total++;
      const s = evidenceStatus(e.id, e.path, entries);
      if (s.ok) { covered++; if (s.weak) { weak++; if (!s.charac && !s.retest) weakIds.push(e.id); } if (s.charac) charac++; if (s.retest) { retestN++; retestIds.push(e.id); } } else problems.push(`${e.id} (${id}): ${s.why}`);
    }
  }
  add(!problems.length, `tdd evidence${flags.changed ? ' (changed scope)' : ''}: ${covered}/${total} tests Red→Green${weak ? `, ${weak} weak Red${weak > charac + retestN ? ' — Red came from setup/load, not the asserted behaviour (before implementing: `tdd red <ID> --expect <text>`; after Green: keep as weak, or temporarily break the implementation to re-record Red): ' + weakIds.slice(0, 8).join(', ') + (weakIds.length > 8 ? `, … +${weakIds.length - 8}` : '') : ''}${charac ? ` (${charac} characterization: passed without a failing Red)` : ''}${retestN ? ` (${retestN} retest: Red re-recorded with --retest, passed without a failing Red: ${retestIds.slice(0, 8).join(', ')}${retestIds.length > 8 ? `, … +${retestIds.length - 8}` : ''})` : ''}` : ''}`, [...problems.slice(0, 6), ...(problems.length > 6 ? [`… +${problems.length - 6} more`] : [])]);

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
  if (flags.changed) {
    const chg = changedFiles();
    const specFeatures = new Set(loadSpecs().filter((sp) => chg.has(sp.path) || [...chg].some((c) => c.replace(/^\.\//, '') === sp.path)).map((sp) => sp.feature));
    const specImpl = specFeatures.size ? [...scanEntities(listFiles()).ents.values()].filter((e) => e.refs.implements.some((r) => loadSpecs().some((sp) => specFeatures.has(sp.feature) && sp.reqs.some((q) => q.id === r)))).map((e) => e.path) : [];
    const x = crossImpact(new Set([...chg, ...specImpl]));
    const xf = [...new Set(x.map((o) => o.feature))];
    if (x.length) lines.push(`! changed files/specs are imported by other feature(s): ${xf.join(', ')} (${x.slice(0, 4).map((o) => o.req).join(', ')}${x.length > 4 ? ', …' : ''}) — their evidence is not re-checked here; run a full gate (or \`impact <file>\`)`);
  }
  const allChecks = [...(cfg.checks ?? []), ...(cfg.projects ?? []).flatMap((p) => (p.checks ?? []).map((c) => ({ ...c, name: `${p.root}:${c.name}`, cwd: p.root, dependsOn: p.dependsOn })))];
  let sharedHinted = false;
  for (const p of cfg.projects ?? []) for (const dp of p.dependsOn ?? []) if (!fs.existsSync(path.join(ROOT, normDep(dp)))) lines.push(`! config: project ${p.root} dependsOn "${dp}" does not exist on disk — contract changes will not trigger its checks (typo?)`);
  if (flags['no-run']) { lines.push('! commands: SKIPPED (--no-run) — result is INCOMPLETE'); incomplete = true; }
  else {
  // root-owned files no project depends on: hint once, also when the root has no checks of its own (#67)
  if (flags.changed && (cfg.projects ?? []).length) {
    const pr = cfg.projects.map((p) => p.root.replace(/\/$/, '') + '/');
    const coveredBy = (f) => cfg.projects.some((p) => (p.dependsOn ?? []).some((d) => { const x = normDep(d); return f === x || f.startsWith(x + '/'); }));
    const dataOnly = [...changedFiles()].filter((f) => !f.startsWith('.sdd/') && !pr.some((r) => f.startsWith(r)) && !EXT.test(f) && !coveredBy(f));
    if (dataOnly.length) { sharedHinted = true; lines.push(`! root-owned data/config changes: ${dataOnly.slice(0, 3).join(', ')}${dataOnly.length > 3 ? ', …' : ''} — if a project reads these, add the path to its \`dependsOn\` in .sdd/config.json so that project's checks run too`); }
  }
  for (const c of allChecks) {
    let cmd = c.cmd;
    const base = c.cwd ? c.cwd.replace(/\/$/, '') + '/' : '';
    const inDeps = (f) => (c.dependsOn ?? []).some((d) => { const x = normDep(d); return f === x || f.startsWith(x + '/'); });
    if (c.cwd && flags.changed && ![...changedFiles()].some((f) => f.startsWith(base) || inDeps(f))) { lines.push(`! cmd ${c.name}: no changed files in ${c.cwd}${c.dependsOn?.length ? ` or its dependencies (${c.dependsOn.join(', ')})` : ''} — skipped`); continue; }
    const pRoots = (cfg.projects ?? []).map((p) => p.root.replace(/\/$/, '') + '/');
    if (!c.cwd && flags.changed && pRoots.length) {
      const chg = [...changedFiles()].filter((f) => !f.startsWith('.sdd/'));
      const outside = chg.filter((f) => !pRoots.some((r) => f.startsWith(r)));
      if (chg.length && !outside.length) { lines.push(`! cmd ${c.name}: all changed files are inside nested projects (${pRoots.join(', ')}) — root check skipped`); continue; }
    }
    const ownChanged = !base || [...changedFiles()].some((f) => f.startsWith(base));
    let scoped = false;
    if (flags.changed && c.changedCmd && ownChanged) {
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
      const rp = (arr) => base ? arr.filter((f) => f.startsWith(base)).map((f) => f.slice(base.length)) : arr;
      let noScope = false;
      const absBase = path.resolve(ROOT, c.cwd ?? '.');
      const scopeVals = {};
      for (const [tok, fn] of Object.entries(SCOPE_TOKENS)) {
        if (!c.changedCmd.includes(tok)) continue;
        const v = fn(rp(ch), absBase);
        const arr = Array.isArray(v) ? v : [v];
        if (!arr.length || (arr.length === 1 && !arr[0])) {
          // single-module Maven project: the root is the only module, so the full check is the scoped check (#81)
          const single = tok === '{changedModulesCsv}' && fs.existsSync(path.join(absBase, 'pom.xml')) && !/<modules>/.test(fs.readFileSync(path.join(absBase, 'pom.xml'), 'utf8'));
          if (!single) lines.push(`! cmd ${c.name}: cannot scope changes for ${tok} — running the full check${hasCommit() ? '' : ' (this repo has no commit yet: make an initial commit so `--changed` has a baseline)'}`); cmd = c.cmd; noScope = true; break;
        }
        scopeVals[tok] = arr;
      }
      const subst = { ...scopeVals, '{changedFiles}': rp(ch), '{changedTests}': rp(tests), '{changedScopes}': base ? [...new Set(rp(scopes))] : scopes, '{directTests}': rp(rel2.direct) };
      if (!noScope) cmd = cmd.flatMap((a) => subst[a] ?? [a]);
      if (!noScope && Object.keys(scopeVals).length) lines.push(`! cmd ${c.name}: scoped → ${cmd.join(' ').slice(0, 200)}`);
      scoped = !noScope;
    }
    let r = run(cmd, scoped ? (c.changedTimeoutMs ?? cfg.changedTimeoutMs ?? 60000) : (c.timeoutMs ?? cfg.timeoutMs ?? 120000), c.cwd);
    // a scoped run that executed no tests (e.g. `vitest related data.json`) proves nothing: run the full check instead
    if (scoped && r.exit === 0 && !r.timedOut && ((ZERO_TESTS.test(r.text) && !RAN_TESTS.test(r.text)) || NO_PASSED.test(r.text) || pytestNoExecution(r.text))) {
      lines.push(`! cmd ${c.name}: scoped run matched no tests — running the full check instead`);
      scoped = false;
      r = run(c.cmd, c.timeoutMs ?? cfg.timeoutMs ?? 120000, c.cwd);
    }
    if (r.timedOut) { add(false, `cmd ${c.name} TIMEOUT after ${(r.ms / 1000).toFixed(0)}s ${scoped ? '— narrow changedCmd (e.g. {changedTests} {changedScopes}) or raise changedTimeoutMs; run full gate (no --changed) before merge' : '— raise timeoutMs in .sdd/config.json'}`); continue; }
    if (r.exit === 0 && (NO_PASSED.test(r.text) || pytestNoExecution(r.text))) { lines.push(`! cmd ${c.name}: all tests skipped/todo/xfail — INCOMPLETE, no passing assertions`); incomplete = true; continue; }
    if (r.exit !== 0 && ZERO_TESTS.test(r.text) && !RAN_TESTS.test(r.text)) { lines.push(`! cmd ${c.name}: no tests exist yet (runner exit ${r.exit}) — INCOMPLETE, not a failure`); incomplete = true; continue; }
    add(r.exit === 0, `cmd ${c.name} (${(r.ms / 1000).toFixed(1)}s)`, r.exit === 0 ? [] : failTail(r.text, 8).split('\n'));
  }
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
  // an unlocked (T1) spec has no lock to go stale, but changed REQ/test evidence must still be visible (#77)
  const t1State = (s) => (s.reqs.some((r) => !r.deferred && [...ents.values()].some((e) => e.kind === 'TEST' && e.refs.verifies.includes(r.id) && /changed/.test(evidenceStatus(e.id, e.path, entries).why ?? ''))) ? 'stale' : 'n/a');
  const ap = specs.map((s) => `${s.feature}:${s.tier}:${needsLock(s) ? approvalState(s) : t1State(s)}`).join(' ');
  const { dups } = scanEntities(listFiles());
  const orphans = traceCheck(ents, dups, specs).errors.filter((e) => /references unknown REQ-/.test(e)).length;
  out(`specs ${specs.length} [${ap}] | entities ${ents.size} | ledger ${entries.length}${orphans ? ` | ORPHAN refs ${orphans} (unknown REQ — see trace)` : ''}`);
  return 0;
}

// ---------- plan (feature-level order for large work) ----------
function loadPlan() {
  const f = path.join(SDD, 'plan.md');
  if (!fs.existsSync(f)) return null;
  const rows = [];
  const bad = [];
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c.length >= 2 && l.trim().startsWith('|') && !/^\d+$/.test(c[0]) && !/^(order|no\.?|#|:?-+:?)$/i.test(c[0]) && c[1]) bad.push(`plan.md row ignored (order "${c[0]}" is not a number): ${c[1]}`);
    if (c.length < 2 || !/^\d+$/.test(c[0])) continue;
    rows.push({ order: Number(c[0]), feature: c[1], deps: (c[2] ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== '-'), note: c[3] ?? '' });
  }
  return Object.assign(rows.sort((a, b) => a.order - b.order), { bad });
}

function cmdPlan(args) {
  const rows = loadPlan();
  if (!rows) { out('no .sdd/plan.md (table: | order | feature | depends | note |)'); return 1; }
  const specs = loadSpecs();
  const { ents, dups } = scanEntities(listFiles());
  const entries = readLedger();
  const byFeat = new Map(specs.map((s) => [s.feature, s]));
  const tr = traceCheck(ents, dups, specs);
  // a REQ removed from a spec leaves 'references unknown REQ-P-N' errors: attribute them to the feature whose REQs share the prefix (#77)
  const prefixOf = (id) => id.replace(/-[A-Z0-9]+$/, '');
  const traceDirty = (sp) => { const pf = new Set(sp.reqs.map((r) => prefixOf(r.id))); return tr.errors.some((e) => { const u = /references unknown (REQ-[A-Z0-9-]+)/.exec(e)?.[1]; return u ? pf.has(prefixOf(u)) : sp.reqs.some((r) => e.includes(r.id)); }); };
  const isDone = (feat) => {
    const sp = byFeat.get(feat);
    if (!sp) return false;
    if (traceDirty(sp)) return false;
    if (needsLock(sp) && (approvalState(sp) !== 'ok' || designProblem(sp))) return false;
    let n = 0;
    for (const r of sp.reqs) {
      if (r.deferred) continue;
      let covered = 0;
      for (const e of ents.values()) {
        if (e.kind !== 'TEST' || !e.refs.verifies.includes(r.id)) continue;
        covered++;
        if (!evidenceStatus(e.id, e.path, entries).ok) return false;
      }
      if (!covered) return false;
      n++;
    }
    return n > 0;
  };
  const problems = [];
  const warns = [...rows.bad];
  const seen = new Set();
  const pos = new Map(rows.map((r) => [r.feature, r.order]));
  for (const r of rows) {
    if (seen.has(r.feature)) problems.push(`duplicate feature ${r.feature}`);
    seen.add(r.feature);
    if (!byFeat.has(r.feature)) warns.push(`${r.feature}: no spec yet`);
    for (const d of r.deps) {
      if (!pos.has(d)) problems.push(`${r.feature}: unknown dependency ${d}`);
      else if (pos.get(d) === r.order) problems.push(`${r.feature}: dependency ${d} has the same order number (${r.order}); give ${r.feature} a larger number`);
      else if (pos.get(d) > r.order) problems.push(`${r.feature}: dependency ${d} is ordered after it (cycle or wrong order)`);
    }
  }
  const done = new Map(rows.map((r) => [r.feature, isDone(r.feature)]));
  // a dependency that was completed once and is merely stale/edited is not 'not started'
  const evidenced = (feat) => { const sp = byFeat.get(feat); return !!sp && [...ents.values()].some((e) => e.kind === 'TEST' && sp.reqs.some((q) => e.refs.verifies.includes(q.id)) && entries.some((x) => x.test === e.id && x.type === 'green')); };
  let next = null;
  for (const r of rows) {
    const sp = byFeat.get(r.feature);
    const depsOk = r.deps.every((d) => done.get(d));
    const started = sp && [...ents.values()].some((e) => e.kind === 'TEST' && sp.reqs.some((q) => e.refs.verifies.includes(q.id)) && entries.some((x) => x.test === e.id));
    const untouched = r.deps.filter((d) => !done.get(d) && !evidenced(d));
    if (started && untouched.length && !done.get(r.feature)) warns.push(`${r.feature}: started before dependencies are done (${untouched.join(', ')})`);
    if (!next && !done.get(r.feature) && depsOk) next = r.feature;
    const st = sp ? `${sp.tier}${needsLock(sp) ? `:${approvalState(sp)}` : ''}` : 'no-spec';
    out(`${done.get(r.feature) ? '✓' : '·'} ${r.order}. ${r.feature} [${st}]${r.deps.length ? ` ← ${r.deps.join(', ')}` : ''}${r.note ? ` — ${r.note}` : ''}`);
  }
  const orphanReqs = [...new Set(tr.errors.map((e) => /references unknown (REQ-[A-Z0-9-]+)/.exec(e)?.[1]).filter(Boolean))].filter((u) => !specs.some((sp) => sp.reqs.some((r) => prefixOf(r.id) === prefixOf(u))));
  for (const u of orphanReqs) problems.push(`${u} is referenced by tests/code but no spec defines it (write the spec first)`);
  const unlisted = specs.filter((sp) => !pos.has(sp.feature)).map((sp) => sp.feature);
  for (const f of unlisted) warns.push(`${f}: spec is not in plan.md${isDone(f) ? '' : ' and is not done'}`);
  for (const w of warns) out(`  ! ${w}`);
  for (const p of problems) out(`  ✗ ${p}`);
  out(next ? `next: ${next}` : problems.length ? 'next: (fix plan first)' : unlisted.length ? `next: (listed features done; add to plan.md: ${unlisted.join(', ')})` : 'next: (all features done)');
  return problems.length ? 1 : 0;
}

// best-effort reverse import graph (target -> importers) for impact; JS/TS precise, others heuristic (#91)
function importRev() {
  const files = listFiles();
  const set = new Set(files);
  // JSON files are graph nodes only as targets of static JS/TS imports (a shared contract), #145
  const jsonFiles = gitFiles('*.json').filter((f) => !SKIP.test(f) && fs.existsSync(path.join(ROOT, f)));
  for (const j of jsonFiles) set.add(j);
  const rev = jsRev([...files.filter((f) => /\.[cm]?[jt]sx?$/.test(f)), ...jsonFiles]);
  const add = (t, f) => { if (t && t !== f && set.has(t)) { if (!rev.has(t)) rev.set(t, []); if (!rev.get(t).includes(f)) rev.get(t).push(f); } };
  const dir = (f) => path.posix.dirname(f);
  const byDir = new Map();
  for (const f of files) { const d = dir(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  const cImpl = [];
  const javaPkg = new Map();
  for (const g of files) if (g.endsWith('.java')) { const k = /^\s*package\s+([\w.]+)\s*;/m.exec(fs.readFileSync(path.join(ROOT, g), 'utf8'))?.[1] ?? dir(g); if (!javaPkg.has(k)) javaPkg.set(k, []); javaPkg.get(k).push(g); }
  const phpDecl = new Map();
  for (const g of files) if (g.endsWith('.php')) {
    const code = fs.readFileSync(path.join(ROOT, g), 'utf8');
    const ns = /^\s*namespace\s+([\w\\]+)\s*;/m.exec(code)?.[1];
    if (ns) for (const m of code.matchAll(/^\s*(?:abstract\s+|final\s+)*(?:class|interface|trait|enum)\s+(\w+)/gm)) { const q = `${ns}\\${m[1]}`; if (!phpDecl.has(q)) phpDecl.set(q, []); phpDecl.get(q).push(g); }
  }
  const endsWith = (suffix) => files.filter((f) => f === suffix || f.endsWith('/' + suffix));
  // Rust cross-crate `use name::..` resolves by Cargo package name (`-` → `_`), not against every crate's lib.rs (#127)
  const crateBySrc = new Map();
  for (const g of gitFiles('*Cargo.toml')) if (/(^|\/)Cargo\.toml$/.test(g)) {
    const toml = fs.readFileSync(path.join(ROOT, g), 'utf8');
    const pkgName = /^\[package\][^[]*?^\s*name\s*=\s*"([^"]+)"/ms.exec(toml)?.[1];
    const libName = /^\[lib\][^[]*?^\s*name\s*=\s*"([^"]+)"/ms.exec(toml)?.[1];
    const sd = dir(g) === '.' ? 'src' : dir(g) + '/src';
    for (const n of new Set([pkgName?.replace(/-/g, '_'), libName].filter(Boolean))) if (set.has(sd + '/lib.rs')) crateBySrc.set(n, [...(crateBySrc.get(n) ?? []), sd]);
  }
  const stem = (x) => path.posix.basename(x).replace(/\.\w+$/, '');
  const goMods = gitFiles('*go.mod').filter((g) => /(^|\/)go\.mod$/.test(g)).map((g) => {
    const text = fs.readFileSync(path.join(ROOT, g), 'utf8');
    const replacements = [...text.matchAll(/^\s*(?:replace\s+)?([^\s()]+)(?:\s+v[^\s]+)?\s+=>\s+(\.[^\s]+)\s*$/gm)].map((m) => ({ path: m[1], dir: path.posix.normalize(path.posix.join(dir(g), m[2])) }));
    return { dir: dir(g), path: /^\s*module\s+(\S+)/m.exec(text)?.[1], replacements };
  }).filter((m) => m.path);
  // a header and its implementation pair when they share a directory, or are the only same-named .h/.c in the project (#127)
  const cPair = (h, c) => stem(h) === stem(c) && (dir(h) === dir(c) || (files.filter((x) => /\.h(pp|h)?$/.test(x) && stem(x) === stem(h)).length === 1 && files.filter((x) => /\.(c|cc|cpp|cxx)$/.test(x) && stem(x) === stem(c)).length === 1));
  const csNs = new Map(), jlMod = new Map();
  // ProjectReference graph: a using only links to files of projects the importer's project references (transitively); project files, shared props and solutions are graph nodes too (#135)
  const dn = files.some((f) => f.endsWith('.cs')) ? dotnetGraph(ROOT) : null;
  const csOwner = (f) => dn?.ownersOf(f) ?? [];
  const csReach = new Map();
  if (dn) {
    for (const x of [...dn.projs.keys(), ...dn.props, ...dn.sols.keys()]) set.add(x);
    for (const q of dn.projs.values()) for (const r of q.refs) add(r, q.file);
    for (const x of dn.props) for (const q of dn.projs.values()) if (path.posix.dirname(x) === '.' || q.file.startsWith(path.posix.dirname(x) + '/')) add(x, q.file);
    for (const [sf, ms] of dn.sols) for (const m of ms) add(sf, m);
    for (const g of files) if (g.endsWith('.cs')) for (const o of csOwner(g)) add(o.file, g);
    for (const q of dn.projs.values()) csReach.set(q.file, dn.deps(q.file));
  }
  const csVisible = (f, g) => { const of = csOwner(f), og = csOwner(g); return !of.length || !og.length || of.some((a) => og.some((b) => csReach.get(a.file)?.has(b.file))); };
  for (const g of files) {
    if (g.endsWith('.cs')) { const code = fs.readFileSync(path.join(ROOT, g), 'utf8'); const ns = /^\s*namespace\s+([\w.]+)/m.exec(code)?.[1]; if (ns) { const types = [...code.matchAll(/\b(?:class|record|struct|interface|enum)\s+(\w+)/g)].map((m) => m[1]); csNs.set(g, { ns, types }); } }
    else if (g.endsWith('.jl')) for (const m of fs.readFileSync(path.join(ROOT, g), 'utf8').matchAll(/^\s*module\s+(\w+)/gm)) { if (!jlMod.has(m[1])) jlMod.set(m[1], []); jlMod.get(m[1]).push(g); }
  }
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/\.py$/.test(f)) {
      // relative imports resolve against the importing file's package (#111)
      for (const m of src.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import\s+(\([^)]*\)|[^\n#]+)/gm)) {
        let base = dir(f);
        for (let k = 1; k < m[1].length; k++) base = dir(base);
        const sub = m[2].replace(/\./g, '/');
        const root = [base, sub].filter((x) => x && x !== '.').join('/');
        if (sub) for (const c of [`${root}.py`, `${root}/__init__.py`]) add(c, f);
        else add(`${base === '.' ? '' : base + '/'}__init__.py`.replace(/^\//, ''), f);
        for (const n of m[3].replace(/[()]/g, '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => /^\w+$/.test(x))) for (const c of [`${root}/${n}.py`, `${root}/${n}/__init__.py`]) add(c, f);
      }
      for (const m of src.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
        const mod = (m[1] ?? m[2]).replace(/^\.+/, '').replace(/\./g, '/');
        if (mod) for (const c of [mod + '.py', mod + '/__init__.py']) endsWith(c).forEach((t) => add(t, f));
      }
      // `from pkg import submodule` resolves to pkg/submodule.py (#145)
      for (const m of src.matchAll(/^\s*from\s+([\w.]+)\s+import\s+(\([^)]*\)|[^\n#]+)/gm)) {
        const mod = m[1].replace(/\./g, '/');
        for (const n of m[2].replace(/[()]/g, '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => /^\w+$/.test(x))) for (const c of [`${mod}/${n}.py`, `${mod}/${n}/__init__.py`]) endsWith(c).forEach((t) => add(t, f));
      }
    } else if (/\.go$/.test(f)) {
      // package-granular imports narrowed to the files declaring a symbol this file uses (#105); falls back to the whole package
      const declares = (t, names) => { const code = fs.readFileSync(path.join(ROOT, t), 'utf8'); return [...names].some((n) => new RegExp(`^(?:func\\s+(?:\\([^)]*\\)\\s*)?|type\\s+|var\\s+|const\\s+)${n}\\b|^\\s+${n}\\b\\s*(?:=|[A-Za-z*\\[])`, 'm').test(code)); };
      // methods-only files belong to the package API of the types they extend: include them when a hit file declares the receiver type (#145)
      const codeOf = (t) => fs.readFileSync(path.join(ROOT, t), 'utf8');
      const goTypes = (t) => new Set([...codeOf(t).matchAll(/^type\s+(\w+)|^\s+(\w+)\s+(?:struct|interface)\b/gm)].map((x) => x[1] ?? x[2]));
      const goRecv = (t) => [...codeOf(t).matchAll(/^func\s+\(\s*(?:\w+\s+)?\*?\s*(\w+)/gm)].map((x) => x[1]);
      const narrow = (cands, names) => {
        const hit = names.size ? cands.filter((t) => { try { return declares(t, names); } catch { return true; } }) : [];
        if (!hit.length) return cands;
        const tys = new Set(hit.flatMap((t) => { try { return [...goTypes(t)]; } catch { return []; } }));
        const aliases = cands.flatMap((t) => [...codeOf(t).matchAll(/^(?:type\s+|\s+)(\w+)\s*=\s*(\w+)\b/gm)].map((m) => [m[1], m[2]]));
        let grew;
        do {
          grew = false;
          for (const [a, b] of aliases) if (tys.has(a) || tys.has(b)) for (const n of [a, b]) if (!tys.has(n)) { tys.add(n); grew = true; }
        } while (grew);
        return [...new Set([...hit, ...cands.filter((t) => { try { return goRecv(t).some((r) => tys.has(r)); } catch { return false; } })])];
      };
      // import paths are module-relative: map `<module>/x` to `<go.mod dir>/x` (go.mod may live in a subdirectory)
      const owner = goMods.filter((m) => m.dir === '.' || f.startsWith(m.dir + '/')).sort((a, b) => b.dir.length - a.dir.length)[0];
      const goModDir = (imp) => {
        const mappings = [...(owner?.replacements ?? []), ...goMods].filter((m) => imp === m.path || imp.startsWith(m.path + '/'));
        const best = mappings.sort((a, b) => b.path.length - a.path.length)[0];
        return best ? path.posix.join(best.dir, imp.slice(best.path.length).replace(/^\//, '')) : null;
      };
      for (const m of src.matchAll(/(?:(\w+)\s+)?"([\w./-]+)"/g)) {
        const resolved = goModDir(m[2]);
        for (const d of byDir.keys()) if (resolved === d || (resolved === null && d !== '.' && (m[2] === d || m[2].endsWith('/' + d)))) {
          const pkg = (byDir.get(d) ?? []).find((x) => x.endsWith('.go') && !x.endsWith('_test.go'));
          const alias = m[1] && m[1] !== 'import' ? m[1] : pkg && /^\s*package\s+(\w+)/m.exec(codeOf(pkg))?.[1] || m[2].split('/').pop();
          const used = new Set([...src.matchAll(new RegExp(`\\b${alias}\\.([A-Za-z_]\\w*)`, 'g'))].map((x) => x[1]));
          narrow(byDir.get(d).filter((x) => /\.go$/.test(x) && !/_test\.go$/.test(x)), used).forEach((t) => add(t, f));
        }
      }
      const ownPackage = /^\s*package\s+(\w+)/m.exec(src)?.[1];
      const samePackage = (byDir.get(dir(f)) ?? []).filter((x) => /\.go$/.test(x) && !/_test\.go$/.test(x) && /^\s*package\s+(\w+)/m.exec(codeOf(x))?.[1] === ownPackage);
      const used = new Set([...src.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((x) => x[1]));
      // Production callers have the same implicit symbol dependencies as in-package tests.
      const hits = samePackage.filter((t) => t !== f && declares(t, used));
      if (hits.length) narrow(samePackage, used).forEach((t) => add(t, f));
    } else if (/\.rs$/.test(f)) {
      const crateSrc = (x) => x.replace(/\/(src|tests|benches|examples)\/.*$/, '').replace(/^(src|tests|benches|examples)\/.*$/, '');
      const srcDir = (x) => (crateSrc(x) ? crateSrc(x) + '/src' : 'src');
      for (const m of src.matchAll(/^\s*(?:pub\s+)?use\s+(\w+)::([^;]+);/gms)) {
        const root = m[1];
        const bases = root === 'crate' || root === 'self' || root === 'super' ? [srcDir(f)] : (crateBySrc.get(root) ?? []);
        const paths = [];
        const rest = m[2].trim();
        if (rest.startsWith('{')) { let d = 0, cur = ''; for (const ch of rest.slice(1, rest.lastIndexOf('}'))) { if (ch === '{') d++; if (ch === '}') d--; if (ch === ',' && d === 0) { paths.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) paths.push(cur.trim()); } else paths.push(rest);
        for (const p of paths) {
          const segs = p.replace(/\{.*$/s, '').split('::').map((x) => x.trim()).filter((x) => /^\w+$/.test(x));
          for (const b of bases) {
            let cur = b; let hit = false;
            for (const sg of segs) { const c = [`${cur}/${sg}.rs`, `${cur}/${sg}/mod.rs`].find((x) => set.has(x)); if (!c) break; add(c, f); hit = true; cur = c.endsWith('/mod.rs') ? dir(c) : c.replace(/\.rs$/, ''); }
            // an item re-exported from the crate root: link to the file that declares it
            if (!hit && segs.length) for (const x of files) if (x.startsWith(b + '/') && x.endsWith('.rs') && new RegExp(`\\bpub(?:\\([\\w:]+\\))?\\s+(?:fn|struct|enum|trait|const|type|static)\\s+${segs[0]}\\b`).test(fs.readFileSync(path.join(ROOT, x), 'utf8'))) add(x, f);
          }
        }
      }
      if (!/(^|\/)(lib|main|mod)\.rs$/.test(f)) for (const m of src.matchAll(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm)) for (const c of [`${dir(f)}/${m[1]}.rs`, `${dir(f)}/${m[1]}/mod.rs`]) add(c, f);
    } else if (/\.java$/.test(f)) {
      for (const m of src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
        const parts = m[1].split('.');
        if (m[2]) { const pd = parts.join('/'); for (const g of files) if (g.endsWith('.java') && (dir(g) === pd || dir(g).endsWith('/' + pd)) && new RegExp(`\\b${path.posix.basename(g, '.java')}\\b`).test(src)) add(g, f); continue; }
        for (let n = parts.length; n > 0; n--) { const c = endsWith(parts.slice(0, n).join('/') + '.java'); if (c.length) { c.forEach((t) => add(t, f)); break; } }
      }
      // same-package types need no import
      const pk = /^\s*package\s+([\w.]+)\s*;/m.exec(src)?.[1] ?? dir(f);
      for (const g of javaPkg.get(pk) ?? []) if (g !== f && new RegExp(`\\b${path.posix.basename(g, '.java')}\\b`).test(src)) add(g, f);
    } else if (/\.(c|h|cc|cpp|cxx|hpp|hh)$/.test(f)) {
      // quoted includes resolve relative to the includer first, then as a project-relative suffix; angle includes only when they name an existing project path (#127)
      for (const m of src.matchAll(/^\s*#\s*include\s+([<"])([^>"]+)[>"]/gm)) {
        const rel0 = path.posix.normalize(path.posix.join(dir(f), m[2]));
        if (m[1] === '"' && set.has(rel0)) { add(rel0, f); continue; }
        const inc = m[2].replace(/^(\.\/|\.\.\/)+/, '');
        if (m[1] === '<' && !inc.includes('/')) continue;
        endsWith(inc).forEach((t) => add(t, f));
      }
      if (/\.h(pp|h)?$/.test(f)) for (const x of files) if (/\.(c|cc|cpp|cxx)$/.test(x) && cPair(f, x)) add(f, x);
      if (/\.(c|cc|cpp|cxx)$/.test(f)) cImpl.push(f);
    } else if (/\.cs$/.test(f)) {
      // `using Ns;` → files declaring that namespace whose types this file mentions; same-namespace types need no using (#127)
      const own = csNs.get(f)?.ns;
      const usings = new Set([...src.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/gm)].map((m) => m[1]));
      if (own) usings.add(own);
      for (const [g, d] of csNs) if (g !== f && usings.has(d.ns) && csVisible(f, g) && d.types.some((t) => new RegExp(`\\b${t}\\b`).test(src))) add(g, f);
    } else if (/\.jl$/.test(f)) {
      for (const m of src.matchAll(/^\s*include\(\s*"([^"]+)"\s*\)/gm)) add(path.posix.normalize(path.posix.join(dir(f), m[1])), f);
      for (const m of src.matchAll(/^\s*(?:using|import)\s+\.*(\w+)/gm)) (jlMod.get(m[1]) ?? []).forEach((t) => add(t, f));
    } else if (/\.php$/.test(f)) {
      // `use Ns\Class;`, group uses and same-namespace references resolve through declared namespace + class name (#111)
      for (const m of src.matchAll(/^\s*use\s+(?:function\s+|const\s+)?([\w\\]+?)(?:\s+as\s+\w+)?\s*;|^\s*use\s+([\w\\]+)\\\{([^}]*)\}\s*;/gm)) {
        const fqns = m[1] ? [m[1]] : m[3].split(',').map((x) => `${m[2]}\\${x.trim().split(/\s+as\s+/)[0]}`);
        for (const q of fqns) phpDecl.get(q.replace(/^\\/, ''))?.forEach((t) => add(t, f));
      }
      const ns = /^\s*namespace\s+([\w\\]+)\s*;/m.exec(src)?.[1];
      if (ns) for (const [q, ts] of phpDecl) if (q.startsWith(ns + '\\') && !q.slice(ns.length + 1).includes('\\') && new RegExp(`\\b${q.split('\\').pop()}\\b`).test(src)) ts.forEach((t) => add(t, f));
      for (const m of src.matchAll(/(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g)) {
        const p = m[1].replace(/^\//, '');
        add(path.posix.normalize(path.posix.join(dir(f), p)), f);
        endsWith(p.replace(/^(\.\.?\/)+/, '')).forEach((t) => add(t, f));
      }
    }
  }
  // an implementation file is reached by whatever includes its header
  for (const c of cImpl) for (const h of files) if (/\.h(pp|h)?$/.test(h) && cPair(h, c)) for (const imp of rev.get(h) ?? []) add(c, imp);
  return rev;
}

// other-feature REQs whose code/tests import the changed files: their evidence is not re-run by a --changed gate (#104)
function crossImpact(changed) {
  const specs = loadSpecs();
  const reqFeature = new Map();
  for (const sp of specs) for (const r of sp.reqs) reqFeature.set(r.id, sp.feature);
  const all = [...scanEntities(listFiles()).ents.values()];
  const files = [...changed].filter((f) => fs.existsSync(path.join(ROOT, f)) && !f.startsWith('.sdd/'));
  const own = new Set(all.filter((e) => files.includes(e.path)).flatMap((e) => [...e.refs.implements, ...e.refs.verifies]).map((r) => reqFeature.get(r)).filter(Boolean));
  const rev = importRev();
  const seen = new Set(files);
  const queue = [...files];
  while (queue.length) { const f = queue.shift(); for (const d of rev.get(f) ?? []) if (!seen.has(d)) { seen.add(d); queue.push(d); } }
  const hit = new Map();
  for (const e of all) if (seen.has(e.path) && !files.includes(e.path)) for (const r of [...e.refs.verifies, ...e.refs.implements]) { const ft = reqFeature.get(r); if (ft && !own.has(ft)) hit.set(r, ft); }
  return [...hit].map(([req, feature]) => ({ req, feature }));
}

function cmdImpact() {
  const target = pos[1];
  if (!target) { out('usage: impact <REQ-ID|TEST-ID|CODE-ID|file> [--json]'); return 2; }
  const specs = loadSpecs();
  const { ents } = scanEntities(listFiles());
  const reqFeature = new Map();
  for (const sp of specs) for (const r of sp.reqs) reqFeature.set(r.id, sp.feature);
  const all = [...ents.values()];
  let seeds; let reqs;
  if (/^REQ-/.test(target)) {
    if (!reqFeature.has(target)) { out(`IMPACT: unknown REQ ${target}`); return 1; }
    reqs = [target];
    seeds = [...new Set(all.filter((e) => e.refs.implements.includes(target)).map((e) => e.path))];
  } else if (ents.has(target)) {
    const e = ents.get(target);
    reqs = [...new Set([...e.refs.implements, ...e.refs.verifies])];
    seeds = [...new Set(all.filter((x) => x.refs.implements.some((r) => reqs.includes(r))).map((x) => x.path))];
    if (!seeds.length || e.kind === 'CODE') seeds = [...new Set([e.path, ...seeds])];
  } else if (fs.existsSync(path.join(ROOT, target))) {
    seeds = [target.replace(/^\.\//, '')];
    reqs = [...new Set(all.filter((e) => e.path === seeds[0]).flatMap((e) => [...e.refs.implements, ...e.refs.verifies]))];
  } else { out(`IMPACT: unknown target ${target}`); return 1; }
  const rev = importRev();
  const via = new Map(seeds.map((f) => [f, null]));
  const queue = [...seeds];
  while (queue.length) { const f = queue.shift(); for (const d of rev.get(f) ?? []) if (!via.has(d)) { via.set(d, f); queue.push(d); } }
  const reached = [...via.keys()].filter((f) => !seeds.includes(f));
  const entsIn = (f) => all.filter((e) => e.path === f);
  const verifiers = all.filter((e) => e.refs.verifies.some((r) => reqs.includes(r)));
  const affected = new Map();
  const ownFeatures = new Set(reqs.map((r) => reqFeature.get(r)));
  // a header/file without @implements belongs to the features of the same-named implementation files (#111)
  if (!reqs.length) for (const sd of seeds) {
    const st = path.posix.basename(sd).replace(/\.\w+$/, '');
    for (const e of all) if (path.posix.basename(e.path).replace(/\.\w+$/, '') === st) for (const r of [...e.refs.implements, ...e.refs.verifies]) if (reqFeature.get(r)) ownFeatures.add(reqFeature.get(r));
    // an unannotated file belongs to the feature(s) of its annotated siblings in the same directory (#127)
    // only when those siblings agree on one feature: a directory shared by several features says nothing about the file's owner (#145)
    if (!ownFeatures.size) { const sib = new Set(); for (const e of all) if (path.posix.dirname(e.path) === path.posix.dirname(sd)) for (const r of [...e.refs.implements, ...e.refs.verifies]) if (reqFeature.get(r)) sib.add(reqFeature.get(r)); if (sib.size === 1) sib.forEach((x) => ownFeatures.add(x)); }
  }
  for (const f of via.keys()) for (const e of entsIn(f)) for (const r of [...e.refs.verifies, ...e.refs.implements]) if (!reqs.includes(r)) { if (!affected.has(r)) affected.set(r, new Set()); affected.get(r).add(e.id + ' (' + f + ')'); }
  const sameFeature = [...affected.keys()].filter((r) => ownFeatures.has(reqFeature.get(r)));
  for (const r of sameFeature) affected.delete(r);
  const chain = (f) => { const c = [f]; while (via.get(c[c.length - 1])) c.push(via.get(c[c.length - 1])); return c.join(' ← '); };
  const result = {
    target, reqs, impl: seeds, verifiedBy: verifiers.map((e) => e.id), reachedFiles: reached,
    sameFeatureReqs: sameFeature,
    otherReqs: [...affected].map(([r, v]) => ({ req: r, feature: reqFeature.get(r) ?? null, via: [...v] })),
    reachedTests: reached.filter((f) => entsIn(f).some((e) => e.refs.verifies.length) || TEST_FILE.test(f)),
  };
  if (flags.json) { out(JSON.stringify(result)); return 0; }
  const cap = (a, n = 8) => a.slice(0, n).join(', ') + (a.length > n ? `, … +${a.length - n} more` : '');
  out(`IMPACT ${target}${reqs.length && target !== reqs[0] ? ` (${cap(reqs)})` : ''}`);
  const seedIsTest = seeds.length > 0 && seeds.every((s) => TEST_FILE.test(s) || (entsIn(s).length > 0 && entsIn(s).every((e) => e.kind === 'TEST')));
  out(`  ${seedIsTest ? 'test' : 'impl'}: ${seeds.join(', ') || '(none)'}`);
  if (verifiers.length) out(`  verified by: ${cap(verifiers.map((e) => e.id))}`);
  out(`  reaches ${reached.length} file(s) via imports${result.reachedTests.length ? `; tests: ${cap(result.reachedTests)}` : ''}`);
  if (sameFeature.length) out(`  same feature: ${sameFeature.length} other REQ(s) (${sameFeature.slice(0, 4).join(', ')}${sameFeature.length > 4 ? ', …' : ''})`);
  const perFeature = new Map();
  for (const o of result.otherReqs) perFeature.set(o.feature ?? '?', (perFeature.get(o.feature ?? '?') ?? 0) + 1);
  if (perFeature.size) out(`  other features: ${[...perFeature].map(([f, n]) => `${f} (${n})`).join(', ')}`);
  for (const o of result.otherReqs.slice(0, 8)) out(`  ! other feature ${o.req}${o.feature ? ` [${o.feature}]` : ''}: ${o.via.slice(0, 3).join(', ')} — chain ${chain(o.via[0].replace(/^.*\((.*)\)$/, '$1'))}`);
  if (result.otherReqs.length > 8) out(`  … +${result.otherReqs.length - 8} more`);
  return 0;
}

const cmds = { review: cmdReview, init: cmdInit, approve: cmdApprove, guard: cmdGuard, tdd: cmdTdd, trace: cmdTrace, gate: cmdGate, status: cmdStatus, plan: cmdPlan, impact: cmdImpact };
const fn = cmds[pos[0]];
// a mistyped flag (`gate --changd`) must not silently run the full gate (#146)
// known flags = every flags.<name> / flags['<name>'] this script reads
const KNOWN_FLAGS = new Set([...fs.readFileSync(new URL(import.meta.url), 'utf8').matchAll(/\bflags(?:\.([\w-]+)|\['([\w-]+)'\])/g)].map((m) => m[1] ?? m[2]).concat(['help']));
const badFlags = Object.keys(flags).filter((k) => !KNOWN_FLAGS.has(k));
if (fn && badFlags.length) {
  out(`unknown flag${badFlags.length > 1 ? 's' : ''}: ${badFlags.map((k) => '--' + k).join(', ')} (known: ${[...KNOWN_FLAGS].map((k) => '--' + k).join(' ')})`);
  process.exit(2);
}
if (!fn) {
  out('usage: sdd.mjs init | review template <feature> | review check <file> --feature <f> | approve prepare|record <feature> | guard | tdd red|green|refactor <TEST-ID> | tdd stub <TEST-ID> | tdd check | trace [--baseline] | gate [--changed] [--no-run] | status | plan | impact <REQ|TEST|CODE|file> [--json]   [--root dir]\n  tdd red: tdd red --characterization "<reason>" records a data-only/characterization test that cannot fail without implementation (weak Red); --expect <text> requires that text in the failure; --allow-setup-red accepts a stub-in-setup Red; --retest "<reason>" re-records a weak Red after correcting a wrong test expectation (needs a previous Red/Green and a changed test); --missing-module accepts a Red caused by the test own not-yet-created import (non-weak); approve record --by ai:<reviewer> needs --review <path|summary>');
  process.exit(2);
}
process.exit(fn() ?? 0);
