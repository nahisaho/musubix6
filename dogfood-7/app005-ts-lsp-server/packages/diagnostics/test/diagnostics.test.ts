import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnose,actions} from '../src/index.ts';
import {createStore,open,change,close,snapshot} from '../../text/src/index.ts';
import {applyWorkspaceEdit} from '../../navigation/src/index.ts';
const document = (text:string) => { const s = createStore(); open(s,'u',text,1); return s; };

/** @id TEST-DIAG-001 @verifies REQ-DIAG-001 */
test('TEST-DIAG-001 syntax diagnostic', () => {
  const d = diagnose(document('print 1'),'u').items[0];
  assert.deepEqual([d.code,d.severity,d.start,d.end], ['missing-semicolon',1,7,7]);
});
/** @id TEST-DIAG-002 @verifies REQ-DIAG-002 */
test('TEST-DIAG-002 undefined', () => {
  const d = diagnose(document('print absent;'),'u').items[0];
  assert.deepEqual([d.code,d.start,d.end], ['undefined-name',6,12]);
});
/** @id TEST-DIAG-003 @verifies REQ-DIAG-003 */
test('TEST-DIAG-003 duplicate', () => {
  const ds = diagnose(document('let x = 1;\nlet x = 2;'),'u').items;
  assert.equal(ds[0].code,'duplicate-name');
  assert.equal(ds[0].start,15);
});
/** @id TEST-DIAG-004 @verifies REQ-DIAG-004 */
test('TEST-DIAG-004 scope', () => {
  assert.equal(diagnose(document('{\n} \n}'),'u').items[0].code,'scope');
});
/** @id TEST-DIAG-005 @verifies REQ-DIAG-005 */
test('TEST-DIAG-005 semicolon fix before comment', () => {
  const s = document('print 1 // hi');
  const fix = actions(s,'u')[0];
  assert.equal(applyWorkspaceEdit(s,fix.edit,2).text,'print 1; // hi');
  assert.equal(diagnose(s,'u').items.length,0);
});
/** @id TEST-DIAG-006 @verifies REQ-DIAG-006 */
test('TEST-DIAG-006 typo fix', () => {
  const s = document('let count = 1;\nprint coun;');
  const a = actions(s,'u');
  assert.equal(a.length,1);
  assert.equal(applyWorkspaceEdit(s,a[0].edit,2).text,'let count = 1;\nprint count;');
  assert.equal(actions(document('let cat = 1;\nlet bat = 2;\nprint hat;'),'u').length,0);
});
/** @id TEST-DIAG-007 @verifies REQ-DIAG-007 */
test('TEST-DIAG-007 stale quick fix', () => {
  const s = document('print 1'); const a = actions(s,'u')[0];
  change(s,'u',2,[{start:0,end:7,text:'print 2;'}]);
  assert.throws(() => applyWorkspaceEdit(s,a.edit,3), /version/);
  assert.equal(snapshot(s,'u').text,'print 2;');
  close(s,'u'); open(s,'u','print 3;',1);
  assert.throws(() => applyWorkspaceEdit(s,a.edit,2), /generation/);
  assert.equal(snapshot(s,'u').text,'print 3;');
});
/** @id TEST-DIAG-008 @verifies REQ-DIAG-008 */
test('TEST-DIAG-008 refreshed diagnostics', () => {
  const s = document('print bad;');
  assert.equal(diagnose(s,'u').items.length,1);
  change(s,'u',2,[{start:0,end:10,text:'print 1;'}]);
  const ds = diagnose(s,'u');
  assert.equal(ds.version,2); assert.deepEqual(ds.items,[]);
});
/** @id TEST-DIAG-009 @verifies REQ-DIAG-009 */
test('TEST-DIAG-009 closed URI cache collection', async () => {
  const {spawnSync} = await import('node:child_process');
  const diagnosticsUrl = new URL('../src/index.ts',import.meta.url).href;
  const textUrl = new URL('../../text/src/index.ts',import.meta.url).href;
  const result = spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',`
    import {diagnose} from ${JSON.stringify(diagnosticsUrl)};
    import {createStore,open,close} from ${JSON.stringify(textUrl)};
    import assert from 'node:assert/strict';
    const s = createStore(); global.gc(); const baseline = process.memoryUsage().heapUsed;
    for(let i=0;i<20;i++) {
      const uri = String(i); open(s,uri,'//'+'x'.repeat(750000)+i,1);
      diagnose(s,uri); close(s,uri);
    }
    global.gc();
    assert.equal(s.documents.size,0);
    assert.ok(process.memoryUsage().heapUsed-baseline < 6000000,'closed cache retained text');
  `],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
/** @id TEST-DIAG-010 @verifies REQ-DIAG-010 */
test('TEST-DIAG-010 server facade characterization', async () => {
  const {LanguageServer} = await import('../src/index.ts');
  const server = new LanguageServer();
  server.open('workspace','let count = 1;\nprint coun',1);
  const typo = server.actions('workspace').find(a => a.title === 'Replace with count')!;
  server.apply(typo.edit,2);
  const semi = server.actions('workspace')[0];
  server.apply(semi.edit,3);
  assert.deepEqual(server.diagnostics('workspace').items,[]);
  assert.deepEqual(server.definition('workspace',21),{uri:'workspace',start:4,end:9});
  const renamed = server.rename('workspace',4,'value',3)!;
  assert.equal(server.apply(renamed,4).text,'let value = 1;\nprint value;');
  assert.equal(server.close('workspace'),true);
});
