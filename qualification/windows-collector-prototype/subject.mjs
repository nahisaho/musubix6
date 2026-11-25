import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const [role, directory] = process.argv.slice(2);
const script = fileURLToPath(import.meta.url);
const deadline = Date.now() + 15000;
const record = { role, pid: process.pid, parentPid: process.ppid, births: [],
  cwd: process.cwd(), fixtureRoot: fs.realpathSync(directory) };
if (path.resolve(record.cwd).toLowerCase() !== path.resolve(record.fixtureRoot).toLowerCase())
  throw new Error('SUBJECT_PRIVATE_CWD');
const save = () => fs.writeFileSync(path.join(directory, `${role}.json`), JSON.stringify(record) + '\n', { flag: 'wx' });
const expiry = setTimeout(() => { process.stderr.write(`SUBJECT_DEADLINE:${role}\n`); process.exit(17); }, Math.max(1, deadline - Date.now()));
const finish = () => { clearTimeout(expiry); save(); if (process.connected) process.disconnect(); };

function syncChild(childRole) {
  const child = spawnSync(process.execPath, [script, childRole, directory], {
    encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), shell: false,
  });
  if (child.error || child.status !== 0 || child.signal !== null) throw new Error(`CHILD_FAILED:${childRole}`);
  const reported = JSON.parse(child.stdout);
  if (reported.role !== childRole || reported.pid !== child.pid || reported.parentPid !== process.pid)
    throw new Error(`CHILD_IDENTITY:${childRole}`);
  record.births.push({ role: childRole, pid: child.pid });
}

try {
  if (role === 'root') {
    syncChild('quick');
    syncChild('nested');
    const allocator = fork(script, ['allocator', directory], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    record.births.push({ role: 'allocator', pid: allocator.pid });
    await new Promise((resolve, reject) => {
      allocator.once('error', reject);
      allocator.once('message', message => {
        if (message?.kind !== 'allocated' || message.pid !== allocator.pid) return reject(new Error('ALLOCATOR_IDENTITY'));
        allocator.send({ kind: 'release' });
      });
      allocator.once('exit', (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error('ALLOCATOR_EXIT')));
    });
    const survivor = fork(script, ['survivor', directory], { detached: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    record.births.push({ role: 'survivor', pid: survivor.pid });
    await new Promise((resolve, reject) => {
      survivor.once('error', reject);
      survivor.once('message', message => message?.kind === 'ready' && message.pid === survivor.pid
        ? resolve() : reject(new Error('SURVIVOR_IDENTITY')));
    });
    survivor.disconnect();
    survivor.unref();
    finish();
    process.exit(0);
  } else if (role === 'nested') {
    syncChild('grandchild'); finish(); process.stdout.write(JSON.stringify(record) + '\n');
  } else if (role === 'quick' || role === 'grandchild') {
    finish(); process.stdout.write(JSON.stringify(record) + '\n');
  } else if (role === 'allocator') {
    const memory = Buffer.allocUnsafe(67108864);
    memory.fill(0x5a);
    record.touchedBytes = memory.byteLength;
    record.residentBytes = String(process.memoryUsage().rss);
    process.send({ kind: 'allocated', pid: process.pid });
    await new Promise(resolve => process.once('message', message => {
      if (message?.kind !== 'release') throw new Error('ALLOCATOR_RELEASE');
      if (memory[0] !== 0x5a || memory[memory.length - 1] !== 0x5a) throw new Error('TOUCH_CONTROL');
      resolve();
    }));
    finish();
  } else if (role === 'survivor') {
    process.send({ kind: 'ready', pid: process.pid });
    await new Promise((resolve, reject) => {
      let watcher;
      const check = () => {
        try {
          const marker = fs.readFileSync(path.join(directory, 'root-closed.json'));
          const closed = JSON.parse(marker);
          if (closed.pid !== record.parentPid) throw new Error('ROOT_CLOSURE_IDENTITY');
          record.parentGone = true;
          record.rootMarkerSha256 = createHash('sha256').update(marker).digest('hex');
          watcher.close(); resolve(); return;
        } catch (error) {
          if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
            watcher.close(); reject(error);
          }
        }
      };
      watcher = fs.watch(directory, check);
      watcher.once('error', error => { watcher.close(); reject(error); });
      check();
    });
    finish();
  } else throw new Error('UNKNOWN_ROLE');
} catch (error) {
  clearTimeout(expiry);
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 18;
  if (process.connected) process.disconnect();
}
