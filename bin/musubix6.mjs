#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsSrc = join(root, '.github', 'skills');
/** @id CODE-HOST-005 @implements REQ-HOST-005 */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

const skills = () => readdirSync(skillsSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

const usage = () => console.log(`musubix6 ${pkg.version}
Usage:
  musubix6 init [dir] [--host copilot|claude|both] [--force] [--only a,b]
                                             copy skills (default dir: ., host: copilot)
                                             copilot: .github/skills; claude: .claude/skills
                                             agent-watchdog is copilot-only
  musubix6 list                               list bundled skills
  musubix6 sdd <args...>                      run the lean-sdd-tdd CLI (sdd.mjs)
  musubix6 --version`);

function invalid(message) {
  console.error(message);
  process.exit(2);
}

/** @id CODE-HOST-002 @implements REQ-HOST-002 */
function parseInit(args) {
  let dir;
  let host = 'copilot';
  let only = null;
  let force = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') {
      force = true;
    } else if (arg === '--host' || arg === '--only') {
      const value = args[++i];
      if (!value || value.startsWith('-') || !value.trim()) {
        invalid(arg === '--only' ? '--only requires a non-empty comma-separated skill list' :
          '--host requires a host: copilot, claude or both');
      }
      if (seen.has(arg)) invalid(`repeated option: ${arg}`);
      seen.add(arg);
      if (arg === '--host') {
        if (!['copilot', 'claude', 'both'].includes(value)) invalid(`unknown host: ${value}`);
        host = value;
      } else {
        only = value.split(',').map(s => s.trim()).filter(Boolean);
        if (!only.length) invalid('--only requires a non-empty comma-separated skill list');
      }
    } else if (arg.startsWith('-')) {
      invalid(`unknown option: ${arg}; supported init options: --host copilot|claude|both, --force, --only a,b`);
    } else if (dir !== undefined) {
      invalid(`multiple destinations: ${dir}, ${arg}`);
    } else {
      dir = arg;
    }
  }
  const all = skills();
  const unknown = (only || []).filter(s => !all.includes(s));
  if (unknown.length) invalid(`unknown skill: ${unknown.join(', ')}`);
  if (host !== 'copilot' && only?.includes('agent-watchdog')) {
    invalid(`agent-watchdog is copilot-only; incompatible with --host ${host}`);
  }
  return { dir: resolve(dir || '.'), host, selected: only || all, force };
}

/** @id CODE-HOST-003 @implements REQ-HOST-003 */
function copySkill(name, dest, force) {
  const to = join(dest, name);
  if (existsSync(to) && !force) {
    console.log(`skip ${name} (exists; use --force to overwrite): ${to}`);
    return;
  }
  cpSync(join(skillsSrc, name), to, { recursive: true, force: true });
  console.log(`installed ${name}: ${to}`);
}

/** @id CODE-HOST-001 @implements REQ-HOST-001 */
function init(args) {
  const { dir, host, selected, force } = parseInit(args);
  const targets = host === 'both' ? ['copilot', 'claude'] : [host];
  for (const target of targets) {
    const dest = join(dir, target === 'copilot' ? '.github' : '.claude', 'skills');
    mkdirSync(dest, { recursive: true });
    for (const name of selected) {
      if (target === 'claude' && name === 'agent-watchdog') {
        console.error('skip agent-watchdog for claude (copilot-only)');
        continue;
      }
      copySkill(name, dest, force);
    }
  }
}

if (!cmd || cmd === '-h' || cmd === '--help') usage();
else if (cmd === '-v' || cmd === '--version') console.log(pkg.version);
else if (cmd === 'list') skills().forEach((s) => console.log(s));
else if (cmd === 'sdd') {
  const r = spawnSync(process.execPath, [join(skillsSrc, 'lean-sdd-tdd', 'scripts', 'sdd.mjs'), ...rest], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else if (cmd === 'init') {
  init(rest);
} else { usage(); process.exit(2); }
