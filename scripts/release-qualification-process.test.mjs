import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execute, cleanEnvironment, waitForProcessExit } from './release-qualification-io.mjs';

const env = cleanEnvironment(process.env, process.env.PATH);
const run = (program, options = {}) => execute({ command: [process.execPath, '-e', program],
  cwd: process.cwd(), env, timeoutMs: 10000, ...options });

test('exit0', async () => {
  const result = await run('process.stdout.write("out");process.stderr.write("err")');
  assert.equal(result.exit, 0);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
  assert.equal(result.signal, null);
});
test('exit17', async () => {
  const result = await run('process.stdout.write("out");process.stderr.write("err");process.exit(17)');
  assert.equal(result.exit, 17);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
});
test('timeout', async () => {
  const result = await run('setInterval(()=>{},1000)', { timeoutMs: 150 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.exit, 0);
});
test('output-budget', async () => {
  const result = await run('process.stdout.write("x".repeat(8192));setInterval(()=>{},1000)', { maxBytes: 1024 });
  assert.equal(result.outputLimit, true);
  assert.notEqual(result.exit, 0);
});
test('descendant-cleanup', async t => {
  const result = await run('const {spawn}=require("child_process");const child=spawn(process.execPath,' +
    '["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});child.unref();console.log(child.pid)');
  assert.equal(result.exit, 0);
  const pid = Number(result.stdout.trim());
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  t.after(() => {
    try { process.kill(pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
  await assert.doesNotReject(waitForProcessExit(pid), 'ordinary descendant remains executable after bounded cleanup');
});
