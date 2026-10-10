import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const script=fileURLToPath(new URL('../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs',import.meta.url));
for(const args of [['init'],['tdd','red','TEST-PROBE-001','--characterization','TODO should never provide evidence'],['tdd','green','TEST-PROBE-001'],['gate']]) {
  const result=spawnSync(process.execPath,[script,'--root',root,...args],{cwd:root,encoding:'utf8'});
  console.log(args.join(' '),`exit=${result.status}`,result.stdout.trim());
}
