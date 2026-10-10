import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(root, '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs');
const target = path.join(root, 'pkg/pkg_stub.go');
const original = 'package pkg\n\n// This is real user code, despite its filename.\nfunc Keep() int { return 73 }\n';
fs.writeFileSync(target, original);
try {
  for (const args of [['init'], ['tdd', 'stub', 'TEST-OVERWRITE-001']]) {
    const result = spawnSync(process.execPath, [skill, '--root', root, ...args], { cwd: root, encoding: 'utf8' });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) throw new Error(`sdd exited ${result.status}`);
  }
  const actual = fs.readFileSync(target, 'utf8');
  process.stdout.write(actual);
  if (actual.includes('func Keep()')) throw new Error('Defect did not reproduce: existing code was preserved');
  console.log('REPRODUCED: real Keep() implementation deleted; fixture restored.');
} finally {
  fs.writeFileSync(target, original);
}
