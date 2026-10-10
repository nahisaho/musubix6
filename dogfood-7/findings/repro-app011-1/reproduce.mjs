import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const script=fileURLToPath(new URL('../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs',import.meta.url));
const hash=createHash('sha256').update(readFileSync(new URL('.sdd/specs/probe.md',import.meta.url))).digest('hex');
writeFileSync(new URL('review.md',import.meta.url),`spec: sha256:${hash}\nverdict: pass\nopen: 0\n\n| ID | Severity | Where | Status |\n|---|---|---|---|\n| R1 | high | src/index.ts:1 | Open (awaiting fix) |\n`);
for(const args of [['review','check','review.md','--feature','probe'],['approve','record','probe','--by','ai:independent-reviewer','--review','review.md']]) {
  const result=spawnSync(process.execPath,[script,'--root',root,...args],{cwd:root,encoding:'utf8'});
  console.log(args.join(' '),`exit=${result.status}`,result.stdout.trim());
}
