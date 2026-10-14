#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsSrc = join(root, '.github', 'skills');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

const skills = () => readdirSync(skillsSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

const usage = () => console.log(`musubix6 ${pkg.version}
Usage:
  musubix6 init [dir] [--force] [--only a,b]  copy skills into <dir>/.github/skills (default: .)
  musubix6 list                               list bundled skills
  musubix6 sdd <args...>                      run the lean-sdd-tdd CLI (sdd.mjs)
  musubix6 --version`);

if (!cmd || cmd === '-h' || cmd === '--help') usage();
else if (cmd === '-v' || cmd === '--version') console.log(pkg.version);
else if (cmd === 'list') skills().forEach((s) => console.log(s));
else if (cmd === 'sdd') {
  const r = spawnSync(process.execPath, [join(skillsSrc, 'lean-sdd-tdd', 'scripts', 'sdd.mjs'), ...rest], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else if (cmd === 'init') {
  const force = rest.includes('--force');
  const oi = rest.indexOf('--only');
  const only = oi >= 0 ? (rest[oi + 1] || '').split(',').filter(Boolean) : null;
  const dir = rest.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1)) || '.';
  const dest = join(resolve(dir), '.github', 'skills');
  const all = skills();
  const unknown = (only || []).filter((s) => !all.includes(s));
  if (unknown.length) { console.error(`unknown skill: ${unknown.join(', ')}`); process.exit(2); }
  mkdirSync(dest, { recursive: true });
  for (const s of only || all) {
    const to = join(dest, s);
    if (existsSync(to) && !force) { console.log(`skip ${s} (exists; use --force to overwrite)`); continue; }
    cpSync(join(skillsSrc, s), to, { recursive: true, force: true });
    console.log(`installed ${s}`);
  }
} else { usage(); process.exit(2); }
