import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const script=path.resolve(root,'../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs');
const generated=path.join(root,'src/box.ts');
fs.rmSync(generated,{force:true});
try {
  for(const args of [['init'],['tdd','stub','TEST-STUB-001']]){
    const result=spawnSync(process.execPath,[script,'--root',root,...args],{encoding:'utf8'});
    assert.equal(result.status,0,result.stdout+result.stderr);
  }
  const source=fs.readFileSync(generated,'utf8');
  assert.match(source,/first\(/);
  assert.match(source,/second\(/);
  console.log('BUG reproduced: TEST-STUB-001 also generated second(), used only by TEST-STUB-002');
}finally{
  fs.rmSync(generated,{force:true});
}
