import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hostMutations, parseHostEvidence, prepareHostOutput, replace, runHostMutation } from './release-host-mutations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inherited = JSON.parse(fs.readFileSync(path.join(root, '.sdd/release-validation.v0.2.0.json')));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** @id TEST-RELQ-HOST-001 @verifies REQ-RELQ-003 REQ-RELQ-005 */
test('TEST-RELQ-HOST-001 retains every inherited host mechanism and detects current version mutants with owned restored controls', t => {
  const cases = hostMutations('0.2.3');
  assert.deepEqual(cases.map(item => item.name), inherited.hostMutationCatalogue,
    'all28 inherited host mechanisms must remain executable on the current candidate');
  assert.equal(replace('alpha', 'beta')('alpha'), 'beta');
  assert.equal(replace('alpha', 'beta', true)('alpha alpha'), 'beta beta');
  assert.throws(() => replace('alpha', 'beta')('absent'), /anchor/);
  assert.throws(() => replace('alpha', 'beta')('alpha alpha'), /anchor/);
  assert.throws(() => replace('alpha', 'alpha')('alpha'), /no.op/);
  assert.throws(() => hostMutations('0.2.3-dev.0'), /stable/);
  for (const item of cases) {
    const original = fs.readFileSync(path.join(root, item.file), 'utf8');
    assert.notEqual(item.mutate(original), original, `${item.name}: current mutation must apply`);
  }
  const names = ['001', '002', '003', '004', '005'].map(id => `TEST-HOST-${id} independent case`);
  const options = { test: 'TEST-HOST-005', testNames: names, expectedLines: [12], sourceTest: '/oracle.test.mjs' };
  const events = names.map(name => ({
    type: 'test:pass', data: { name, nesting: 0, ...(name === names[4] ? {} : { skip: 'test name does not match pattern' }) },
  }));
  events.push({ type: 'test:plan', data: { nesting: 0, count: 5 } });
  const encode = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const passing = parseHostEvidence(encode(events), options);
  assert.deepEqual(passing.counts, { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(passing.nativeCounts.skipped, 4, 'Node20 nonselected cases must remain disclosed');
  assert.deepEqual(passing.filteredNames, names.slice(0, 4));
  const allowedRows = new Set([
    'selected/pass/unset/unset', 'selected/pass/unset/false',
    'selected/pass/false/unset', 'selected/pass/false/false',
    'selected/fail/unset/unset', 'selected/fail/unset/false',
    'selected/fail/false/unset', 'selected/fail/false/false',
    'filtered/pass/pattern/unset', 'filtered/pass/pattern/false',
  ]);
  const flags = [['unset', undefined], ['false', false], ['true', true],
    ['pattern', 'test name does not match pattern']];
  for (const role of ['selected', 'filtered']) {
    for (const verdict of ['pass', 'fail']) {
      for (const [skipName, skip] of flags) {
        for (const [todoName, todo] of flags) {
          const label = `${role}/${verdict}/${skipName}/${todoName}`;
          const rows = structuredClone(events);
          const row = rows[role === 'selected' ? 4 : 0];
          row.type = `test:${verdict}`;
          delete row.data.skip;
          delete row.data.todo;
          if (skip !== undefined) row.data.skip = skip;
          if (todo !== undefined) row.data.todo = todo;
          if (allowedRows.has(label)) assert.doesNotThrow(() => parseHostEvidence(encode(rows), options), label);
          else assert.throws(() => parseHostEvidence(encode(rows), options), label);
        }
      }
    }
  }
  const failed = structuredClone(events);
  failed[4].type = 'test:fail';
  failed[4].data.details = { error: { code: 'ERR_ASSERTION', stack: 'at file:///oracle.test.mjs:12:3' } };
  assert.equal(parseHostEvidence(encode(failed), options).assertion, true);
  for (const change of [
    rows => { rows[4].data.skip = true; },
    rows => { rows[4].data.todo = true; },
    rows => { rows.splice(4, 1); },
    rows => { rows.splice(4, 0, structuredClone(rows[4])); },
    rows => { rows.unshift(structuredClone(rows[0])); rows.at(-1).data.count++; },
    rows => { rows[0].data.skip = 'required runtime unavailable'; },
    rows => { delete rows[0].data.skip; },
    rows => { rows[0].data.todo = true; },
    rows => { rows[0].data.name = 'unknown filtered case'; },
    rows => { rows[4].data.name = '/file-level-success.test.mjs'; },
    rows => { rows[5].data.count = 0; },
  ]) {
    const invalid = structuredClone(events);
    change(invalid);
    assert.throws(() => parseHostEvidence(encode(invalid), options));
  }
  assert.throws(() => parseHostEvidence('{unparseable', options));
  const wrongOwner = structuredClone(failed);
  wrongOwner[4].data.details.error.stack = 'at file:///oracle.test.mjs:99:3';
  assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, false);
  wrongOwner[4].data.details.error.stack = 'at file:///other/oracle.test.mjs:12:3';
  assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, false,
    'a filename suffix from a different source is not an owned assertion');
  wrongOwner[4].data.details.error.stack = 'AssertionError: at file:///oracle.test.mjs:12:3';
  assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, false,
    'an error message is not a native stack frame');
  for (const frame of ['at file:///production.mjs:1:1', 'at relative-production.mjs:1:1', 'at unparseable-frame']) {
    wrongOwner[4].data.details.error.stack = frame + '\n    at file:///oracle.test.mjs:12:3';
    assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, false,
      'an owned caller must not authorize a different throwing frame');
  }
  wrongOwner[4].data.details.error.stack = 'at file:///oracle.test.mjs:12:3\n    at file:///production.mjs:1:1';
  assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, true, 'owned throw followed by production caller is valid');
  const diagnostic = structuredClone(failed), diagnosticError = diagnostic[4].data.details.error;
  diagnosticError.name = 'AssertionError';
  diagnosticError.message = 'literal diagnostic\n    at file:///oracle.test.mjs:12:3';
  diagnosticError.stack = `AssertionError [ERR_ASSERTION]: ${diagnosticError.message}\n    at file:///production.mjs:1:1`;
  assert.equal(parseHostEvidence(encode(diagnostic), options).assertion, false, 'a multiline message must not supply a throwing frame');
  diagnosticError.message = 'literal diagnostic\n    at file:///production.mjs:1:1';
  diagnosticError.stack = `AssertionError [ERR_ASSERTION]: ${diagnosticError.message}\n    at file:///oracle.test.mjs:12:3`;
  assert.equal(parseHostEvidence(encode(diagnostic), options).assertion, true, 'frame-like message data must not hide a valid owned throw');
  for (const expectedLines of [[], [0], ['12|99']]) {
    assert.throws(() => parseHostEvidence(encode(failed), { ...options, expectedLines }));
  }
  wrongOwner[4].data.details.error = { code: 'MODULE_NOT_FOUND', stack: 'at file:///oracle.test.mjs:12:3' };
  assert.equal(parseHostEvidence(encode(wrongOwner), options).assertion, false);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'musubix-release-host-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const before = ['package.json', 'bin/musubix6.mjs'].map(file => digest(path.join(root, file)));
  for (const name of ['version', 'packed-cli-version']) {
    const row = runHostMutation({ source: root, output, mutation: cases.find(item => item.name === name) });
    assert.equal(row.name, name);
    assert.deepEqual([row.baseline.status, row.mutant.status, row.restored.status], [0, 1, 0]);
    assert.equal(row.mutant.assertion, true, 'mutant must fail at its independently selected assertion');
    assert.ok(row.mutant.assertionLines.length > 0);
    for (const [phase, receipt] of Object.entries({
      baseline: row.baseline, mutant: row.mutant, restored: row.restored,
    })) {
      assert.equal(receipt.signal, null, `${name}/${phase}`);
      assert.equal(receipt.logSha256, digest(receipt.log), `${name}/${phase}: retained log`);
      assert.deepEqual(receipt.counts, {
        tests: 1, pass: phase === 'mutant' ? 0 : 1, fail: phase === 'mutant' ? 1 : 0,
        cancelled: 0, skipped: 0, todo: 0,
      });
    }
  }
  assert.throws(() => runHostMutation({
    source: root, output,
    mutation: {
      ...cases.find(item => item.name === 'version'), name: 'wrong-owned-assertion',
      expectedAssertionNeedles: ['assert.equal(lock.version, pkg.version);'],
    },
  }), /not the expected owned assertion/);
  const sourceControl = path.join(output, 'source-control');
  fs.mkdirSync(path.join(sourceControl, '.sdd'), { recursive: true });
  fs.writeFileSync(path.join(sourceControl, 'package.json'), '{"version":"0.2.3"}\n');
  fs.writeFileSync(path.join(sourceControl, '.sdd/release-validation.v0.2.0.json'),
    JSON.stringify({ hostMutationCatalogue: inherited.hostMutationCatalogue }));
  const alias = path.join(output, 'source-alias');
  fs.symlinkSync(sourceControl, alias);
  for (const [index, candidate] of [sourceControl, alias].entries()) {
    const forbidden = path.join(candidate, `forbidden-${index}`);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/release-host-mutations.mjs')], {
      cwd: output, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, QUALIFY_SOURCE: sourceControl, QUALIFY_MUTATION_OUTPUT: forbidden },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(forbidden), false, 'invalid evidence output must be refused before writing');
    assert.match(result.stderr, /evidence must be outside the source/);
  }
  const validOutput = path.join(output, 'valid-external-evidence');
  let prepared;
  assert.doesNotThrow(() => { prepared = prepareHostOutput(sourceControl, validOutput); },
    'valid outside evidence input must be accepted');
  assert.equal(prepared, validOutput);
  assert.ok(fs.statSync(prepared).isDirectory());
  assert.deepEqual(['package.json', 'bin/musubix6.mjs'].map(file => digest(path.join(root, file))), before,
    'isolated mutations must not modify the source candidate');
});
