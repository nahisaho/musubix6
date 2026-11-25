import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence, validateNativeControls } from './validate-evidence.mjs';

const B = 2147483648n;
const resident = 67108864n;
const roles = ['root', 'quick', 'nested', 'grandchild', 'allocator', 'survivor'];
const parents = [900, 100, 100, 102, 100, 100];
export function control(bound = B) {
  const rows = roles.map((role, i) => ({
    pid: 100 + i, parentPid: parents[i], initialThreadId: 1000 + i, creationFileTime: String(100 + i),
    exitFileTime: String(role === 'survivor' ? 230 : role === 'root' ? 220 : 210),
    peakBytes: String(role === 'allocator' ? resident : 1),
    peakAtHeldExit: true, exitContinued: true, signaled: true, exitCode: 0,
    image: 'C:\\owned\\node.exe', initialBreakpointsHandled: 1,
  }));
  rows[0].peakBytes = String(bound - resident - 4n);
  const witnesses = roles.map((role, i) => ({
    role, pid: 100 + i, parentPid: parents[i],
    cwd: 'C:\\owned\\case', fixtureRoot: 'C:\\owned\\case',
    births: role === 'root'
      ? ['quick', 'nested', 'allocator', 'survivor'].map(child => ({ role: child, pid: 100 + roles.indexOf(child) }))
      : role === 'nested' ? [{ role: 'grandchild', pid: 103 }] : [],
    ...(role === 'allocator' ? { touchedBytes: Number(resident), residentBytes: String(resident) } : {}),
    ...(role === 'survivor' ? { parentGone: true } : {}),
  }));
  const expected = {
    manifestSha256: 'a'.repeat(64),
    files: { 'NativeCollector.cs': 'b'.repeat(64), 'subject.mjs': 'c'.repeat(64) },
    executableSha256: 'd'.repeat(64), version: 'v24.22.3',
    executable: 'C:\\owned\\node.exe',
    command: ['C:\\owned\\node.exe', 'C:\\owned\\subject.mjs', 'root', 'C:\\owned\\case'],
    cwd: 'C:\\owned\\case',
    isolation: {
      sourceRepositoryRoot: 'C:\\clone', runRoot: 'C:\\owned', fixtureRoot: 'C:\\owned\\case',
      kernelPathsVerified: true, reparseChecked: true, uniqueRunOwned: true, fixtureFresh: true,
    },
  };
  const evidence = {
    schema: 1, kind: 'collector-only-prototype',
    platform: 'win32', arch: 'x64', version: expected.version,
    bindings: structuredClone(expected), witnesses,
    native: {
      rows, errors: [], timedOut: false, completed: true, cleanupComplete: true,
      jobTotalProcesses: 6, jobActiveAtEnd: 0,
      debugEvents: rows.map(row => ({
        code: 1, pid: row.pid, tid: row.initialThreadId, exceptionCode: 0x80000003,
        firstChance: 1, continueStatus: 0x10002, continued: true, startupBreakpointVerified: true,
        startupMappingRevalidated: true, startupImageBase: '4096', startupImageSize: '4096',
        exceptionAddress: '5376',
      })),
      processEvents: rows.flatMap(row => [
        { kind: 'create', pid: row.pid, creationFileTime: row.creationFileTime },
        { kind: 'exit', pid: row.pid, creationFileTime: row.creationFileTime, exitFileTime: row.exitFileTime, peakBytes: row.peakBytes, peakAtHeldExit: true },
      ]),
      elapsedMs: 1,
      collector: {
        pid: 900, parentPid: 901, creationFileTime: '10', observedFileTime: '300',
        collectionStartFileTime: '90', collectionEndFileTime: '300',
        peakBytes: '30000000', image: 'C:\\Windows\\PowerShell.exe',
        executableSha256: 'f'.repeat(64), command: ['PowerShell.exe', '-File', 'run-collector.ps1'],
        boundary: 'host-process-peak-through-collection;not-full-overhead-tree',
      },
    },
  };
  return { evidence, expected };
}
const evaluate = ({ evidence, expected }) => validateEvidence(evidence, expected);
const invalid = (name, reason, alter) => test(`prototype CEX ${name}`, () => {
  const input = control();
  alter(input.evidence, input.expected);
  const result = evaluate(input);
  assert.notEqual(result.status, 'PASS', name);
  assert.ok(result.reasons.includes(reason), `${name}: ${JSON.stringify(result)}`);
});

test('prototype valid synthetic reference control and exact budget boundaries', () => {
  for (const bound of [B - 1n, B]) {
    const result = evaluate(control(bound));
    assert.equal(result.status, 'PASS');
    assert.equal(result.boundBytes, String(bound));
  }
  const result = evaluate(control(B + 1n));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.includes('BUDGET_EXCEEDED'));
});

invalid('missing fast grandchild', 'CENSUS', e => e.native.rows.splice(3, 1));
invalid('missing witness', 'CENSUS', e => e.witnesses.pop());
invalid('collector-derived child count', 'BIRTH_WITNESS', e => e.witnesses[2].births = []);
invalid('wrong parent', 'PARENT', e => e.native.rows[3].parentPid = 100);
test('prototype native raw firstChance domain and nonzero semantics', () => {
  for (const value of [1, 2, 0xffffffff]) {
    const input = control();
    input.evidence.native.debugEvents[0].firstChance = value;
    assert.equal(evaluate(input).status, 'PASS', `valid native raw DWORD ${value}`);
  }
  for (const value of [0, -1, 1.5, '2', 0x100000000, undefined]) {
    const input = control();
    input.evidence.native.debugEvents[0].firstChance = value;
    const result = evaluate(input);
    assert.notEqual(result.status, 'PASS', `invalid startup/raw domain ${value}`);
    assert.ok(result.reasons.includes('EXCEPTION_POLICY'));
  }
});
invalid('matching breakpoint after an earlier nonmatching exception', 'EXCEPTION_POLICY', e => {
  e.native.debugEvents.unshift({
    ...e.native.debugEvents[0], exceptionCode: 0xe0434352,
    continueStatus: 0x80010001, startupBreakpointVerified: false,
  });
});
test('prototype startup evidence valid exact uint64 range boundaries', () => {
  for (const [base, size, address] of [
    ['4096', '4096', '4096'], ['4096', '4096', '8191'],
    ['9007199254740993', '3', '9007199254740995'],
    ['18446744073709551608', '7', '18446744073709551614'],
  ]) {
    const input = control();
    Object.assign(input.evidence.native.debugEvents[0], {
      startupImageBase: base, startupImageSize: size, exceptionAddress: address,
    });
    assert.equal(evaluate(input).status, 'PASS', `${base}/${size}/${address}`);
  }
});
test('prototype startup evidence missing required event fields', () => {
  for (const field of ['startupImageBase', 'startupImageSize', 'exceptionAddress', 'startupMappingRevalidated']) {
    const input = control();
    Object.assign(input.evidence.native.rows[0], {
      startupImageVerified: true, startupImageBase: '4096', startupImageSize: '4096',
    });
    delete input.evidence.native.debugEvents[0][field];
    const result = evaluate(input);
    assert.notEqual(result.status, 'PASS', field);
    assert.ok(result.reasons.includes('EXCEPTION_POLICY'));
  }
});
test('prototype startup evidence requires true held mapping revalidation', () => {
  for (const value of [false, 'true', 1]) {
    const input = control();
    input.evidence.native.debugEvents[0].startupMappingRevalidated = value;
    const result = evaluate(input);
    assert.notEqual(result.status, 'PASS', `${value}`);
    assert.ok(result.reasons.includes('EXCEPTION_POLICY'));
  }
});
test('prototype startup evidence rejects invalid exact ranges and decimal domains', () => {
  const invalidRanges = [
    ['4096', '4096', '4095'], ['4096', '4096', '8192'],
    ['9007199254740993', '3', '9007199254740992'],
    ['9007199254740993', '3', '9007199254740996'],
    ['18446744073709551608', '7', '18446744073709551615'],
    ['18446744073709551614', '3', '18446744073709551614'],
    ['0', '4096', '5376'], ['4096', '0', '5376'],
  ];
  for (const [base, size, address] of invalidRanges) {
    const input = control();
    Object.assign(input.evidence.native.debugEvents[0], {
      startupImageBase: base, startupImageSize: size, exceptionAddress: address,
    });
    const result = evaluate(input);
    assert.notEqual(result.status, 'PASS', `${base}/${size}/${address}`);
    assert.ok(result.reasons.includes('EXCEPTION_POLICY'));
  }
  for (const field of ['startupImageBase', 'startupImageSize', 'exceptionAddress']) {
    for (const value of [4096, '', ' 4096', '4096 ', '4096\n', '04096', '-1', '+4096', '1.5', '4.096e3', '0x1000', '18446744073709551616', null]) {
      const input = control();
      input.evidence.native.debugEvents[0][field] = value;
      const result = evaluate(input);
      assert.notEqual(result.status, 'PASS', `${field}/${value}`);
      assert.ok(result.reasons.includes('EXCEPTION_POLICY'));
    }
  }
});
invalid('duplicate process identity/thread counted as process', 'CENSUS', e => e.native.rows.push(structuredClone(e.native.rows[1])));
invalid('PID without creation identity', 'LIFETIME', e => delete e.native.rows[1].creationFileTime);
invalid('forged shortened lifetime', 'LIFETIME', e => e.native.rows[3].exitFileTime = '102');
invalid('root-only termination', 'LIFETIME', e => e.native.rows[5].exitFileTime = '219');
invalid('missing peak', 'PEAK', e => delete e.native.rows[1].peakBytes);
invalid('zero peak', 'PEAK', e => e.native.rows[1].peakBytes = '0');
invalid('sampled peak substitution', 'PEAK', e => e.native.rows[1].peakAtHeldExit = false);
invalid('missing allocator resident witness', 'RESIDENT_WITNESS', e => delete e.witnesses[4].residentBytes);
invalid('allocation instead of measured RSS', 'RESIDENT_WITNESS', e => e.witnesses[4].residentBytes = '1');
invalid('peak below independently observed RSS', 'RESIDENT_WITNESS', e => e.native.rows[4].peakBytes = String(resident - 1n));
invalid('native memory API failure', 'NATIVE_FAILURE', e => e.native.errors.push('MEMORY_API'));
invalid('dropped continuation', 'CLOSURE', e => e.native.rows[2].exitContinued = false);
invalid('unsignaled process', 'CLOSURE', e => e.native.rows[2].signaled = false);
invalid('nonzero exit/OOM control', 'PROCESS_EXIT', e => e.native.rows[2].exitCode = 9);
invalid('source/runtime hash mismatch', 'BINDINGS', e => e.bindings.executableSha256 = 'e'.repeat(64));
invalid('missing input reference', 'BINDINGS', e => delete e.bindings.files['subject.mjs']);
invalid('literal argv mismatch', 'BINDINGS', e => e.bindings.command.push('--changed'));
invalid('native Windows replaced by Linux', 'PLATFORM', e => e.platform = 'linux');
invalid('wrong Node patch', 'PLATFORM', e => e.version = 'v24.22.1');
invalid('collector inside subject census', 'BOUNDARY', e => e.native.collector.pid = 100);
invalid('missing separate collector memory', 'BOUNDARY', e => delete e.native.collector.peakBytes);
invalid('false initial breakpoint classification', 'EXCEPTION_POLICY', e => e.native.rows[2].initialBreakpointsHandled = 2);
invalid('swallowed application exception', 'EXCEPTION_POLICY', e => e.native.debugEvents[0].exceptionCode = 0xc0000005);
invalid('unverified startup breakpoint address', 'EXCEPTION_POLICY', e => e.native.debugEvents[0].startupBreakpointVerified = false);
invalid('missing first-chance field', 'EXCEPTION_POLICY', e => delete e.native.debugEvents[0].firstChance);
invalid('RIP debug event without an error summary', 'NATIVE_FAILURE', e => e.native.debugEvents.push({
  code: 9, pid: 100, tid: 1000, continued: true, continueStatus: 0x10002,
}));
invalid('missing independently retained process events', 'LIFETIME', e => e.native.processEvents = []);
invalid('shortened otherwise valid interval', 'LIFETIME', e => e.native.rows[3].exitFileTime = '209');
invalid('fractional memory arithmetic', 'PEAK', e => e.native.rows[2].peakBytes = '1.5');
for (const root of ['C:\\clone', 'c:\\CLONE\\.sdd', 'C:\\clone\\protected\\case', '\\\\server\\share\\case']) {
  invalid(`protected/UNC fixture ${root}`, 'ISOLATION', (e, expected) => {
    e.bindings.isolation.fixtureRoot = root;
    expected.isolation.fixtureRoot = root;
    e.bindings.cwd = root;
    expected.cwd = root;
  });
}
invalid('inherited source-repository CWD', 'ISOLATION', (e, expected) => {
  e.bindings.cwd = expected.cwd = 'C:\\clone';
});
invalid('descendant independently reports source CWD', 'ISOLATION', e => e.witnesses[3].cwd = 'C:\\clone');
invalid('unresolved junction admission', 'ISOLATION', (e, expected) => {
  e.bindings.isolation.reparseChecked = expected.isolation.reparseChecked = false;
});
test('prototype null/unparseable-shaped report is non-PASS', () => {
  for (const report of [null, [], {}, 'broken']) assert.notEqual(validateEvidence(report, control().expected).status, 'PASS');
});

test('prototype all finite completion/cleanup/timeout policy rows', () => {
  for (const completed of [false, true]) for (const cleanupComplete of [false, true])
    for (const timedOut of [false, true]) for (const elapsedMs of [180000, 180001]) {
      const input = control();
      Object.assign(input.evidence.native, { completed, cleanupComplete, timedOut, elapsedMs });
      const shouldPass = completed && cleanupComplete && !timedOut && elapsedMs <= 180000;
      assert.equal(evaluate(input).status === 'PASS', shouldPass,
        JSON.stringify({ completed, cleanupComplete, timedOut, elapsedMs }));
    }
});

test('prototype exact overlap uses lifetime enclosure rather than summing nonoverlap', () => {
  const input = control();
  for (const row of input.evidence.native.rows) row.peakBytes = '10';
  input.evidence.native.rows[4].peakBytes = String(resident);
  input.evidence.native.rows[1].exitFileTime = '102';
  for (const event of input.evidence.native.processEvents) if (event.kind === 'exit') {
    const row = input.evidence.native.rows.find(row => row.pid === event.pid);
    event.peakBytes = row.peakBytes;
    event.exitFileTime = row.exitFileTime;
  }
  const result = evaluate(input);
  assert.equal(result.status, 'PASS');
  assert.equal(result.boundBytes, String(resident + 40n));
});

test('prototype native-control counterexamples require accepted valid evidence first', () => {
  const { evidence, expected } = control();
  const result = validateNativeControls(evidence, expected);
  assert.equal(result.status, 'PASS');
  assert.equal(result.valid.status, 'PASS');
  assert.equal(result.cases.length, 4);
  for (const item of result.cases) assert.equal(item.detected, true, item.name);
  evidence.native.rows.pop();
  const refusal = validateNativeControls(evidence, expected);
  assert.equal(refusal.status, 'NON_PASS');
  assert.equal(refusal.cases.length, 0);
});

test('prototype all finite later-exception continuation rows', () => {
  for (const exceptionCode of [0x80000003, 0xc0000005]) for (const firstChance of [0, 1])
    for (const continueStatus of [0x10002, 0x80010001]) for (const startupBreakpointVerified of [false, true]) {
      const input = control();
      input.evidence.native.debugEvents.push({
        code: 1, pid: 100, tid: 1000, exceptionCode, firstChance, continueStatus, startupBreakpointVerified, continued: true,
      });
      const shouldPass = firstChance !== 0 && continueStatus === 0x80010001;
      assert.equal(evaluate(input).status === 'PASS', shouldPass,
        JSON.stringify({ exceptionCode, firstChance, continueStatus, startupBreakpointVerified }));
    }
});
