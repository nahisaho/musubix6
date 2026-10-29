import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensure, equal, readRef } from './release-qualification-io.mjs';

function unique(values, label) {
  ensure(new Set(values).size === values.length, `duplicate ${label}`);
}

export function assertionFrame(error) {
  if (typeof error?.stack !== 'string') return '';
  let stack = error.stack;
  if (error.message !== undefined) {
    if (typeof error.message !== 'string') return '';
    const header = `AssertionError [ERR_ASSERTION]${error.message ? ': ' + error.message : ''}\n`;
    if (!stack.startsWith(header)) return '';
    stack = stack.slice(header.length);
  }
  return stack.split('\n').find(line => line.trim()) || '';
}

export function ownedAssertion(error, source, lines) {
  ensure(typeof source === 'string' && path.isAbsolute(source), 'absolute independent assertion source required');
  ensure(Array.isArray(lines) && lines.length > 0 &&
    lines.every(line => Number.isSafeInteger(line) && line > 0), 'positive safe-integer assertion lines required');
  if (error?.code !== 'ERR_ASSERTION' || error.name !== 'AssertionError' || typeof error.stack !== 'string') return false;
  const frame = assertionFrame(error);
  if (!frame) return false;
  const match = /^\s+at\s+(?:[^()\n]+\s+\()?((?:file:\/\/\/|\/)[^()\n]+):([1-9]\d*):([1-9]\d*)\)?\s*$/.exec(frame);
  if (!match) return false;
  let file;
  try { file = match[1].startsWith('file:') ? fileURLToPath(match[1]) : match[1]; }
  catch { return false; }
  const line = Number(match[2]), column = Number(match[3]);
  return file === source && Number.isSafeInteger(line) && Number.isSafeInteger(column) && lines.includes(line);
}

export function parseTap(text) {
  ensure(text.startsWith('TAP version 13\n'), 'native TAP header required');
  const matches = [...text.matchAll(/^(not ok|ok) (\d+) - (.+)$/gm)];
  const rows = matches.map((match, index) => {
    const pieces = match[3].split(/ # (SKIP|TODO)(?: |$)/);
    const block = text.slice(match.index, matches[index + 1]?.index ?? text.length);
    const diagnostic = /^ {2}error: [|>-]+\n((?: {4}[^\n]*\n)*)/m.exec(block)?.[1] || '';
    ensure(!/^\s*at(?:\s|$)/m.test(diagnostic), 'ambiguous native TAP assertion stack: message contains frame-like data');
    const stack = / {2}stack: [|>-]+\n((?: {4}[^\n]*\n)*)/.exec(block)?.[1] || '';
    const error = {
      code: /^ {2}code: '([^']+)'$/m.exec(block)?.[1],
      name: /^ {2}name: '([^']+)'$/m.exec(block)?.[1],
      stack: stack.split('\n').filter(Boolean).map(line => '    at ' + line.trim().replace(/^at /, '')).join('\n'),
    };
    return { name: pieces[0], failed: match[1] === 'not ok', skip: pieces[1] === 'SKIP',
      todo: pieces[1] === 'TODO', filtered: pieces[1] === 'SKIP' && /test name does not match pattern/.test(pieces[2] || ''),
      assertion: error.code === 'ERR_ASSERTION' && error.name === 'AssertionError', error, block };
  });
  unique(rows.map(row => row.name), 'native target');
  const plans = [...text.matchAll(/^1\.\.(\d+)(?:\s*#.*)?$/gm)];
  ensure(plans.length === 1 && +plans[0][1] === rows.length && rows.length > 0, 'one complete nonzero TAP plan required');
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const values = [...text.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))];
    ensure(values.length === 1, `one native ${key} summary required`);
    counts[key] = +values[0][1];
  }
  const observed = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,
    fail: rows.filter(r => r.failed && !r.todo && !r.skip).length, cancelled: 0,
    skipped: rows.filter(r => r.skip).length, todo: rows.filter(r => r.todo).length };
  equal(counts, observed);
  return { rows, counts };
}

export function parseEvents(text) {
  const events = text.trim().split('\n').map(line => JSON.parse(line));
  ensure(events.length > 0 && events.every(event => typeof event.type === 'string' && event.data), 'native event records required');
  const results = events.filter(event => ['test:pass', 'test:fail'].includes(event.type) && event.data.nesting === 0);
  const rows = results.map(event => {
    let error = event.data.details?.error;
    for (let depth = 0; error && depth < 8 && error.code !== 'ERR_ASSERTION'; depth++) error = error.cause;
    return { name: event.data.name, failed: event.type === 'test:fail',
      skip: ![undefined, false].includes(event.data.skip),
      todo: ![undefined, false].includes(event.data.todo),
      filtered: event.data.skip === 'test name does not match pattern',
      assertion: error?.code === 'ERR_ASSERTION' && error.name === 'AssertionError', error,
      block: JSON.stringify(event) };
  });
  unique(rows.map(row => row.name), 'native target');
  const plans = events.filter(event => event.type === 'test:plan' && event.data.nesting === 0);
  ensure(plans.length === 1 && plans[0].data.count === rows.length && rows.length > 0, 'one complete nonzero native plan required');
  const counts = { tests: rows.length, pass: rows.filter(r => !r.failed && !r.skip && !r.todo).length,
    fail: rows.filter(r => r.failed && !r.todo && !r.skip).length, cancelled: 0,
    skipped: rows.filter(r => r.skip).length, todo: rows.filter(r => r.todo).length };
  const nativeCounts = {};
  for (const key of Object.keys(counts)) {
    const pattern = new RegExp(`^${key} (\\d+)$`);
    const values = events.filter(event => event.type === 'test:diagnostic' && event.data.nesting === 0)
      .map(event => pattern.exec(event.data.message)).filter(Boolean);
    ensure(values.length === 1, `one native event ${key} summary required`);
    nativeCounts[key] = Number(values[0][1]);
  }
  equal(nativeCounts, counts);
  const summaries = events.filter(event => event.type === 'test:summary' && !event.data.file);
  ensure(summaries.length <= 1, 'duplicate native event summary');
  for (const summary of summaries) {
    const reported = Object.fromEntries(Object.keys(counts).map(key =>
      [key, summary.data.counts?.[key === 'pass' ? 'passed' : key === 'fail' ? 'failed' : key]]));
    equal(reported, counts);
    equal(summary.data.success, counts.fail === 0 && counts.cancelled === 0);
  }
  return { rows, counts };
}

export function parseNative(text, format = 'events') {
  return format === 'tap' || text.startsWith('TAP version 13\n') ? parseTap(text) : parseEvents(text);
}

export function processControl(evidence, expectedExit = 0) {
  if (evidence.receipt) {
    const recorded = JSON.parse(readRef(evidence.receipt));
    for (const [key, value] of Object.entries(recorded)) equal(evidence[key], value);
  }
  ensure(Array.isArray(evidence.command) && evidence.command.length > 0, 'actual command required');
  ensure(!evidence.timedOut && !evidence.outputLimit && !evidence.error && evidence.signal === null, 'execution incomplete');
  equal(evidence.exit, expectedExit);
  const text = readRef(evidence.stdout);
  const stderr = readRef(evidence.stderr);
  ensure(!/ERR_MODULE_NOT_FOUND|SyntaxError:|Cannot find module|MODULE_NOT_FOUND|Traceback \(most recent call last\)/.test(text + stderr),
    'setup failure cannot count as a verdict');
  return { text, stderr };
}

export function namedControl(parsed, catalogue, { excludedTodos = [], allowFiltered = true, failedTarget = null } = {}) {
  const names = catalogue.map(row => typeof row === 'string' ? row : row.name);
  unique(names, 'expected named target');
  ensure(names.length > 0, 'nonempty expected named catalogue required');
  const targets = parsed.rows.filter(row => names.includes(row.name));
  equal(targets.map(row => row.name).sort(), [...names].sort());
  for (const row of parsed.rows) {
    if (excludedTodos.includes(row.name)) {
      ensure(row.todo && !row.skip, `expected named TODO: ${row.name}`);
    } else if (names.includes(row.name)) {
      ensure(!row.skip && !row.todo && row.failed === (row.name === failedTarget), `required target not executed with expected verdict: ${row.name}`);
    } else {
      ensure(allowFiltered && row.filtered && !row.todo && !row.failed, `unknown or unexecuted native target: ${row.name}`);
    }
  }
  return targets;
}

export function validateHost(request) {
  const { text } = processControl(request.evidence);
  const data = JSON.parse(text);
  ensure(data.status === 'PASS' && Array.isArray(data.cases), 'host helper did not complete');
  const expected = request.catalogue;
  unique(expected.map(row => row.name), 'expected host mechanism');
  unique(data.cases.map(row => row.name), 'host mechanism');
  equal(data.cases.map(row => row.name).sort(), expected.map(row => row.name).sort());
  for (const target of expected) {
    const entry = data.cases.find(row => row.name === target.name);
    equal(entry.test, target.test);
    equal(entry.file, target.file);
    for (const stage of ['baseline', 'mutant', 'restored']) {
      const receipt = entry[stage];
      ensure(receipt && receipt.signal === null, `${entry.name}: missing ${stage}`);
      equal(receipt.status, stage === 'mutant' ? 1 : 0);
      const log = readRef({ path: receipt.log, sha256: receipt.logSha256 });
      if (receipt.stderr) readRef({ path: receipt.stderr, sha256: receipt.stderrSha256 });
      ensure(!/ERR_MODULE_NOT_FOUND|SyntaxError:|MODULE_NOT_FOUND/.test(log), 'mutant setup failure');
      const parsed = parseNative(log);
      const selected = parsed.rows.filter(row => row.name === target.test || row.name.startsWith(target.test + ' '));
      ensure(selected.length === 1, 'one exact selected host target required');
      namedControl(parsed, [selected[0].name], { failedTarget: stage === 'mutant' ? selected[0].name : null });
      equal(receipt.counts, { tests: 1, pass: stage === 'mutant' ? 0 : 1,
        fail: stage === 'mutant' ? 1 : 0, cancelled: 0, skipped: 0, todo: 0 });
      if (receipt.nativeCounts) equal(receipt.nativeCounts, parsed.counts);
      if (receipt.filteredNames) equal(receipt.filteredNames, parsed.rows.filter(row => row.filtered).map(row => row.name));
      if (stage === 'mutant') {
        const row = selected[0];
        const owner = target.sourceTest || target.file;
        const lines = target.assertionLines || [];
        ensure(ownedAssertion(row.error, owner, lines), 'wrong assertion code, owner or location');
        if (target.expectedAssertion) ensure(row.block.includes(target.expectedAssertion), 'wrong expected assertion reason');
        ensure(receipt.assertion === true, 'host assertion receipt missing');
      } else ensure(receipt.assertion === false, 'passing host control claimed an assertion');
    }
  }
  return { cases: data.cases };
}

export function validateMutationRows({ evidence, catalogue, adapterOutput }) {
  const { text } = processControl(evidence);
  const data = JSON.parse(text);
  ensure(data.status === 'PASS', 'mutation suite incomplete');
  unique(data.cases.map(row => row.name), 'mutation');
  equal(data.cases.map(row => row.name).sort(), catalogue.map(row => row.name || row.id).sort());
  for (const row of data.cases) {
    const target = catalogue.find(item => (item.name || item.id) === row.name);
    for (const phase of ['baseline', 'mutant', 'restored']) {
      const receipt = row[phase];
      const { text: native } = processControl(receipt, phase === 'mutant' ? 1 : 0);
      const parsed = parseNative(native);
      const name = target.targetName || target.name;
      const selected = namedControl(parsed, [name], { failedTarget: phase === 'mutant' ? name : null })[0];
      if (phase === 'mutant') {
        const owner = adapterOutput ? path.join(adapterOutput, 'mutations', row.name, 'source', target.suite) : target.sourceTest;
        ensure(ownedAssertion(selected.error, owner, target.assertionLines), 'wrong owned mutant assertion');
        if (target.expectedReason) ensure(new RegExp(target.expectedReason).test(selected.error.message), 'wrong mutant reason');
      }

    }
    ensure(row.originalSha256 === row.restoredSha256, 'mutant source was not restored');
  }
  return { cases: data.cases };
}

export function parseContentPython(text, plan, failed) {
  const summaries = [...text.matchAll(/^Ran (\d+) tests? in [^\n]+$/gm)];
  ensure(summaries.length === 1 && Number(summaries[0][1]) === 1, 'one selected native unittest required');
  const diagnosticStart = text.search(/^(?:={10,}|FAIL: |ERROR: |UNEXPECTED SUCCESS: )/m);
  const statuses = diagnosticStart < 0 ? text : text.slice(0, diagnosticStart);
  const summaryRecords = text.slice(summaries[0].index + summaries[0][0].length);
  ensure(!/^[ \t]*\S[^\n]* \.\.\. (?:skipped|expected failure|unexpected success)(?:[ \t]|$)/m.test(statuses) &&
    !/^(?:OK|FAILED) \([^)\n]*(?:skipped|expected failures|unexpected successes)=/m.test(summaryRecords) &&
    !/^UNEXPECTED SUCCESS: /m.test(text) &&
    !/^ERROR:|ImportError:|ModuleNotFoundError:|SyntaxError:|PermissionError:/m.test(text),
    'native unittest setup/skip is not a verdict');
  if (!failed) {
    ensure(/\nOK\s*$/.test(text) && !/^FAIL:/m.test(text), 'native unittest did not pass');
    return { tests: 1, failures: 0 };
  }
  const summary = /^FAILED \(failures=([1-9]\d*)\)\s*$/m.exec(text);
  ensure(summary, 'real native unittest assertion failures required');
  const blocks = text.split(/^FAIL: /m).slice(1);
  equal(blocks.length, Number(summary[1]));
  for (const block of blocks) {
    ensure(/^AssertionError(?::|$)/m.test(block), 'Python AssertionError required');
    ensure(block.startsWith(plan.targetNames[0].split('.').at(-1) + ' '), 'wrong selected unittest');
    const traceback = /Traceback \(most recent call last\):\n([\s\S]*?)^AssertionError(?::|$)/m.exec(block);
    ensure(traceback, 'complete native assertion traceback required');
    const frames = traceback[1].split('\n').filter(line => /^ {2}File\b|^[ \t]*File[ \t]+"/.test(line)).map(line => {
      const frame = /^ {2}File "([^\n]*)", line ([1-9]\d*), in ([^\n]+)$/.exec(line);
      ensure(frame && Number.isSafeInteger(Number(frame[2])), 'unparseable Python traceback frame');
      return frame;
    });
    const throwing = frames.at(-1);
    ensure(throwing && path.isAbsolute(throwing[1]) && throwing[1] === plan.assertionSource &&
      plan.assertionLines.includes(Number(throwing[2])) && Number.isSafeInteger(Number(throwing[2])),
    'wrong exact Python assertion frame');
  }
  return { tests: 1, failures: Number(summary[1]) };
}

/** @id CODE-RELQ-CONTENT-EVIDENCE-001 @implements REQ-RELQ-003 */
export function validateContentNative({ receipt, phase, target, plan }) {
  ensure(receipt?.receipt, 'retained native command receipt required');
  const recorded = JSON.parse(readRef(receipt.receipt));
  equal(recorded, Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receipt')));
  equal(receipt.command, plan.command);
  equal(receipt.cwd, plan.source);
  equal(receipt.signal, null);
  ensure(!receipt.timedOut && !receipt.outputLimit && !receipt.error, 'incomplete native command');
  equal(receipt.exit, phase === 'mutant' ? 1 : 0);
  ensure(plan.assertionLines.length > 0 && plan.assertionLines.every(line => Number.isSafeInteger(line) && line > 0),
    'positive independent assertion lines required');
  const stdout = readRef(receipt.stdout), stderr = readRef(receipt.stderr);
  if (plan.family === 'Python AssertionError') return parseContentPython(stdout + stderr, plan, phase === 'mutant');
  equal(plan.family, 'Node ERR_ASSERTION');
  ensure(!/ERR_MODULE_NOT_FOUND|SyntaxError:|MODULE_NOT_FOUND|Traceback \(most recent call last\)/.test(stdout + stderr),
    'setup failure cannot count as native assertion');
  const parsed = parseNative(stdout);
  const rows = namedControl(parsed, plan.targetNames, { failedTarget: phase === 'mutant' ? plan.targetNames[0] : null });
  if (phase === 'mutant') {
    ensure(ownedAssertion(rows[0].error, plan.assertionSource, plan.assertionLines), 'wrong exact native assertion owner/family');
    if (target.oracle?.failureWitnesses) {
      const message = rows[0].error.message;
      ensure(typeof message === 'string', 'native diagnostic message required');
      let diagnostics;
      try { diagnostics = JSON.parse(message.split('\n')[0]); }
      catch { ensure(false, 'native policy diagnostic must identify literal rows'); }
      ensure(Array.isArray(diagnostics) && target.oracle.failureWitnesses.some(witness =>
        diagnostics.some(row => Array.isArray(row) && row.length === 2 &&
          row[0] === witness.input && row[1] === witness.expected)), 'unrelated policy-row failure is not this mechanism');
    }
  }
  return parsed.counts;
}
