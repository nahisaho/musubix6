import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const fileSha = file => sha(fs.readFileSync(file));
// Only these non-secret execution settings may enter manifests or child environments.
export const EXECUTION_ENV_KEYS = [
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ',
  'JAVA_HOME', 'GRADLE_HOME', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'RUSTUP_AUTO_INSTALL',
  'DOTNET_ROOT', 'DOTNET_ROOT_X64', 'DOTNET_NOLOGO', 'DOTNET_CLI_TELEMETRY_OPTOUT', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE',
  'JULIA_DEPOT_PATH', 'JULIA_PROJECT', 'JULIA_LOAD_PATH', 'R_HOME', 'R_LIBS', 'R_LIBS_USER',
  'GEM_HOME', 'GEM_PATH', 'MIX_HOME', 'HEX_HOME', 'PYTHONNOUSERSITE', 'PYTHONDONTWRITEBYTECODE',
  'MUSUBIX_DIAGNOSTICS_TEST_VENV', 'MUSUBIX_TEST_TSC', 'SDD_R34_TYPESCRIPT', 'QUALIFY_PROSE_PYTHON',
  'NO_COLOR', 'npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_cache',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT',
];
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const equal = (a, b) => assert.deepEqual(a, b);
export function mapStrings(value, transform) {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, transform));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]));
  return value;
}
export const ensure = (condition, message) => assert.ok(condition, message);
export const inside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
export function canonicalDestination(file) {
  let ancestor = path.resolve(file);
  const missing = [];
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    ensure(parent !== ancestor, 'output ancestor unavailable');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
export function externalOutput(source, output) {
  ensure(!inside(fs.realpathSync(source), canonicalDestination(output)), 'output resolves inside candidate source');
}
export const mkdir = directory => fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
export function save(file, value, exclusive = true) {
  mkdir(path.dirname(file));
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n',
    { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
  return { path: path.resolve(file), sha256: fileSha(file) };
}
export function readRef(ref) {
  ensure(ref && path.isAbsolute(ref.path), 'absolute retained log path required');
  equal(fileSha(ref.path), ref.sha256);
  return fs.readFileSync(ref.path, 'utf8');
}
export async function verdict(action) {
  try { return { status: 'PASS', errors: [], ...await action() }; }
  catch (error) { return { status: 'FAIL', errors: [String(error.message)] }; }
}
export function fingerprint(file, ancestors = new Set()) {
  const stat = fs.lstatSync(file);
  const real = fs.realpathSync(file);
  const entry = { path: path.resolve(file), mode: stat.mode & 0o777 };
  if (stat.isSymbolicLink()) {
    ensure(!ancestors.has(real), `cyclic symlink: ${file}`);
    return { ...entry, link: fs.readlinkSync(file), target: fingerprint(real, ancestors) };
  }
  if (stat.isFile()) return { ...entry, sha256: fileSha(file), bytes: stat.size };
  ensure(stat.isDirectory(), `unsupported candidate entry: ${file}`);
  ensure(!ancestors.has(real), `cyclic directory: ${file}`);
  const seen = new Set([...ancestors, real]);
  const entries = fs.readdirSync(file).sort().map(name => {
    const child = fingerprint(path.join(file, name), seen);
    // Relative tree names make independent copies comparable without losing link destinations.
    return { ...child, path: name };
  });
  return { ...entry, entries, sha256: sha(JSON.stringify(entries)) };
}
export function npmAncestors(root) {
  const rows = [];
  for (let directory = path.resolve(root);; directory = path.dirname(directory)) {
    const file = path.join(directory, '.npmrc');
    rows.push({ path: file, exists: fs.existsSync(file), sha256: fs.existsSync(file) ? fileSha(file) : null });
    if (path.dirname(directory) === directory) return rows;
  }
}
export function cleanEnvironment(environment = {}, runtimePath, home) {
  const env = Object.fromEntries(EXECUTION_ENV_KEYS.filter(key => environment[key] !== undefined)
    .map(key => [key, environment[key]]));
  if (runtimePath) env.PATH = runtimePath;
  if (home) {
    env.HOME = home;
    env.USERPROFILE = home;
    env.npm_config_userconfig = path.join(home, '.npmrc');
    env.npm_config_globalconfig = path.join(home, 'global.npmrc');
    env.npm_config_cache = path.join(home, 'npm-cache');
    env.GIT_CONFIG_GLOBAL = path.join(home, 'global.gitconfig');
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_TERMINAL_PROMPT = '0';
    env.TMPDIR = path.join(home, 'work');
    env.TMP = env.TMPDIR;
    env.TEMP = env.TMPDIR;
    mkdir(env.TMPDIR);
    for (const name of ['.npmrc', 'global.npmrc', 'global.gitconfig']) {
      const file = path.join(home, name);
      if (!fs.existsSync(file)) save(file, '');
      ensure(fs.readFileSync(file, 'utf8') === '', `private execution config changed: ${file}`);
    }
  }
  return { ...env, NO_COLOR: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1',
    DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };
}

/** @id CODE-RELQ-CACHE-001 @implements REQ-RELQ-004 */
export function executionEnvironment(environment, runtimePath, home) {
  const env = cleanEnvironment(environment, runtimePath, home);
  const cacheRoot = path.join(home, 'execution-cache');
  env.npm_config_cache = path.join(cacheRoot, 'npm');
  for (const key of ['CARGO_HOME', 'JULIA_DEPOT_PATH']) {
    if (env[key] === undefined) continue;
    const seeds = key === 'JULIA_DEPOT_PATH' ? env[key].split(path.delimiter) : [env[key]];
    env[key] = seeds.map((seed, index) => {
      ensure(path.isAbsolute(seed) && fs.statSync(seed).isDirectory(), `absolute existing cache seed required: ${key}`);
      const real = fs.realpathSync(seed);
      ensure(!inside(real, canonicalDestination(cacheRoot)), 'writable cache cannot be inside its seed');
      const checkLinks = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isSymbolicLink()) ensure(!path.isAbsolute(fs.readlinkSync(file)) && inside(real, fs.realpathSync(file)),
            `cache seed requires internal relative symlinks: ${file}`);
          else if (entry.isDirectory()) checkLinks(file);
        }
      };
      checkLinks(seed);
      const destination = path.join(cacheRoot, key, String(index));
      ensure(!fs.existsSync(destination), 'cache output already exists');
      mkdir(path.dirname(destination));
      fs.cpSync(seed, destination, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
      return destination;
    }).join(path.delimiter);
  }
  mkdir(cacheRoot);
  return { env, cacheRoot };
}

export function processState(stat) {
  const end = stat.lastIndexOf(')');
  ensure(/^\d+ \(/.test(stat) && end > 0 && /^ [RSDZTXtKWPI] /.test(stat.slice(end + 1)),
    'unparseable Linux process stat');
  return stat[end + 2];
}

/** @id CODE-RELQ-PROCESS-001 @implements REQ-RELQ-003 */
export async function waitForProcessExit(pid, timeoutMs = 3000, effects = {}) {
  const kill = effects.kill || process.kill;
  const readStat = effects.readStat || (pid => fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return; throw error; }
    try { if (processState(readStat(pid)) === 'Z') return; }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`ordinary descendant ${pid} remains executable after bounded cleanup`);
}

/** @id CODE-RELQ-TERMINATION-001 @implements REQ-RELQ-003 */
export async function withTerminationSignal(action) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);
  try {
    return await action(controller.signal);
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
  }
}

export async function execute({ command, cwd, env, timeoutMs = 120000, maxBytes = 32 * 1024 * 1024,
  signal, trackDescendants = false }, effects = {}) {
  ensure(Array.isArray(command) && command.length > 0 && command.every(x => typeof x === 'string'), 'argv required');
  ensure(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, 'positive execution budget required');
  ensure(!signal?.aborted, 'execution cancelled before spawn');
  ensure(!trackDescendants || process.platform === 'linux', 'owned descendant tracking requires Linux');
  if (trackDescendants) {
    fs.readFileSync('/proc/self/stat', 'utf8');
    fs.readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8');
  }
  return new Promise(resolve => {
    const startedAt = new Date().toISOString();
    const child = (effects.spawn || spawn)(command[0], command.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = effects.kill || process.kill;
    const schedule = effects.setTimeout || setTimeout, cancel = effects.clearTimeout || clearTimeout;
    let stdout = '', stderr = '', bytes = 0, timedOut = false, outputLimit = false, error = null;
    let escalation, completionTimer, ownershipTimer, terminating = false, settled = false;
    const owned = new Map();
    const identity = pid => {
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
        ensure(/^[0-9]+$/.test(fields[19]), 'unparseable owned process identity');
        return { start: fields[19], state: fields[0] };
      } catch (failure) { if (failure.code === 'ENOENT' || failure.code === 'ESRCH') return null; throw failure; }
    };
    const rootStart = trackDescendants ? identity(child.pid)?.start : null;
    const capture = pid => {
      const current = identity(pid);
      if (!current || current.state === 'Z') return;
      if (owned.has(pid)) ensure(owned.get(pid) === current.start, 'owned process identity changed');
      owned.set(pid, current.start);
      ensure(owned.size <= 4096, 'owned descendant count budget exceeded');
      let children;
      try { children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim(); }
      catch (failure) { if (failure.code === 'ENOENT' || failure.code === 'ESRCH') return; throw failure; }
      if (children) for (const value of children.split(/\s+/)) {
        const id = Number(value);
        ensure(Number.isSafeInteger(id) && id > 1, 'invalid owned descendant PID');
        capture(id);
      }
    };
    const signalOwned = value => {
      for (const [pid, start] of [...owned].reverse()) {
        const current = identity(pid);
        if (!current || current.start !== start || current.state === 'Z') continue;
        try { kill(pid, value); }
        catch (failure) { if (failure.code !== 'ESRCH') throw failure; }
      }
    };
    const ownershipFailure = failure => {
      error = [error, `owned process cleanup: ${failure.code || failure.message}`].filter(Boolean).join('; ');
    };
    const signalGroup = signal => {
      if (!child.pid) return;
      try {
        const current = trackDescendants ? identity(child.pid) : null;
        if (current && current.start !== rootStart) return;
        kill(-child.pid, signal);
      }
      catch (failure) {
        if (failure.code !== 'ESRCH') error = [error, `${signal} cleanup: ${failure.code || failure.message}`].filter(Boolean).join('; ');
      }
    };
    const terminate = () => {
      if (terminating || settled) return;
      terminating = true;
      if (trackDescendants) {
        try {
          if (identity(child.pid)?.start === rootStart) capture(child.pid);
          signalOwned('SIGTERM');
        } catch (failure) { ownershipFailure(failure); }
      }
      signalGroup('SIGTERM');
      escalation = schedule(() => {
        if (settled) return;
        if (trackDescendants) {
          try { signalOwned('SIGKILL'); } catch (failure) { ownershipFailure(failure); }
        }
        signalGroup('SIGKILL');
      }, 1000);
      completionTimer = schedule(() => {
        if (settled) return;
        error = [error, 'native close completion deadline exceeded; cleanup incomplete; processes may remain alive']
          .filter(Boolean).join('; ');
        for (const stream of [child.stdout, child.stderr]) {
          try { stream.destroy(); }
          catch (failure) { error += `; pipe cleanup: ${failure.code || failure.message}`; }
        }
        void finish(null, null);
      }, 3000);
    };
    const abort = () => { error = [error, 'execution cancelled'].filter(Boolean).join('; '); terminate(); };
    if (signal) {
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    }
    if (trackDescendants) {
      const observe = () => {
        if (settled) return;
        try {
          for (const [pid, start] of owned) {
            const current = identity(pid);
            if (!current || current.start !== start || current.state === 'Z') owned.delete(pid);
          }
          if (identity(child.pid)?.start === rootStart) capture(child.pid);
        } catch (failure) { ownershipFailure(failure); terminate(); }
        ownershipTimer = schedule(observe, 25);
      };
      observe();
    }
    const timer = schedule(() => { timedOut = true; terminate(); }, timeoutMs);
    const append = (key, chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBytes) { outputLimit = true; terminate(); return; }
      if (key === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.on('error', value => { if (!settled) error = value.message; });
    async function finish(exit, childSignal) {
      if (settled) return;
      settled = true;
      cancel(timer);
      if (escalation) cancel(escalation);
      if (completionTimer) cancel(completionTimer);
      if (ownershipTimer) cancel(ownershipTimer);
      if (signal) signal.removeEventListener('abort', abort);
      if (trackDescendants) {
        try {
          signalOwned('SIGKILL');
          await Promise.all([...owned].map(async ([pid, start]) => {
            const current = identity(pid);
            if (current?.start === start) await waitForProcessExit(pid, 1000);
          }));
        } catch (failure) { ownershipFailure(failure); }
      }
      // Reap ordinary descendants still holding no inherited output handles.
      if (child.pid) signalGroup('SIGKILL');
      resolve({ command, cwd, startedAt, completedAt: new Date().toISOString(), exit, signal: childSignal,
        timedOut, outputLimit, error, stdout, stderr });
    }
    child.on('close', finish);
  });
}

export function retainProcess(directory, result) {
  mkdir(directory);
  const { stdout = '', stderr = '' } = result;
  const receipt = Object.fromEntries(['command', 'cwd', 'startedAt', 'completedAt', 'exit', 'signal',
    'timedOut', 'outputLimit', 'error'].filter(key => result[key] !== undefined).map(key => [key, result[key]]));
  const record = { ...receipt, stdout: save(path.join(directory, 'stdout.log'), stdout),
    stderr: save(path.join(directory, 'stderr.log'), stderr) };
  const retained = save(path.join(directory, 'command.json'), record);
  return { ...record, receipt: retained };
}
