import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sha, fileSha, json, equal, ensure, inside, mkdir, save, fingerprint,
  npmAncestors, cleanEnvironment, executionEnvironment, execute, retainProcess, verdict, readRef, EXECUTION_ENV_KEYS, externalOutput, mapStrings,
} from './release-qualification-io.mjs';
import {
  parseNative, processControl, namedControl, validateHost, validateMutationRows,
} from './release-qualification-evidence.mjs';

const inheritedSha256 = 'e2f221e308e2fb4389f044e12c42cb2083e314b97305ae1701f65cd399c37de6';
const locked = ['.sdd/specs/release-qualification.md', '.sdd/release-validation.v0.2.3.json',
  '.sdd/specs/claude-code-support.md', 'README.md', 'README-ja.md', 'CLANGELOG.md',
  '.sdd/release-content-mutations.v0.2.3.json'];
const tuple = cell => ({ id: cell.id, runtime: cell.runtime, kind: cell.kind,
  mode: cell.mode ?? null, timeoutSeconds: cell.timeoutSeconds });
const sortedCells = cells => cells.map(tuple).sort((a, b) => a.id.localeCompare(b.id));
const requiredKinds = ['source', 'archive', 'package', 'helper', 'dependencies', 'configuration', 'environment'];

function scopePaths(request) {
  const root = path.resolve(request.root);
  return { root, planPath: request.planPath || path.join(root, locked[1]),
    inheritedPath: request.inheritedPath || path.join(root, '.sdd/release-validation.v0.2.0.json'),
    approvalsPath: request.approvalsPath || path.join(root, '.sdd/approvals.json') };
}
async function must(promise) {
  const result = await promise;
  ensure(result.status === 'PASS', (result.errors || []).join('; ') || 'required operation incomplete');
  return result;
}
function assertUnique(rows, key, label) {
  ensure(new Set(rows.map(row => row[key])).size === rows.length, `duplicate ${label}`);
}

export function executionInputPaths(execution, environment = execution.environment) {
  ensure(execution && Array.isArray(execution.runtimes), 'complete execution configuration required');
  equal(execution.runtimes.map(row => row.major).sort(), [20, 22, 24]);
  ensure(Array.isArray(execution.gradleJars) && execution.gradleJars.length > 0, 'Gradle dependencies required');
  const inputs = [execution.sourceRoot, execution.packagePath, execution.nodeModules, ...execution.gradleJars,
    ...(execution.dependencies || [])];
  for (const runtime of execution.runtimes) {
    inputs.push(runtime.executable, runtime.npm, path.resolve(path.dirname(runtime.npm), '..'));
  }
  ensure(typeof execution.prosePython === 'string' && path.isAbsolute(execution.prosePython),
    'absolute configured prose interpreter required');
  inputs.push(execution.prosePython, path.resolve(path.dirname(execution.prosePython), '..'),
    path.resolve(path.dirname(fs.realpathSync(execution.prosePython)), '..'));
  if (execution.gitHistory) inputs.push(execution.gitHistory.bundle);
  for (const key of ['MUSUBIX_DIAGNOSTICS_TEST_VENV', 'CARGO_HOME', 'RUSTUP_HOME',
    'DOTNET_ROOT', 'DOTNET_ROOT_X64', 'JULIA_DEPOT_PATH', 'R_LIBS_USER', 'GEM_HOME', 'MIX_HOME', 'HEX_HOME',
    'JAVA_HOME', 'GRADLE_HOME', 'R_HOME', 'R_LIBS', 'GEM_PATH', 'JULIA_PROJECT', 'JULIA_LOAD_PATH',
    'MUSUBIX_TEST_TSC', 'SDD_R34_TYPESCRIPT', 'QUALIFY_PROSE_PYTHON']) {
    if (environment?.[key] !== undefined) {
      const value = environment[key];
      ensure(typeof value === 'string' && value, `nonempty bound environment path required: ${key}`);
      const paths = ['R_LIBS', 'GEM_PATH', 'JULIA_LOAD_PATH', 'JULIA_DEPOT_PATH'].includes(key) ? value.split(path.delimiter) : [value];
      ensure(paths.every(file => path.isAbsolute(file)), `unsupported/unresolved environment path: ${key}`);
      inputs.push(...paths);
    }
  }
  ensure(inputs.every(input => typeof input === 'string' && path.isAbsolute(input)), 'absolute execution input paths required');
  return [...new Set(inputs)];
}

function assertExecutionClosure(manifest, effects) {
  ensure(manifest.execution?.qualifying === true || effects.probeTool, 'complete qualifying execution required');
  if (!manifest.execution) {
    ensure(effects.probeTool, 'complete execution configuration required');
    return;
  }
  const roots = [...manifest.files.map(file => file.path), ...manifest.tools.map(tool => tool.executable)]
    .map(file => fs.realpathSync(file));
  for (const input of [...executionInputPaths(manifest.execution),
    ...executionInputPaths(manifest.execution, manifest.environment.variables)]) {
    const real = fs.realpathSync(input);
    ensure(roots.some(root => inside(root, real)), `unbound execution input: ${input}`);
  }
}

function inputsDigest(manifest) {
  return sha(JSON.stringify({ files: manifest.files, tools: manifest.tools, environment: manifest.environment,
    commands: manifest.commands, catalogues: manifest.catalogues, execution: manifest.execution,
    cellCatalogues: manifest.cellCatalogues, requiredCells: manifest.requiredCells, exclusions: manifest.exclusions,
    registeredNames: manifest.registeredNames }));
}

function assertMatrix(manifest, scope) {
  equal(sortedCells(manifest.requiredCells), sortedCells(scope.requiredCells));
  equal(manifest.exclusions, scope.exclusions);
  equal(manifest.requiredCleanRuns, 2);
  equal(manifest.priorQualificationCredit, 0);
  equal(manifest.publishingAuthorized, false);
  equal(manifest.humanReleaseApproved, false);
  assertUnique(manifest.requiredCells, 'id', 'required cell');
  assertUnique(manifest.commands, 'cellId', 'command');
  equal(manifest.commands.map(row => row.cellId).sort(), scope.requiredCells.map(cell => cell.id).sort());
  for (const cell of scope.requiredCells) {
    const command = manifest.commands.find(row => row.cellId === cell.id);
    equal(command.timeoutSeconds, cell.timeoutSeconds);
    ensure(command.argv.length > 0 && command.argv.every(arg => typeof arg === 'string' && arg), 'actual command argv required');
  }

}

async function assertExecutionPolicy(manifest, scope) {
  if (!manifest.execution?.qualifying) return;
  const source = manifest.files.find(file => file.kind === 'source').path;
  equal(manifest.execution.sourceRoot, source);
  const packageFile = manifest.files.find(file => file.kind === 'package').path;
  equal(manifest.execution.packagePath, packageFile);
  equal(manifest.execution.packageSha256, fileSha(packageFile));
  const inherited = json(scope.inheritedPath);
  for (const [key, historical] of [
    ['oracles', 'oracleCatalogue'], ['mutations', 'mutationCatalogue'],
    ['diagnosticMutations', 'diagnosticMutationCatalogue'], ['hostMutations', 'hostMutationCatalogue'],
    ['watchdog', 'watchdogCatalogue'], ['scope', 'scopeCatalogue'], ['excludedTodos', 'excludedTodoNames'],
  ]) equal(manifest.catalogues[key], inherited[historical]);
  const files = json(path.join(source, 'package.json')).scripts.test.split(/\s+/).filter(arg => arg.endsWith('.test.mjs'));
  equal(manifest.execution.rootTestFiles, files);
  const { commandForCell, cellCatalogue } = await import('./release-qualification-cells.mjs');
  for (const cell of scope.requiredCells) {
    equal(manifest.commands.find(row => row.cellId === cell.id).argv, commandForCell(cell, files));
    equal(manifest.cellCatalogues[cell.id], mapStrings(cellCatalogue(manifest, cell, source),
      text => text.replaceAll(source, '{source}')));
  }
}

/** @id CODE-RELQ-001 @implements REQ-RELQ-001 */
export async function admitPlan(request) {
  return verdict(async () => {
    const paths = scopePaths(request);
    equal(fileSha(paths.inheritedPath), inheritedSha256);
    const inherited = json(paths.inheritedPath), plan = json(paths.planPath);
    ensure(plan.schemaVersion === 1 && plan.targetVersion === '0.2.3', 'unknown qualification plan');
    const required = inherited.requiredCells.filter(cell => cell.id !== 'NATIVE-WSLC');
    equal(sortedCells(plan.requiredCells), sortedCells(required));
    assertUnique(plan.requiredCells, 'id', 'required cell');
    ensure(plan.excludedCells.length === 1, 'one explicit WSL exclusion required');
    equal(tuple(plan.excludedCells[0]), tuple(inherited.requiredCells.find(cell => cell.id === 'NATIVE-WSLC')));
    ensure(plan.excludedCells[0].status === 'excluded-unvalidated' && plan.excludedCells[0].reason &&
      plan.excludedCells[0].approvalRequired === true, 'WSL exclusion is not a pass');
    ensure(plan.requiredCleanRuns === 2 && plan.priorQualificationCredit === 0 &&
      plan.consecutiveCompleteCleanRuns === 0 && plan.requiredMissingOrSkippedIsNotPass === true,
    'two fresh complete clean runs without transferred credit required');
    ensure(plan.humanReleaseApproved === false && plan.publishingAuthorized === false, 'qualification is not release authorization');
    equal(plan.inheritedManifest.sha256, inheritedSha256);
    const approval = json(paths.approvalsPath)['release-qualification'];
    ensure(approval?.kind === 'human' && approval.requireHuman === true && approval.tier === 'T2' &&
      typeof approval.by === 'string' && approval.by.trim() && !/^ai:/i.test(approval.by), 'current human artifact lock required');
    equal(Object.keys(approval.artifacts).sort(), [...locked].sort());
    for (const relative of locked) equal(fileSha(path.join(paths.root, relative)), approval.artifacts[relative]);
    equal(fileSha(paths.planPath), approval.artifacts[locked[1]]);
    equal(plan.contentMutationContract.path, locked[6]);
    equal(plan.contentMutationContract.sha256, approval.artifacts[locked[6]]);
    ensure(plan.contentMutationContract.approvalRequired === true, 'content catalogue approval required');
    return { ...paths, plan, planSha256: fileSha(paths.planPath), requiredCells: plan.requiredCells,
      exclusions: plan.excludedCells };
  });
}

/** @id CODE-RELQ-002 @implements REQ-RELQ-002 */
export async function freezeCandidate(request, effects = {}) {
  return verdict(async () => {
    const scope = await must(admitPlan(request));
    externalOutput(scope.root, request.outputPath);
    if (!effects.probeTool) {
      const { unresolvedMechanisms, discoverCurrentCatalogue, commandForCell } = await import('./release-qualification-cells.mjs');
      ensure(Object.keys(unresolvedMechanisms).length === 0,
        `unresolved mandatory mechanisms block freeze: ${Object.keys(unresolvedMechanisms).join(', ')}`);
      ensure(request.execution && request.cellCatalogues, 'complete executable frozen cell catalogues required');
      const discovery = await discoverCurrentCatalogue({
        source: request.files.find(file => file.kind === 'source').path,
        node20: request.tools.find(tool => tool.id === 'node20').executable,
        output: path.join(path.dirname(request.outputPath), `freeze-discovery-${Date.now()}`),
        environment: cleanEnvironment(request.environment.variables || {}, request.environment.canonicalPath),
        nodeModules: request.execution.nodeModules,
      });
      equal([...discovery.names].sort(), [...request.catalogues.regressions].sort());
      for (const cell of scope.requiredCells) equal(request.commands.find(row => row.cellId === cell.id).argv,
        commandForCell(cell, discovery.files));
    }
    ensure(!inside(scope.root, request.outputPath), 'frozen manifest must be outside source');
    ensure(!fs.existsSync(request.outputPath), 'frozen revision already exists');
    const inherited = json(scope.inheritedPath);
    const catalogues = request.catalogues;
    for (const name of [...inherited.catalogue, ...request.registeredNames]) {
      ensure(catalogues.regressions.includes(name), `missing named regression: ${name}`);
    }
    ensure(new Set(catalogues.regressions).size === catalogues.regressions.length, 'duplicate regression name');
    for (const [key, historical] of [
      ['oracles', 'oracleCatalogue'], ['mutations', 'mutationCatalogue'],
      ['diagnosticMutations', 'diagnosticMutationCatalogue'], ['hostMutations', 'hostMutationCatalogue'],
      ['watchdog', 'watchdogCatalogue'], ['scope', 'scopeCatalogue'], ['excludedTodos', 'excludedTodoNames'],
    ]) equal(catalogues[key], inherited[historical]);
    for (const kind of requiredKinds) ensure(request.files.some(file => file.kind === kind), `missing ${kind} input`);
    ensure(new Set(request.files.map(file => path.resolve(file.path))).size === request.files.length, 'duplicate input path');
    ensure(request.files.every(file => !inside(file.path, request.outputPath)), 'output is inside a frozen input');
    const files = request.files.map(file => ({ ...file, fingerprint: fingerprint(file.path) }));
    const source = request.files.find(file => file.kind === 'source').path;
    if (fs.statSync(source).isDirectory()) {
      const { validateCandidateTree } = await import('./release-qualification-cells.mjs');
      validateCandidateTree(source);
    }
    const requiredTools = ['node20', 'node22', 'node24', ...inherited.nativeEnvironment.tools.map(tool => tool.command)];
    for (const id of requiredTools) ensure(request.tools.some(tool => tool.id === id), `missing tool ${id}`);
    assertUnique(request.tools, 'id', 'tool');
    const tools = [];
    for (const tool of request.tools) {
      ensure(path.isAbsolute(tool.executable), 'absolute installed tool entry required');
      const before = fingerprint(tool.executable);
      const probe = await (effects.probeTool || probeTool)(tool, request.environment);
      ensure(probe.exit === 0 && probe.signal === null && !probe.timedOut && !probe.error && !probe.outputLimit, `tool unavailable: ${tool.id}`);
      equal((probe.stdout + probe.stderr).trim(), tool.expectedVersion.trim());
      if (/^node(20|22|24)$/.test(tool.id)) ensure(new RegExp(`^v${tool.id.slice(4)}\\.`).test(probe.stdout.trim()), 'wrong Node major');
      equal(fingerprint(tool.executable), before);
      tools.push({ ...tool, fingerprint: before, probe });
    }
    assertUnique(request.commands, 'cellId', 'command');
    equal(request.commands.map(row => row.cellId).sort(), scope.requiredCells.map(cell => cell.id).sort());
    for (const cell of scope.requiredCells) {
      const command = request.commands.find(row => row.cellId === cell.id);
      ensure(command.argv.length > 0 && command.argv.every(arg => typeof arg === 'string'), 'actual command argv required');
      equal(command.timeoutSeconds, cell.timeoutSeconds);
    }
    ensure(request.environment.platform === 'linux' && request.environment.arch === 'x64' &&
      request.environment.canonicalPath, 'canonical Linux x86_64 environment required');
    ensure(Object.keys(request.environment.variables || {}).every(key => EXECUTION_ENV_KEYS.includes(key)),
      'only non-secret allowlisted environment inputs may be frozen');
    let predecessor = {};
    if (request.previousManifestPath) {
      ensure(request.revisionReason?.trim(), 'manifest revision reason required');
      predecessor = { previousManifestPath: path.resolve(request.previousManifestPath),
        previousManifestSha256: fileSha(request.previousManifestPath), revisionReason: request.revisionReason };
    }
    const manifest = {
      schemaVersion: 1, frozenAt: new Date().toISOString(), ...scopePaths(request),
      planSha256: scope.planSha256, inheritedSha256, files, tools,
      environment: request.environment, environmentSha256: sha(JSON.stringify(request.environment)),
      npmAncestors: npmAncestors(scope.root), catalogues, registeredNames: request.registeredNames,
      commands: request.commands, requiredCells: scope.requiredCells, exclusions: scope.exclusions,
      requiredCleanRuns: 2, consecutiveCompleteCleanRuns: 0, priorQualificationCredit: 0,
      humanReleaseApproved: false, publishingAuthorized: false, ...predecessor,
      ...(request.cellCatalogues ? { cellCatalogues: request.cellCatalogues } : {}),
      ...(request.execution ? { execution: request.execution } : {}),
    };
    manifest.candidateSha256 = files.find(file => file.kind === 'source').fingerprint.sha256;
    assertExecutionClosure(manifest, effects);
    await assertExecutionPolicy(manifest, scope);
    manifest.inputsSha256 = inputsDigest(manifest);
    const output = save(request.outputPath, manifest);
    return { manifestPath: output.path, manifestSha256: output.sha256, manifest };
  });
}

/** @id CODE-RELQ-006 @implements REQ-RELQ-002 */
export async function checkFrozenCandidate(request, effects = {}) {
  return verdict(async () => {
    ensure(typeof request.manifestPath === 'string' && /^[a-f0-9]{64}$/.test(request.manifestSha256 || ''),
      'exact manifest path and expected SHA-256 required');
    const manifest = json(request.manifestPath);
    equal(fileSha(request.manifestPath), request.manifestSha256);
    const scope = await must(admitPlan(manifest));
    equal(scope.planSha256, manifest.planSha256);
    assertMatrix(manifest, scope);
    assertExecutionClosure(manifest, effects);
    await assertExecutionPolicy(manifest, scope);
    equal(inputsDigest(manifest), manifest.inputsSha256);
    equal(npmAncestors(manifest.root), manifest.npmAncestors);
    for (const file of manifest.files) equal(fingerprint(file.path), file.fingerprint);
    for (const tool of manifest.tools) {
      equal(fingerprint(tool.executable), tool.fingerprint);
      const current = await (effects.probeTool || probeTool)(tool, manifest.environment);
      ensure(current.exit === 0 && current.signal === null && !current.timedOut && !current.error &&
        !current.outputLimit, `probe incomplete: ${tool.id}`);
      equal(current.command, tool.probe.command);
      equal(current.stdout, tool.probe.stdout);
      equal(current.stderr, tool.probe.stderr);
    }
    equal(sha(JSON.stringify(manifest.environment)), manifest.environmentSha256);
    return { manifest, manifestSha256: fileSha(request.manifestPath) };
  });
}

/** @id CODE-RELQ-003 @implements REQ-RELQ-003 */
export async function validateCellEvidence(request) {
  return verdict(async () => {
    if (request.evidence.format === 'host-mutation') return validateHost(request);
    if (request.evidence.format === 'mutation') return validateMutationRows(request);
    if (request.evidence.format === 'adapter') {
      const { validateAdapter } = await import('./release-qualification-cells.mjs');
      return validateAdapter(request);
    }
    if (request.evidence.format === 'gate') {
      const { text } = processControl(request.evidence);
      ensure(/^SDD GATE PASS$/m.test(text) && !/\bINCOMPLETE\b|✗|SKIPPED/.test(text), 'integrated full gate did not pass');
      return { gate: 'PASS' };
    }
    const { text } = processControl(request.evidence);
    const parsed = parseNative(text, request.evidence.format);
    namedControl(parsed, request.catalogue, { excludedTodos: request.excludedTodos || [] });
    return { counts: parsed.counts, cases: parsed.rows };
  });
}

/** @id CODE-RELQ-004 @implements REQ-RELQ-004 */
export async function evaluateReadiness(request, effects = {}) {
  let streak = 0;
  const result = await verdict(async () => {
    const checked = await must(checkFrozenCandidate(request, effects));
    const manifest = checked.manifest;
    if (request.manifest) equal(request.manifest, { ...manifest, sha256: checked.manifestSha256 });
    const used = new Set(), ids = new Set();
    ensure(request.history === undefined, 'inline run history is not retained qualification evidence');
    const history = (effects.readHistory || readHistory)(request.historyPath).map(row => row.run);
    for (const run of history) {
      const row = await verdict(async () => {
        ensure(!ids.has(run.id), 'reused run ID');
        ids.add(run.id);
        ensure(run.status === 'PASS', 'non-clean run');
        equal(run.manifestSha256, request.manifestSha256);
        equal(run.candidateSha256, manifest.candidateSha256);
        equal(run.beforeInputsSha256, manifest.inputsSha256);
        equal(run.afterInputsSha256, manifest.inputsSha256);
        assertUnique(run.cells, 'id', 'run cell');
        equal(run.cells.map(cell => cell.id).sort(), manifest.requiredCells.map(cell => cell.id).sort());
        for (const key of ['sourceRoots', 'homeRoots', 'cacheRoots']) {
          const roots = run.state[key];
          ensure(roots.length === manifest.requiredCells.length, 'fresh per-cell roots missing');
          ensure(new Set(roots).size === roots.length, 'reused per-cell state');
          for (const root of roots) {
            ensure(path.isAbsolute(root) && !used.has(root), 'reused state from earlier run');
            used.add(root);
          }
        }
        for (const cell of run.cells) {
          equal(tuple(cell.cell), tuple(manifest.requiredCells.find(required => required.id === cell.id)));
          if (manifest.cellCatalogues) {
            const index = manifest.requiredCells.findIndex(required => required.id === cell.id);
            const expected = mapStrings(manifest.cellCatalogues[cell.id],
              text => text.replaceAll('{source}', run.state.sourceRoots[index]));
            equal(cell.catalogue, expected);
          }
          if (manifest.execution) {
            const index = manifest.requiredCells.findIndex(required => required.id === cell.id);
            const source = run.state.sourceRoots[index];
            const runtime = manifest.execution.runtimes.find(row => String(row.major) === cell.cell.runtime);
            const substitutions = { '{source}': source, '{node}': runtime.executable,
              '{context}': path.join(path.dirname(source), 'context.json') };
            const argv = manifest.commands.find(row => row.cellId === cell.id).argv.map(arg =>
              Object.entries(substitutions).reduce((text, [from, to]) => text.replaceAll(from, to), arg));
            equal(cell.evidence.command, argv);
          }
          await must(validateCellEvidence(cell));
        }
      });
      streak = row.status === 'PASS' ? Math.min(2, streak + 1) : 0;
    }
    for (const finding of request.findings || []) {
      ensure(['in-scope', 'out-of-scope'].includes(finding.scope), 'unclassified finding scope blocks readiness');
      ensure(['S1', 'S2', 'S3'].includes(finding.severity), 'unclassified finding blocks readiness');
      ensure(!(finding.scope === 'in-scope' && finding.state !== 'resolved' && ['S1', 'S2'].includes(finding.severity)),
        'unresolved in-scope S1/S2 finding');
      if (finding.state !== 'resolved' && finding.severity === 'S3') ensure(
        typeof finding.workaround === 'string' && finding.workaround.trim(), 'undisclosed S3 residual');
    }
    ensure(streak === 2, 'two consecutive complete fresh clean runs required');
    return { technicalReady: true };
  });
  return { ...result, streak, technicalReady: result.status === 'PASS',
    humanReleaseApproved: false, publishingAuthorized: false };
}

/** @id CODE-RELQ-007 @implements REQ-RELQ-004 */
export async function recordRun(request) {
  return verdict(async () => {
    mkdir(path.dirname(request.historyPath));
    const lock = request.historyPath + '.lock';
    const fd = fs.openSync(lock, 'wx', 0o600);
    try {
      const history = readHistory(request.historyPath);
      ensure(request.run.id && !history.some(row => row.run.id === request.run.id), 'immutable run ID already recorded');
      const lines = fs.existsSync(request.historyPath) ? fs.readFileSync(request.historyPath, 'utf8').trimEnd().split('\n') : [];
      const previousSha256 = lines.length ? sha(lines.at(-1)) : null;
      const row = { recordedAt: new Date().toISOString(), previousSha256, run: request.run };
      const descriptor = fs.openSync(request.historyPath, 'a', 0o600);
      try { fs.writeSync(descriptor, JSON.stringify(row) + '\n'); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      const head = request.historyPath + '.head.json';
      const pending = head + '.pending';
      save(pending, { entries: history.length + 1, tailSha256: sha(JSON.stringify(row)),
        historySha256: fileSha(request.historyPath) });
      fs.renameSync(pending, head);
      return { historyPath: request.historyPath, entries: history.length + 1 };
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  });
}

/** @id CODE-RELQ-008 @implements REQ-RELQ-004 */
export async function runQualificationCell(request, effects = {}) {
  return verdict(async () => {
    ensure(request.workRoot && request.sourceRoot && request.runtime?.canonicalPath, 'canonical execution inputs required');
    externalOutput(request.sourceRoot, request.workRoot);
    ensure(!inside(request.sourceRoot, request.workRoot), 'work state must be outside candidate source');
    mkdir(request.workRoot);
    const work = fs.mkdtempSync(path.join(request.workRoot, `${request.cell.id}-`));
    const destination = path.join(work, 'source'), home = path.join(work, 'home');
    mkdir(home);
    const candidateBefore = fingerprint(request.sourceRoot);
    await (effects.materializeSource || materializeSource)({ ...request, destination });
    const { env, cacheRoot } = executionEnvironment(request.environment || {}, request.runtime.canonicalPath, home);
    const invocation = {
      command: request.command, cwd: destination, env,
      timeoutMs: request.cell.timeoutSeconds * 1000,
    };
    const result = await (effects.execute || execute)(invocation);
    const evidence = { format: request.format || 'tap', ...retainProcess(path.join(work, 'evidence'),
      { ...result, command: invocation.command, cwd: invocation.cwd }) };
    equal(fingerprint(request.sourceRoot), candidateBefore);
    const validated = await must(validateCellEvidence({ ...request, evidence }));
    return { ...validated, cell: request.cell, catalogue: request.catalogue, evidence,
      state: { sourceRoot: destination, homeRoot: home, cacheRoot } };
  });
}

/** @id CODE-RELQ-005 @implements REQ-RELQ-005 */
export async function prepareReleaseReport(request) {
  const result = await verdict(async () => {
    ensure(request.humanReleaseApproved === false && request.publishingAuthorized === false, 'no release authorization is provided');
    ensure(request.readiness.status === 'PASS' && request.readiness.technicalReady === true && request.readiness.streak === 2,
      'technical readiness missing');
    equal(fileSha(request.packagePath), request.packageSha256);
    const helperNames = request.helpers.map(helper => path.basename(helper.path));
    for (const name of ['release-qualification.mjs', 'release-qualification.test.mjs',
      'release-host-mutations.mjs', 'release-host-mutations.test.mjs']) ensure(helperNames.includes(name), `missing durable helper ${name}`);
    for (const helper of request.helpers) equal(fileSha(helper.path), helper.sha256);
    validatePackageReceipts(request);
    ensure(request.exclusions.length === 1 && request.exclusions[0].id === 'NATIVE-WSLC' &&
      request.exclusions[0].status === 'excluded-unvalidated', 'explicit unvalidated WSL exclusion required');
    ensure(request.residualRisks.length > 0 && request.residualRisks.every(risk => typeof risk === 'string' && risk.trim()),
      'residual risks required');
    for (const artifact of request.artifacts) equal(fileSha(artifact.path), artifact.sha256);
    ensure(path.resolve(request.outputPath) !== path.resolve(request.packagePath) &&
      !request.helpers.some(helper => path.resolve(helper.path) === path.resolve(request.outputPath)),
    'report cannot overwrite candidate inputs');
    const report = { targetVersion: request.targetVersion, technicalReady: true, packagePath: request.packagePath,
      packageSha256: request.packageSha256, artifacts: request.artifacts, helpers: request.helpers,
      packageReceipts: request.packageReceipts, exclusions: request.exclusions,
      residualRisks: request.residualRisks, humanReleaseApproved: false, publishingAuthorized: false };
    const output = save(request.outputPath, report);
    return { reportPath: output.path, reportSha256: output.sha256, report };
  });
  return { ...result, humanReleaseApproved: false, publishingAuthorized: false };
}

/** @id CODE-RELQ-009 @implements REQ-RELQ-005 */
export async function verifyPackageEntrypoints(request, effects = {}) {
  return verdict(async () => {
    equal(fileSha(request.packagePath), request.packageSha256);
    equal(request.runtimes.map(runtime => runtime.major).sort(), [20, 22, 24]);
    mkdir(request.workRoot);
    const packageReceipts = [];
    for (const runtime of request.runtimes) {
      const workRoot = fs.mkdtempSync(path.join(request.workRoot, `package-${runtime.major}-`));
      packageReceipts.push(await (effects.installAndInvoke || installAndInvoke)({
        ...request, runtime, workRoot, offline: true, host: 'both',
      }));
    }
    validatePackageReceipts({ ...request, packageReceipts });
    equal(fileSha(request.packagePath), request.packageSha256);
    return { packageReceipts };
  });
}

export async function probeTool(tool, environment = {}) {
  return execute({ command: [tool.executable, ...tool.versionArgs], cwd: environment.cwd || process.cwd(),
    env: cleanEnvironment(environment.variables || {}, environment.canonicalPath), timeoutMs: tool.timeoutMs || 60000 });
}

export function readHistory(file) {
  const headPath = file + '.head.json';
  if (!fs.existsSync(file)) {
    ensure(!fs.existsSync(headPath), 'immutable run history missing behind retained head');
    return [];
  }
  const text = fs.readFileSync(file, 'utf8');
  ensure(text.endsWith('\n'), 'truncated immutable run history');
  const lines = text.trimEnd().split('\n');
  const rows = lines.map(line => JSON.parse(line));
  const head = json(headPath);
  equal(head, { entries: rows.length, tailSha256: sha(lines.at(-1)), historySha256: sha(text) });
  rows.forEach((row, index) => equal(row.previousSha256, index === 0 ? null : sha(lines[index - 1])));
  assertUnique(rows.map(row => row.run), 'id', 'history run');
  return rows;
}

export async function materializeSource(request) {
  ensure(!fs.existsSync(request.destination), 'cell source must be fresh');
  if (request.cell.kind === 'gate') {
    ensure(request.gitHistory?.bundle && request.gitHistory?.commit && request.gitHistory?.sha256, 'bound genuine gate Git history required');
    equal(fileSha(request.gitHistory.bundle), request.gitHistory.sha256);
    const result = await execute({ command: ['git', 'clone', '--no-checkout', request.gitHistory.bundle, request.destination],
      cwd: path.dirname(request.destination), env: cleanEnvironment(request.environment || {}, request.runtime.canonicalPath) });
    ensure(result.exit === 0 && !result.error && !result.signal, 'gate history clone failed');
    const checkout = await execute({ command: ['git', '-C', request.destination, 'checkout', '--detach', request.gitHistory.commit],
      cwd: request.destination, env: cleanEnvironment(request.environment || {}, request.runtime.canonicalPath) });
    ensure(checkout.exit === 0 && !checkout.error && !checkout.signal, 'gate history checkout failed');
    const git = path.join(request.destination, '.git');
    for (const name of fs.readdirSync(request.destination)) if (name !== '.git') fs.rmSync(path.join(request.destination, name), { recursive: true, force: true });
    fs.cpSync(request.sourceRoot, request.destination, { recursive: true, dereference: false });
    ensure(fs.existsSync(git), 'genuine approval history was lost');
  } else fs.cpSync(request.sourceRoot, request.destination, { recursive: true, dereference: false });
  if (request.nodeModules) {
    ensure(path.isAbsolute(request.nodeModules) && fs.existsSync(request.nodeModules), 'pinned installed Node dependency tree required');
    ensure(!fs.existsSync(path.join(request.destination, 'node_modules')), 'candidate unexpectedly contains Node dependencies');
    fs.symlinkSync(request.nodeModules, path.join(request.destination, 'node_modules'), 'dir');
  }
}

function validatePackageReceipts(request) {
  equal(request.packageReceipts.map(row => row.runtimeMajor).sort(), [20, 22, 24]);
  for (const receipt of request.packageReceipts) {
    ensure(receipt.tgzPath === request.packagePath && receipt.tgzSha256 === request.packageSha256, 'package receipt bound to wrong artifact');
    ensure(receipt.installedVersion === request.targetVersion && receipt.offline === true &&
      receipt.entrypoint === 'node_modules/.bin/musubix6' && receipt.host === 'both', 'not the exact offline package entry point');
    ensure(receipt.command.some(arg => path.basename(arg) === 'musubix6') &&
      receipt.exit === 0 && receipt.signal === null && !receipt.timedOut, 'package command incomplete');
    const log = JSON.parse(readRef(receipt.log));
    ensure(log.status === 'PASS' && log.version === request.targetVersion && log.runtimeMajor === receipt.runtimeMajor &&
      log.host === 'both', 'unparseable or mismatched retained package result');
    ensure(Array.isArray(log.commands) && log.commands.length >= 3, 'actual install, version and package-entry command receipts required');
    for (const command of log.commands) processControl(command);
    const install = log.commands.find(row => row.command.includes('install'));
    const version = log.commands.find(row => row.command.includes('--version') &&
      row.command.some(arg => path.basename(arg) === 'musubix6'));
    const init = log.commands.find(row => row.command.includes('init') &&
      row.command.some(arg => path.basename(arg) === 'musubix6'));
    ensure(install?.command.includes('--offline') && install.command.includes(request.packagePath) &&
      version && init && init.command.includes('both'), 'package receipt commands do not bind the exact offline artifact and entry point');
    equal(readRef(version.stdout).trim(), request.targetVersion);
    const a = receipt.inventories['.github/skills'], b = receipt.inventories['.claude/skills'];
    ensure(a?.length > 0 && b?.length > 0, 'both copied host inventories required');
    equal(a.filter(row => !row.path.startsWith('agent-watchdog/')), b);
  }
}

export async function verifyOnePackage(request) {
  equal(fileSha(request.packagePath), request.packageSha256);
  mkdir(request.workRoot);
  const home = path.join(request.workRoot, 'home');
  const env = cleanEnvironment(request.environment || {}, request.runtime.canonicalPath, home);
  const node = request.runtime.executable;
  const npm = request.runtime.npm;
  ensure(npm && path.isAbsolute(npm), 'pinned per-runtime npm CLI required');
  const run = async (label, argv) => {
    const result = await execute({ command: argv, cwd: request.workRoot, env, timeoutMs: 120000 });
    const receipt = retainProcess(path.join(request.workRoot, label), result);
    ensure(result.exit === 0 && result.signal === null && !result.error && !result.timedOut, `${label} package command failed`);
    return receipt;
  };
  const version = await run('runtime', [node, '--version']);
  ensure(readRef(version.stdout).trim().startsWith(`v${request.runtime.major}.`), 'wrong real runtime');
  const install = await run('install', [node, npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--no-package-lock', '--prefix', request.workRoot, request.packagePath]);
  const bin = path.join(request.workRoot, 'node_modules/.bin/musubix6');
  const installed = await run('version', [node, bin, '--version']);
  equal(readRef(installed.stdout).trim(), request.targetVersion);
  const destination = path.join(request.workRoot, 'initialized');
  const invoked = await run('init', [node, bin, 'init', destination, '--host', 'both']);
  const inventory = directory => fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    ensure(!entry.isSymbolicLink(), 'self-contained package assets required');
    return entry.isDirectory() ? inventory(absolute).map(row => ({ ...row, path: `${entry.name}/${row.path}` })) :
      [{ path: entry.name, sha256: fileSha(absolute) }];
  });
  const inventories = Object.fromEntries(['.github/skills', '.claude/skills'].map(host => [host, inventory(path.join(destination, host))]));
  const log = save(path.join(request.workRoot, 'package-result.json'), {
    runtimeMajor: request.runtime.major, version: request.targetVersion, host: 'both', status: 'PASS',
    copiedHosts: Object.keys(inventories), commands: [version, install, installed, invoked],
  });
  equal(fileSha(request.packagePath), request.packageSha256);
  return { runtimeMajor: request.runtime.major, tgzPath: request.packagePath, tgzSha256: request.packageSha256,
    installedVersion: request.targetVersion, offline: true, entrypoint: 'node_modules/.bin/musubix6',
    host: 'both', command: invoked.command,
    exit: 0, signal: null, timedOut: false, log, inventories };
}

const installAndInvoke = verifyOnePackage;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Finish evaluating this shared API before the CLI imports it back.
  import('./release-qualification-cli.mjs').then(({ main }) => main(process.argv.slice(2))).then(code => {
    process.exitCode = code;
  }, error => {
    console.error(JSON.stringify({ status: 'FAIL', errors: [error.message], publishingAuthorized: false }));
    process.exitCode = 1;
  });
}
