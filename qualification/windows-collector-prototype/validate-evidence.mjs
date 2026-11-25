import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLES = ['root', 'quick', 'nested', 'grandchild', 'allocator', 'survivor'];
const PARENTS = { quick: 'root', nested: 'root', grandchild: 'nested', allocator: 'root', survivor: 'root' };
const BUDGET = 2147483648n;
const ALLOCATION = 67108864n;
const UINT64_MAX = 0xffffffffffffffffn;
const integer = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : null;
const uint64 = value => {
  const parsed = typeof value === 'string' && value.length <= 20 && value.trim() === value ? integer(value) : null;
  return parsed !== null && parsed <= UINT64_MAX ? parsed : null;
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pid = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
const same = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, i) => same(value, b[i]));
  if (object(a) || object(b)) return object(a) && object(b)
    && Object.keys(a).sort().join('\0') === Object.keys(b).sort().join('\0')
    && Object.keys(a).every(key => same(a[key], b[key]));
  return a === b;
};
function isolated(bindings) {
  const admission = bindings?.isolation;
  if (!object(admission) || admission.kernelPathsVerified !== true || admission.reparseChecked !== true
    || admission.uniqueRunOwned !== true || admission.fixtureFresh !== true) return false;
  const names = [admission.sourceRepositoryRoot, admission.runRoot, admission.fixtureRoot, bindings.cwd];
  if (!names.every(name => typeof name === 'string' && /^[a-z]:\\/i.test(name) && !name.startsWith('\\\\'))) return false;
  const [source, run, fixture, cwd] = names.map(name => path.win32.resolve(name).toLowerCase());
  const inside = (root, target) => root === target || target.startsWith(root.replace(/\\+$/, '') + '\\');
  return !inside(source, run) && !inside(run, source) && !inside(source, fixture)
    && !inside(fixture, source) && inside(run, fixture) && fixture === cwd;
}

// Prototype-only checker for the canonical collector spike. It does not qualify TEST009.
export function validateEvidence(evidence, expected) {
  const reasons = new Set();
  const reject = reason => reasons.add(reason);
  const result = bound => ({
    status: reasons.size ? (reasons.size === 1 && reasons.has('BUDGET_EXCEEDED') ? 'BLOCKED' : 'NON_PASS') : 'PASS',
    reasons: [...reasons], boundBytes: bound === null ? null : String(bound),
    measurement: 'conservative-overlapping-individual-peak-upper-bound',
    scope: 'collector-only-prototype;not-capacity-or-release-qualification',
  });
  if (!object(evidence) || evidence.schema !== 1 || evidence.kind !== 'collector-only-prototype'
    || !object(evidence.native) || !object(expected)) {
    reject('REPORT'); return result(null);
  }
  if (evidence.platform !== 'win32' || evidence.arch !== 'x64' || evidence.version !== expected.version
    || !/^v(20|22|24)\.[0-9]+\.[0-9]+$/.test(evidence.version ?? '')) reject('PLATFORM');
  if (!same(evidence.bindings, expected)) reject('BINDINGS');
  if (!isolated(evidence.bindings) || !isolated(expected)) reject('ISOLATION');
  const native = evidence.native;
  if (!Array.isArray(native.errors) || native.errors.length) reject('NATIVE_FAILURE');
  if (native.completed !== true || native.cleanupComplete !== true) reject('CLOSURE');
  if (native.jobTotalProcesses !== ROLES.length || native.jobActiveAtEnd !== 0) reject('CENSUS');
  if (native.timedOut !== false || !Number.isFinite(native.elapsedMs)
    || native.elapsedMs < 0 || native.elapsedMs > 180000) reject('TIMEOUT');
  if (!Array.isArray(native.rows) || !Array.isArray(evidence.witnesses)
    || native.rows.length !== ROLES.length || evidence.witnesses.length !== ROLES.length) {
    reject('CENSUS'); return result(null);
  }
  const witnesses = new Map();
  for (const witness of evidence.witnesses) {
    if (!object(witness) || !ROLES.includes(witness.role) || witnesses.has(witness.role)
      || !pid(witness.pid) || !pid(witness.parentPid)) reject('CENSUS');
    else witnesses.set(witness.role, witness);
  }
  const rows = new Map();
  for (const row of native.rows) {
    if (!object(row) || !pid(row.pid) || rows.has(row.pid)) reject('CENSUS');
    else rows.set(row.pid, row);
  }
  if (witnesses.size !== ROLES.length || rows.size !== ROLES.length) {
    reject('CENSUS'); return result(null);
  }
  const debugEvents = Array.isArray(native.debugEvents) ? native.debugEvents : [];
  if (!debugEvents.length) reject('EXCEPTION_POLICY');
  const exceptionCounts = new Map();
  for (const event of debugEvents) {
    if (!object(event) || event.continued !== true) { reject('CLOSURE'); continue; }
    if (!pid(event.pid) || !pid(event.tid) || !rows.has(event.pid)) reject('CENSUS');
    if (!Number.isInteger(event.code) || event.code < 1 || event.code > 9) reject('NATIVE_FAILURE');
    if (event.code === 9) reject('NATIVE_FAILURE');
    if (event.code === 1) {
      if (!Number.isInteger(event.firstChance) || event.firstChance < 0 || event.firstChance > 0xffffffff
        || !Number.isInteger(event.exceptionCode) || event.exceptionCode < 0 || event.exceptionCode > 0xffffffff) reject('EXCEPTION_POLICY');
      const row = rows.get(event.pid);
      const ordinal = exceptionCounts.get(event.pid) ?? 0;
      exceptionCounts.set(event.pid, ordinal + 1);
      const base = uint64(event.startupImageBase), size = uint64(event.startupImageSize), address = uint64(event.exceptionAddress);
      const withinStartupRange = base !== null && size !== null && address !== null
        && base > 0n && size > 0n && size <= UINT64_MAX - base && address >= base && address < base + size;
      const initial = ordinal === 0 && event.firstChance !== 0 && event.exceptionCode === 0x80000003
        && row && event.tid === row.initialThreadId && event.startupBreakpointVerified === true
        && event.startupMappingRevalidated === true && withinStartupRange;
      if (event.continueStatus === 0x10002 && !initial) reject('EXCEPTION_POLICY');
      if (event.continueStatus !== 0x10002 && event.continueStatus !== 0x80010001) reject('EXCEPTION_POLICY');
      if (event.firstChance === 0) reject('NATIVE_FAILURE');
    } else if (event.continueStatus !== 0x10002) reject('EXCEPTION_POLICY');
  }
  const collector = native.collector;
  const collectionStart = object(collector) ? integer(collector.creationFileTime) : null;
  const collectionEnd = object(collector) ? integer(collector.observedFileTime) : null;
  const scopeStart = object(collector) ? integer(collector.collectionStartFileTime) : null;
  const scopeEnd = object(collector) ? integer(collector.collectionEndFileTime) : null;
  if (!object(collector) || !pid(collector.pid) || rows.has(collector.pid)
    || !pid(collector.parentPid) || rows.has(collector.parentPid)
    || collectionStart === null || collectionEnd === null || collectionEnd < collectionStart
    || (integer(collector.peakBytes) ?? 0n) <= 0n || typeof collector.image !== 'string'
    || !/^[a-f0-9]{64}$/.test(collector.executableSha256 ?? '') || !Array.isArray(collector.command) || !collector.command.length
    || scopeStart === null || scopeEnd === null || scopeStart < collectionStart || scopeEnd < scopeStart || scopeEnd > collectionEnd
    || collector.boundary !== 'host-process-peak-through-collection;not-full-overhead-tree') reject('BOUNDARY');
  const events = [];
  const processEvents = Array.isArray(native.processEvents) ? native.processEvents : [];
  if (processEvents.length !== ROLES.length * 2) reject('LIFETIME');
  for (const role of ROLES) {
    const witness = witnesses.get(role), row = rows.get(witness.pid);
    if (!row) { reject('CENSUS'); continue; }
    if (typeof witness.cwd !== 'string' || typeof witness.fixtureRoot !== 'string'
      || witness.cwd.toLowerCase() !== expected.cwd?.toLowerCase()
      || witness.fixtureRoot.toLowerCase() !== expected.isolation?.fixtureRoot?.toLowerCase()) reject('ISOLATION');
    const parentPid = role === 'root' ? collector?.pid : witnesses.get(PARENTS[role])?.pid;
    if (row.parentPid !== parentPid || row.parentPid !== witness.parentPid) reject('PARENT');
    if (typeof row.image !== 'string' || row.image.toLowerCase() !== expected.executable?.toLowerCase()) reject('BINDINGS');
    const start = integer(row.creationFileTime), end = integer(row.exitFileTime), peak = integer(row.peakBytes);
    if (start === null || end === null || end < start || collectionStart === null || collectionEnd === null
      || scopeStart === null || scopeEnd === null || start < scopeStart || end > scopeEnd) reject('LIFETIME');
    if (peak === null || peak <= 0n || peak > 0xffffffffffffffffn || row.peakAtHeldExit !== true) reject('PEAK');
    if (row.exitContinued !== true || row.signaled !== true) reject('CLOSURE');
    if (row.exitCode !== 0) reject('PROCESS_EXIT');
    if (row.initialBreakpointsHandled !== 1) reject('EXCEPTION_POLICY');
    const handled = debugEvents.filter(event => event.code === 1 && event.pid === row.pid && event.continueStatus === 0x10002);
    if (handled.length !== 1) reject('EXCEPTION_POLICY');
    const births = role === 'root' ? ['quick', 'nested', 'allocator', 'survivor']
      : role === 'nested' ? ['grandchild'] : [];
    if (!same(witness.births, births.map(child => ({ role: child, pid: witnesses.get(child)?.pid })))) reject('BIRTH_WITNESS');
    const creates = processEvents.filter(event => object(event) && event.kind === 'create' && event.pid === row.pid);
    const exits = processEvents.filter(event => object(event) && event.kind === 'exit' && event.pid === row.pid);
    if (creates.length !== 1 || exits.length !== 1 || creates[0].creationFileTime !== row.creationFileTime
      || exits[0].creationFileTime !== row.creationFileTime || exits[0].exitFileTime !== row.exitFileTime) reject('LIFETIME');
    if (exits.length !== 1 || exits[0].peakBytes !== row.peakBytes || exits[0].peakAtHeldExit !== true) reject('PEAK');
    if (role !== 'root') {
      const parent = rows.get(parentPid);
      const parentStart = integer(parent?.creationFileTime), parentEnd = integer(parent?.exitFileTime);
      if (start === null || parentStart === null || parentEnd === null || start < parentStart || start > parentEnd) reject('LIFETIME');
    }
    if (role === 'allocator') {
      const measured = integer(witness.residentBytes);
      if (witness.touchedBytes !== Number(ALLOCATION) || measured === null || measured < ALLOCATION
        || peak === null || peak < measured) reject('RESIDENT_WITNESS');
    }
    if (role === 'survivor') {
      const rootEnd = integer(rows.get(witnesses.get('root').pid)?.exitFileTime);
      if (witness.parentGone !== true || rootEnd === null || end === null || end <= rootEnd) reject('LIFETIME');
    }
    if (start !== null && end !== null && end >= start && peak !== null && peak > 0n)
      events.push({ time: start, delta: peak, birth: true }, { time: end, delta: -peak, birth: false });
  }
  if (events.length !== ROLES.length * 2) return result(null);
  // Births precede exits on equal endpoints: a deliberately conservative closed enclosure.
  events.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : Number(b.birth) - Number(a.birth));
  let current = 0n, bound = 0n;
  for (const event of events) { current += event.delta; if (current > bound) bound = current; }
  if (bound > BUDGET) reject('BUDGET_EXCEEDED');
  return result(bound);
}

export function validateNativeControls(evidence, expected) {
  const valid = validateEvidence(evidence, expected);
  const cases = [];
  if (valid.status !== 'PASS') return { status: 'NON_PASS', valid, cases };
  const controls = [
    ['missing-fast-child', 'CENSUS', e => {
      const target = e.witnesses.find(witness => witness.role === 'grandchild').pid;
      e.native.rows = e.native.rows.filter(row => row.pid !== target);
    }],
    ['invalid-peak', 'PEAK', e => { e.native.rows[0].peakBytes = '0'; }],
    ['invalid-binding', 'BINDINGS', e => { e.bindings.manifestSha256 = '0'.repeat(64); }],
    ['API-failure-evidence', 'NATIVE_FAILURE', e => { e.native.errors.push('SIMULATED_API_FAILURE'); }],
  ];
  for (const [name, requiredReason, change] of controls) {
    const altered = JSON.parse(JSON.stringify(evidence));
    change(altered);
    const verdict = validateEvidence(altered, expected);
    cases.push({ name, requiredReason, detected: verdict.status !== 'PASS' && verdict.reasons.includes(requiredReason), verdict });
  }
  return { status: cases.every(control => control.detected) ? 'PASS' : 'NON_PASS', valid, cases,
    scope: 'validator-counterexamples;not-native-fault-injection-or-execution-attestation' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let verdict;
  try {
    const [evidencePath, expectedPath, mode] = process.argv.slice(2);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    verdict = mode === '--controls' ? validateNativeControls(evidence, expected) : validateEvidence(evidence, expected);
  } catch {
    verdict = { status: 'NON_PASS', reasons: ['REPORT'], boundBytes: null };
  }
  process.stdout.write(JSON.stringify(verdict) + '\n');
  process.exitCode = verdict.status === 'PASS' ? 0 : verdict.status === 'BLOCKED' ? 1 : 2;
}
