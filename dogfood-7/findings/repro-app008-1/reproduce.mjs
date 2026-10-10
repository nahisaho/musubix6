import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const fixture = fileURLToPath(new URL('.', import.meta.url));
const script = resolve(fixture, '../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs');
const source = join(fixture, 'packages/worker/answer.mjs');
const implementation = n => `/** @id CODE-NESTED-001 @implements REQ-NESTED-001 */\nexport const answer = () => ${n};\n`;
function run(args, expected) {
  const result = spawnSync(process.execPath, [script, '--root', fixture, ...args], { encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  if (result.status !== expected) throw new Error(`${args.join(' ')}: expected exit ${expected}, got ${result.status}`);
  return result.status;
}
writeFileSync(source, implementation(0));
run(['tdd', 'red', 'TEST-NESTED-001'], 0);
writeFileSync(source, implementation(1));
run(['tdd', 'green', 'TEST-NESTED-001'], 0);
writeFileSync(source, implementation(0) + `// dirty regression ${Date.now()}\n`);
try {
  const changed = run(['gate', '--changed'], 0);
  const full = run(['gate'], 1);
  console.log(JSON.stringify({ changedExit: changed, fullExit: full }));
} finally { writeFileSync(source, implementation(0)); }
