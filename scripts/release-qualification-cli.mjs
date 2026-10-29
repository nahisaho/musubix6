import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  admitPlan, freezeCandidate, checkFrozenCandidate, validateCellEvidence, evaluateReadiness,
  recordRun, materializeSource, probeTool, executionInputPaths,
} from './release-qualification.mjs';
import { hostMutations } from './release-host-mutations.mjs';
import {
  discoverCurrentCatalogue, commandForCell, cellCatalogue, unresolvedMechanisms,
} from './release-qualification-cells.mjs';
import {
  fileSha, json, equal, ensure, inside, mkdir, save,
  execute, cleanEnvironment, executionEnvironment, retainProcess, verdict, EXECUTION_ENV_KEYS, mapStrings, externalOutput,
} from './release-qualification-io.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const policyFile = '.sdd/release-validation.v0.2.4.json';

export function parseArguments(args) {
  const [mode, flag, file, ...rest] = args;
  ensure(['preflight', 'prepare', 'freeze', 'check', 'run', 'status'].includes(mode), 'mode must be preflight|prepare|freeze|check|run|status');
  ensure(flag === '--input' && typeof file === 'string' && file && rest.length === 0, 'exact --input JSON_FILE required');
  return { mode, file: path.resolve(file) };
}

export function canonicalEnvironment(configuration, runtime) {
  ensure(path.isAbsolute(runtime.executable) && Array.isArray(configuration.basePath) &&
    configuration.basePath.length > 0 && configuration.basePath.every(directory => path.isAbsolute(directory)),
  'explicit canonical tool PATH directories required');
  ensure(!configuration.basePath.some(directory => configuration.runtimes.some(other =>
    path.dirname(other.executable) === directory)), 'base PATH must not inherit another sampled Node');
  const canonicalPath = [...new Set([path.dirname(runtime.executable), ...configuration.basePath])].join(path.delimiter);
  return { canonicalPath, variables: cleanEnvironment(configuration.environment || {}, canonicalPath) };
}

export function preparationEnvironment(configuration, runtime, phase) {
  ensure(['probe', 'git', 'archive', 'package'].includes(phase), 'unknown preparation phase');
  externalOutput(configuration.source || root, configuration.workRoot);
  const environment = canonicalEnvironment(configuration, runtime);
  return { ...environment, variables: cleanEnvironment(environment.variables, environment.canonicalPath,
    path.join(configuration.workRoot, `${phase}-home`)) };
}

export function validateArchiveMembers(names) {
  ensure(names.length > 0, 'empty archive');
  for (const name of names) {
    ensure(typeof name === 'string' && name && !path.posix.isAbsolute(name) && !name.includes('\\') &&
      !name.split('/').includes('..') && !name.split('/').includes('.git') &&
      !name.split('/').includes('__pycache__') && !/\.py[co]$/.test(name), `unsafe/generated archive member: ${name}`);
  }
}

export function nativeToolProbes(inherited) {
  // The archived bash arguments invoke the excluded WSL wrapper, not a Linux runtime probe.
  return inherited.nativeEnvironment.tools.map(historical => ({
    ...historical, args: historical.command === 'bash' ? ['--version'] : historical.args,
  }));
}

async function must(promise) {
  const value = await promise;
  ensure(value.status === 'PASS', value.errors.join('; '));
  return value;
}

export async function observeFrozenCandidate(input, effects = {}) {
  return verdict(async () => {
    ensure(input.manifestPath && /^[a-f0-9]{64}$/.test(input.manifestSha256 || '') && input.historyPath,
      'exact manifest path/hash and immutable history required');
    if (fs.existsSync(input.manifestPath) && fileSha(input.manifestPath) === input.manifestSha256) {
      const manifest = json(input.manifestPath);
      for (const candidate of [manifest.root, manifest.execution?.sourceRoot].filter(Boolean)) {
        externalOutput(candidate, input.historyPath);
      }
    } else {
      externalOutput(root, input.historyPath);
      const preparedSource = path.join(path.dirname(input.manifestPath), 'candidate', 'source');
      if (fs.existsSync(preparedSource)) externalOutput(preparedSource, input.historyPath);
    }
    const checked = await checkFrozenCandidate(input, effects);
    if (checked.status !== 'PASS') await must(recordRun({
      historyPath: input.historyPath,
      run: { id: `observed-${randomUUID()}`, status: 'FAIL', manifestSha256: input.manifestSha256,
        candidateSha256: null, cells: [], errors: checked.errors, startedAt: new Date().toISOString() },
    }));
    return checked;
  });
}

export async function preflight(configuration) {
  return verdict(async () => {
    const configKeys = ['source', 'workRoot', 'runtimes', 'basePath', 'environment', 'tools',
      'dependencies', 'gradleJars', 'prosePython', 'nodeModules'];
    ensure(Object.keys(configuration).every(key => configKeys.includes(key)), 'unknown qualification configuration field');
    ensure(Object.keys(configuration.environment || {}).every(key => EXECUTION_ENV_KEYS.includes(key)),
      'environment contains a non-allowlisted setting; credentials are never qualification inputs');
    const source = path.resolve(configuration.source || root);
    await must(admitPlan({ root: source }));
    ensure(configuration.workRoot && !inside(source, configuration.workRoot), 'external persistent work root required');
    externalOutput(source, configuration.workRoot);
    mkdir(configuration.workRoot);
    equal(configuration.runtimes.map(runtime => runtime.major).sort(), [20, 22, 24]);
    ensure(configuration.runtimes.every(runtime => Object.keys(runtime).every(key =>
      ['major', 'executable', 'npm', 'canonicalPath'].includes(key))), 'unknown runtime descriptor field');
    const node20 = configuration.runtimes.find(runtime => runtime.major === 20);
    const env = preparationEnvironment(configuration, node20, 'probe');
    const tools = [];
    for (const runtime of configuration.runtimes) {
      const versionArgs = ['--version'];
      const probe = await probeTool({ executable: runtime.executable, versionArgs }, env);
      ensure(probe.exit === 0 && new RegExp(`^v${runtime.major}\\.`).test(probe.stdout.trim()), `genuine Node${runtime.major} required`);
      tools.push({ id: `node${runtime.major}`, executable: runtime.executable, versionArgs, expectedVersion: probe.stdout.trim() });
      ensure(path.isAbsolute(runtime.npm) && fs.existsSync(runtime.npm), 'real per-runtime npm CLI required');
    }
    const inherited = json(path.join(source, '.sdd/release-validation.v0.2.0.json'));
    for (const historical of nativeToolProbes(inherited)) {
      const entry = configuration.tools[historical.command];
      ensure(entry && path.isAbsolute(entry.executable), `native tool unavailable: ${historical.command}`);
      ensure(Object.keys(entry).every(key => ['executable', 'versionArgs', 'timeoutMs'].includes(key)), 'unknown native tool descriptor field');
      const descriptor = { id: historical.command, ...entry, versionArgs: entry.versionArgs || historical.args };
      equal(descriptor.versionArgs, historical.args);
      const probe = await probeTool(descriptor, env);
      ensure(probe.exit === 0 && !probe.signal && !probe.timedOut && !probe.error, `native tool probe failed: ${descriptor.id}`);
      descriptor.expectedVersion = (probe.stdout + probe.stderr).trim();
      tools.push(descriptor);
    }
    const discovery = await discoverCurrentCatalogue({
      source, node20: node20.executable, output: path.join(configuration.workRoot, `discovery-${Date.now()}`),
      environment: env.variables,
    });
    for (const name of inherited.catalogue) ensure(discovery.names.includes(name), `historical regression missing: ${name}`);
    for (const name of inherited.excludedTodoNames) ensure(discovery.names.includes(name), `unknown TODO exclusion: ${name}`);
    const catalogues = {
      regressions: discovery.names, oracles: inherited.oracleCatalogue,
      mutations: inherited.mutationCatalogue, diagnosticMutations: inherited.diagnosticMutationCatalogue,
      hostMutations: inherited.hostMutationCatalogue, watchdog: inherited.watchdogCatalogue,
      scope: inherited.scopeCatalogue, excludedTodos: inherited.excludedTodoNames,
    };
    const plan = json(path.join(source, policyFile));
    const hostCatalogue = hostMutations('0.2.4').map(mutation => {
      const row = { ...mutation };
      delete row.mutate;
      const text = fs.readFileSync(path.join(source, 'scripts/host-compatibility.test.mjs'), 'utf8').split('\n');
      const assertionLines = row.expectedAssertionNeedles.flatMap(needle => {
        const lines = text.flatMap((line, index) => line.includes(needle) ? [index + 1] : []);
        ensure(lines.length === 1, `independent host assertion unresolved: ${row.name}`);
        return lines;
      });
      return { ...row, assertionLines };
    });
    const manifest = { catalogues, execution: { hostCatalogue } };
    const resolvedCatalogues = {};
    for (const cell of plan.requiredCells) resolvedCatalogues[cell.id] = cellCatalogue(manifest, cell, source);
    const blockers = Object.entries(unresolvedMechanisms).map(([id, reason]) => ({ id, stage: 'contract', reason }));
    ensure(configuration.prosePython, 'actual GiNZA Python entry required');
    ensure(configuration.gradleJars?.length > 0, 'pinned offline Gradle JUnit dependencies required');
    const output = {
      status: blockers.length ? 'INCOMPLETE' : 'PASS', qualifyingCredit: 0, source, tools,
      catalogues, registeredNames: discovery.names, discovery: discovery.evidence, resolvedCatalogues,
      hostCatalogue, commands: plan.requiredCells.map(cell => ({
        cellId: cell.id, argv: commandForCell(cell, discovery.files), timeoutSeconds: cell.timeoutSeconds,
      })), blockers,
    };
    save(path.join(configuration.workRoot, 'preflight.json'), output);
    return output;
  });
}

export async function prepare(configuration) {
  return verdict(async () => {
    // Preparation refuses unresolved semantics before creating a candidate or credit.
    const checked = await must(preflight(configuration));
    ensure(checked.blockers.length === 0, 'unresolved mandatory semantics block preparation');
    const source = checked.source;
    const runtime = configuration.runtimes.find(row => row.major === 24);
    const git = async argv => {
      const result = await execute({ command: ['git', '-C', source, ...argv], cwd: source,
        env: preparationEnvironment(configuration, runtime, 'git').variables, timeoutMs: 120000 });
      ensure(result.exit === 0 && !result.signal && !result.error, 'candidate Git operation failed');
      return result.stdout.trim();
    };
    ensure(await git(['status', '--porcelain']) === '', 'final committed clean candidate required');
    const commit = await git(['rev-parse', 'HEAD']);
    const candidate = path.join(configuration.workRoot, 'candidate');
    mkdir(candidate);
    const archive = path.join(candidate, 'source.tar'), extracted = path.join(candidate, 'source');
    await git(['archive', '--format=tar', `--output=${archive}`, commit]);
    const fixedEnv = preparationEnvironment(configuration, runtime, 'archive').variables;
    const members = await execute({ command: ['tar', '-tf', archive], cwd: candidate, env: fixedEnv });
    ensure(members.exit === 0, 'source archive unreadable');
    validateArchiveMembers(members.stdout.trim().split('\n'));
    mkdir(extracted);
    const unpacked = await execute({ command: ['tar', '-xpf', archive, '-C', extracted], cwd: candidate, env: fixedEnv });
    ensure(unpacked.exit === 0, 'source extraction failed');
    const bundle = path.join(candidate, 'history.bundle');
    await git(['bundle', 'create', bundle, '--all']);
    const env = preparationEnvironment(configuration, runtime, 'package');
    const packDir = path.join(candidate, 'package');
    mkdir(packDir);
    const packed = await execute({ command: [runtime.executable, runtime.npm, 'pack', '--offline', '--ignore-scripts',
      '--json', '--pack-destination', packDir], cwd: extracted, env: env.variables, timeoutMs: 120000 });
    const packReceipt = retainProcess(path.join(configuration.workRoot, 'pack-command'), packed);
    ensure(packed.exit === 0, 'candidate npm pack failed');
    const packRows = JSON.parse(packed.stdout);
    ensure(packRows.length === 1, 'one exact candidate package required');
    validateArchiveMembers(packRows[0].files.map(file => file.path));
    const packagePath = path.join(packDir, packRows[0].filename);
    const inherited = json(path.join(source, '.sdd/release-validation.v0.2.0.json'));
    const files = [
      { kind: 'source', path: extracted }, { kind: 'archive', path: archive },
      { kind: 'package', path: packagePath }, { kind: 'configuration', path: path.join(source, '.sdd/config.json') },
      { kind: 'environment', path: save(path.join(candidate, 'environment.json'), configuration.environment || {}).path },
      { kind: 'git-history', path: bundle },
      ...['npm_config_userconfig', 'npm_config_globalconfig', 'GIT_CONFIG_GLOBAL']
        .map(key => ({ kind: 'configuration', path: env.variables[key] })),
      ...fs.readdirSync(path.join(source, 'scripts')).filter(file => /^release-(?:qualification|host).*\.mjs$/.test(file))
        .map(file => ({ kind: 'helper', path: path.join(source, 'scripts', file) })),
      ...(configuration.dependencies || []).map(file => ({ kind: 'dependencies', path: file })),
      ...configuration.runtimes.map(row => ({ kind: 'runtime-npm', path: row.npm })),
    ];
    const request = {
      root: source, outputPath: path.join(configuration.workRoot, 'frozen-manifest.json'), files,
      tools: checked.tools, registeredNames: checked.registeredNames, catalogues: checked.catalogues,
      commands: checked.commands, environment: { ...env, platform: 'linux', arch: 'x64' },
      execution: {
        ...configuration, qualifying: true, packagePath, packageSha256: fileSha(packagePath), sourceRoot: extracted,
        nodeModules: configuration.nodeModules || path.join(source, 'node_modules'),
        gitHistory: { bundle, sha256: fileSha(bundle), commit }, hostCatalogue: checked.hostCatalogue,
        rootTestFiles: testFilesFromPackage(source), packReceipt,
      },
    };
    for (const input of [...executionInputPaths(request.execution),
      ...executionInputPaths(request.execution, request.environment.variables)]) {
      const real = fs.realpathSync(input);
      if (!files.some(file => inside(fs.realpathSync(file.path), real)) &&
        !request.tools.some(tool => fs.realpathSync(tool.executable) === real)) {
        files.push({ kind: 'dependencies', path: input });
      }
    }
    request.cellCatalogues = {};
    for (const cell of json(path.join(source, policyFile)).requiredCells) {
      const catalogue = cellCatalogue({ catalogues: checked.catalogues, execution: request.execution }, cell, source);
      request.cellCatalogues[cell.id] = mapStrings(catalogue, text => text.replaceAll(source, '{source}'));
    }
    for (const name of inherited.catalogue) ensure(request.catalogues.regressions.includes(name), 'regression catalogue weakened');
    const retained = save(path.join(configuration.workRoot, 'freeze-request.json'), request);
    return { requestPath: retained.path, requestSha256: retained.sha256, qualifyingCredit: 0 };
  });
}

function testFilesFromPackage(source) {
  return json(path.join(source, 'package.json')).scripts.test.split(/\s+/).filter(arg => arg.endsWith('.test.mjs'));
}

export async function runManifest(input) {
  return verdict(async () => {
    ensure(input.manifestPath && input.manifestSha256 && input.historyPath && input.outputRoot,
      'exact manifest path/hash, history and output root required');
    const checked = await checkFrozenCandidate(input);
    if (checked.status !== 'PASS') {
      const run = { id: `refused-${Date.now()}-${process.pid}`, status: 'FAIL', manifestSha256: input.manifestSha256,
        candidateSha256: null, cells: [], errors: checked.errors, startedAt: new Date().toISOString() };
      await must(recordRun({ historyPath: input.historyPath, run }));
      return { status: 'FAIL', errors: checked.errors, run, publishingAuthorized: false };
    }
    const manifest = checked.manifest, configuration = manifest.execution;
    ensure(configuration && !inside(configuration.sourceRoot, input.outputRoot), 'external run state required');
    for (const candidate of [manifest.root, configuration.sourceRoot]) {
      externalOutput(candidate, input.outputRoot);
      externalOutput(candidate, input.historyPath);
    }
    mkdir(input.outputRoot);
    const output = fs.mkdtempSync(path.join(input.outputRoot, 'run-'));
    const run = {
      id: path.basename(output), manifestSha256: input.manifestSha256, candidateSha256: manifest.candidateSha256,
      beforeInputsSha256: manifest.inputsSha256, afterInputsSha256: null, status: 'INCOMPLETE', cells: [],
      state: { sourceRoots: [], homeRoots: [], cacheRoots: [] }, startedAt: new Date().toISOString(),
    };
    try {
      for (const cell of manifest.requiredCells) {
        const cellRoot = path.join(output, cell.id), source = path.join(cellRoot, 'source'), home = path.join(cellRoot, 'home');
        mkdir(cellRoot);
        const runtime = configuration.runtimes.find(row => String(row.major) === cell.runtime);
        const environment = canonicalEnvironment(configuration, runtime);
        const { env, cacheRoot } = executionEnvironment(environment.variables, environment.canonicalPath, home);
        const adapterOutput = path.join(cellRoot, 'adapter');
        mkdir(adapterOutput);
        run.state.sourceRoots.push(source); run.state.homeRoots.push(home); run.state.cacheRoots.push(cacheRoot);
        await materializeSource({ cell, sourceRoot: configuration.sourceRoot, destination: source,
          gitHistory: configuration.gitHistory, environment: env, nodeModules: configuration.nodeModules,
          runtime: { ...runtime, canonicalPath: environment.canonicalPath } });
        const catalogue = cellCatalogue(manifest, cell, source);
        const context = save(path.join(cellRoot, 'context.json'), {
          cell, source, output: adapterOutput, node: runtime.executable, environment: env, catalogue,
          configuration, tools: Object.fromEntries(manifest.tools.map(tool => [tool.id, tool.executable])),
        });
        env.QUALIFY_SOURCE = source; env.QUALIFY_MUTATION_OUTPUT = adapterOutput;
        env.QUALIFY_DEVELOPMENT_DIR = path.join(cellRoot, 'unit-fixtures');
        env.QUALIFY_CONTEXT = context.path;
        const substitutions = { '{node}': runtime.executable, '{source}': source, '{context}': context.path };
        const argv = manifest.commands.find(row => row.cellId === cell.id).argv.map(arg =>
          Object.entries(substitutions).reduce((text, [from, to]) => text.replaceAll(from, to), arg));
        const result = await execute({ command: argv, cwd: source, env, timeoutMs: cell.timeoutSeconds * 1000 });
        const format = ['suite', 'watchdog', 'scope', 'oracle', 'process'].includes(cell.kind) ? 'events' :
          cell.kind === 'host-mutation' ? 'host-mutation' : ['mutation', 'diagnostic-mutation'].includes(cell.kind) ? 'mutation' :
            cell.kind === 'gate' ? 'gate' : 'adapter';
        const evidence = { ...retainProcess(path.join(cellRoot, 'process'), result), format };
        const row = { id: cell.id, cell, catalogue, evidence, adapterOutput,
          excludedTodos: cell.kind === 'suite' ? manifest.catalogues.excludedTodos : [] };
        row.validation = await validateCellEvidence(row);
        run.cells.push(row);
        save(path.join(cellRoot, 'result.json'), row);
        if (row.validation.status !== 'PASS') throw new Error(`${cell.id}: ${row.validation.errors.join('; ')}`);
        await must(checkFrozenCandidate(input));
      }
      await must(checkFrozenCandidate(input));
      run.afterInputsSha256 = manifest.inputsSha256;
      run.status = 'PASS';
    } catch (error) {
      run.status = 'FAIL';
      run.errors = [error.message];
    } finally {
      run.completedAt = new Date().toISOString();
      const retained = save(path.join(output, 'run.json'), run);
      run.retained = retained;
      await must(recordRun({ historyPath: input.historyPath, run }));
    }
    const readiness = await evaluateReadiness({
      manifestPath: input.manifestPath, manifestSha256: input.manifestSha256,
      manifest: { ...manifest, sha256: input.manifestSha256 },
      historyPath: input.historyPath, findings: input.findings || [],
    });
    save(path.join(output, 'technical-readiness.json'), readiness);
    return { status: run.status, runPath: path.join(output, 'run.json'),
      readiness, publishingAuthorized: false, humanReleaseApproved: false };
  });
}

export async function main(args) {
  try {
    const { mode, file } = parseArguments(args), input = json(file);
    const operations = {
      preflight, prepare, freeze: freezeCandidate, check: observeFrozenCandidate, run: runManifest,
      status: async value => {
        const checked = await must(observeFrozenCandidate(value));
        return evaluateReadiness({ manifestPath: value.manifestPath, manifestSha256: value.manifestSha256,
          manifest: { ...checked.manifest, sha256: value.manifestSha256 },
          historyPath: value.historyPath, findings: value.findings || [] });
      },
    };
    const result = await operations[mode](input);
    console.log(JSON.stringify(result));
    return result.status === 'PASS' ? 0 : result.status === 'INCOMPLETE' ? 2 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', errors: [error.message], publishingAuthorized: false }));
    return 1;
  }
}
