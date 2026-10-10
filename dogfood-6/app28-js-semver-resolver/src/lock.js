import { createHash } from 'node:crypto';
import { parse } from './semver.js';
import { satisfies, parseRange } from './range.js';
import { byCode } from './util.js';

export class LockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockError';
  }
}

const REGISTRY_URL = 'https://registry.example';

const integrityOf = (name, version) => `sha512-${createHash('sha512').update(`${name}@${version}`).digest('base64')}`;
const sortedObject = (entries) => [...entries].sort((a, b) => byCode(a[0], b[0]));

/** @id CODE-LOCK-001 @implements REQ-LOCK-001 REQ-LOCK-002 REQ-LOCK-003 */
export function writeLock(tree, registry, rootDeps = {}) {
  const t = tree instanceof Map ? tree : new Map(Object.entries(tree));
  const packages = [];
  for (const [name, version] of t) {
    const meta = registry[name]?.[version] ?? {};
    const deps = [];
    for (const dep of Object.keys(meta.deps ?? {})) {
      if (!t.has(dep)) throw new LockError(`${name}@${version} depends on ${dep} which is not in the tree`);
      deps.push([dep, t.get(dep)]);
    }
    packages.push([name, {
      version,
      resolved: `${REGISTRY_URL}/${name}/-/${name}-${version}.tgz`,
      integrity: integrityOf(name, version),
      dependencies: Object.fromEntries(sortedObject(deps)),
    }]);
  }
  return serializeLock({ lockfileVersion: 1, root: rootDeps, packages: Object.fromEntries(packages) });
}

/** @id CODE-LOCK-002 @implements REQ-LOCK-004 REQ-LOCK-006 REQ-LOCK-012 */
export function serializeLock(lock) {
  // JS objects reorder integer-like keys, so emit the JSON text from ordered entry lists
  const obj = (entries, pad, val) => {
    if (!entries.length) return '{}';
    const inner = `${pad}  `;
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${val(v, inner)}`).join(',\n')}\n${pad}}`;
  };
  const strings = (list) => (v, pad) => obj(list(v), pad, (x) => JSON.stringify(x));
  const ordered = (o) => sortedObject(Object.entries(o ?? {}));
  const entry = (e, pad) => obj([['dependencies', e.dependencies], ['integrity', e.integrity], ['resolved', e.resolved], ['version', e.version]], pad,
    (v, p) => (typeof v === 'string' ? JSON.stringify(v) : obj(ordered(v), p, (x) => JSON.stringify(x))));
  const top = [['lockfileVersion', lock.lockfileVersion], ['root', lock.root], ['packages', lock.packages]];
  const text = obj(top, '', (v, p) => {
    if (typeof v === 'number') return String(v);
    return v === lock.root ? strings(ordered)(v, p) : obj(ordered(v), p, entry);
  });
  return `${text}\n`;
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const strMap = (x) => isObj(x) && Object.values(x).every((v) => typeof v === 'string');

/** @id CODE-LOCK-003 @implements REQ-LOCK-005 */
export function parseLock(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new LockError(`malformed lockfile JSON: ${e.message}`); }
  if (!isObj(raw)) throw new LockError('lockfile must be a JSON object');
  if (raw.lockfileVersion !== 1) throw new LockError(`unsupported lockfileVersion: ${raw.lockfileVersion}`);
  if (!strMap(raw.root)) throw new LockError('root must be an object of strings');
  if (!isObj(raw.packages)) throw new LockError('packages must be an object');
  for (const [name, e] of Object.entries(raw.packages)) {
    if (!isObj(e) || typeof e.version !== 'string') throw new LockError(`${name}: missing version`);
    try { parse(e.version); } catch { throw new LockError(`${name}: invalid version ${e.version}`); }
    if (typeof e.resolved !== 'string') throw new LockError(`${name}: missing resolved`);
    if (typeof e.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(e.integrity)) throw new LockError(`${name}: invalid integrity`);
    if (!strMap(e.dependencies)) throw new LockError(`${name}: dependencies must be an object of strings`);
  }
  return raw;
}

/** @id CODE-LOCK-004 @implements REQ-LOCK-007 REQ-LOCK-008 REQ-LOCK-009 REQ-LOCK-011 */
export function verifyLock(lock) {
  const issues = [];
  const pk = lock.packages;
  const seen = new Set();
  const stack = [];
  for (const [name, range] of Object.entries(lock.root ?? {})) {
    const e = pk[name];
    if (!e) issues.push({ kind: 'root-mismatch', pkg: name, detail: `${name}@${range} is not locked` });
    else {
      if (!satisfies(e.version, parseRange(range))) issues.push({ kind: 'root-mismatch', pkg: name, detail: `${name}@${e.version} does not satisfy ${range}` });
      stack.push(name);
    }
  }
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    for (const dep of Object.keys(pk[n].dependencies ?? {})) if (pk[dep]) stack.push(dep);
  }
  for (const [name, e] of Object.entries(pk)) {
    if (!seen.has(name)) issues.push({ kind: 'extraneous', pkg: name, detail: `${name} is not reachable from root` });
    if (e.integrity !== integrityOf(name, e.version)) issues.push({ kind: 'integrity', pkg: name, detail: `${name}@${e.version} integrity mismatch` });
    for (const [dep, v] of Object.entries(e.dependencies ?? {})) {
      if (pk[dep]?.version !== v) issues.push({ kind: 'dangling', pkg: name, detail: `${name} depends on ${dep}@${v} which is not locked` });
    }
  }
  return issues.sort((a, b) => byCode(a.kind, b.kind) || byCode(a.pkg, b.pkg));
}

/** @id CODE-LOCK-005 @implements REQ-LOCK-010 */
export function diffLock(a, b) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [pkg, e] of Object.entries(b.packages)) {
    const old = a.packages[pkg];
    if (!old) added.push({ pkg, version: e.version });
    else if (old.version !== e.version) changed.push({ pkg, from: old.version, to: e.version });
  }
  for (const [pkg, e] of Object.entries(a.packages)) if (!b.packages[pkg]) removed.push({ pkg, version: e.version });
  const by = (x, y) => byCode(x.pkg, y.pkg);
  return { added: added.sort(by), removed: removed.sort(by), changed: changed.sort(by) };
}
