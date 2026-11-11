import fs from 'node:fs';
import path from 'node:path';
import { isUtf8 } from 'node:buffer';
import { PlanningError, containedPlanningPath, planningSha256, planningFileSha256 } from './implementation-plan.mjs';

const HISTORY = '.sdd/spec-feedback.jsonl', LOCK = '.sdd/spec-feedback.lock';
const MAX_HISTORY = 8 * 1024 * 1024, MAX_SPEC = 1024 * 1024, MAX_RECORDS = 4096;
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const REQ = /^REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/, TEST = /^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const CODE = /^CODE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = value => planningSha256(JSON.stringify(value));
function requireFeedback(condition, id, reason) {
  if (!condition) throw new PlanningError(2, id, `Feedback: ${reason}`);
}
function fields(value, names, id) {
  requireFeedback(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)),
  id, 'invalid structured fields');
}
function ids(value, pattern, id, empty = false) {
  requireFeedback(Array.isArray(value) && (empty || value.length > 0) && value.length <= 4096
    && value.every(item => typeof item === 'string' && pattern.test(item)) && new Set(value).size === value.length,
  id, 'invalid or duplicate references');
}
function portable(file) {
  return typeof file === 'string' && file.length > 0 && !file.includes('\\') && !file.includes('\0')
    && !path.posix.isAbsolute(file) && !/^[A-Za-z]:/.test(file)
    && file.split('/').every(part => part && part !== '.' && part !== '..');
}
function location(root, file, options) {
  try { return containedPlanningPath(root, file, options); }
  catch (error) {
    if (!(error instanceof PlanningError)) throw error;
    throw new PlanningError(2, file, `Feedback: ${error.message}`);
  }
}
function io(operation, id) {
  try { return operation(); }
  catch (error) {
    if (error instanceof PlanningError) throw error;
    if (!error || typeof error.code !== 'string' || !/^E[A-Z0-9]+$/.test(error.code)) throw error;
    throw new PlanningError(2, id, `Feedback: filesystem operation failed (${error.code})`);
  }
}
function read(root, file, maximum, optional = false) {
  const absolute = location(root, file, { allowMissing: optional });
  return io(() => {
    let fd;
    try { fd = fs.openSync(absolute, 'r'); }
    catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
    try {
      const before = fs.fstatSync(fd);
      requireFeedback(before.isFile() && before.size <= maximum, file, `read budget exceeded (${maximum} bytes)`);
      const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
      requireFeedback(bytes.length <= maximum && bytes.length === before.size && after.size === before.size
        && after.mtimeMs === before.mtimeMs && isUtf8(bytes), file, 'input changed or is not bounded UTF-8');
      return bytes.toString('utf8');
    } finally { fs.closeSync(fd); }
  }, file);
}
function parse(text, id) {
  try { return JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new PlanningError(2, id, 'Feedback: unparseable JSON');
  }
}
function refusal(error) {
  if (!(error instanceof PlanningError)) throw error;
  return { enabled: true, status: 'INCOMPLETE', exit: 2, features: [],
    errors: [{ id: error.id, exit: 2, reason: error.message }] };
}
function verdict(errors) {
  const exit = errors.some(error => error.exit === 2) ? 2 : errors.length ? 1 : 0;
  return { exit, status: exit === 2 ? 'INCOMPLETE' : exit === 1 ? 'FAIL' : 'PASS' };
}

/** @id CODE-FEEDBACK-POLICY @implements REQ-FEEDBACK-001 */
export function feedbackRequired(config = {}) {
  requireFeedback(config && typeof config === 'object' && !Array.isArray(config), 'config', 'project configuration must be an object');
  if (!Object.hasOwn(config, 'specFeedback')) return false;
  const policy = config.specFeedback;
  requireFeedback(policy && typeof policy === 'object' && !Array.isArray(policy)
    && Object.keys(policy).every(key => key === 'required')
    && (!Object.hasOwn(policy, 'required') || typeof policy.required === 'boolean'),
  'specFeedback', 'specFeedback must contain only an optional boolean required');
  if (policy.required !== true) return false;
  requireFeedback(config.planning?.required !== false, 'specFeedback', 'enabled feedback requires specification-linked planning');
  return true;
}

function sourceRows(rows, feature) {
  requireFeedback(Array.isArray(rows) && rows.length <= 4096, HISTORY, 'invalid source inventory');
  let previous = '';
  for (const row of rows) {
    fields(row, ['path', 'sha256', 'owners'], HISTORY);
    requireFeedback(portable(row.path) && compare(previous, row.path) < 0
      && typeof row.sha256 === 'string' && HASH.test(row.sha256)
      && Array.isArray(row.owners) && row.owners.length > 0, HISTORY, 'invalid source identity');
    previous = row.path;
    let ownerKey = '';
    for (const owner of row.owners) {
      fields(owner, ['feature', 'task', 'reqs', 'codes'], HISTORY);
      const key = owner.feature + '\0' + owner.task;
      requireFeedback(typeof owner.feature === 'string' && ID.test(owner.feature)
        && typeof owner.task === 'string' && ID.test(owner.task) && compare(ownerKey, key) < 0,
        HISTORY, 'invalid source ownership');
      ownerKey = key;
      ids(owner.reqs, REQ, HISTORY); ids(owner.codes, CODE, HISTORY, true);
      requireFeedback(JSON.stringify(owner.reqs) === JSON.stringify([...owner.reqs].sort())
        && JSON.stringify(owner.codes) === JSON.stringify([...owner.codes].sort()), HISTORY, 'unordered source references');
    }
    requireFeedback(feature === undefined || row.owners.some(owner => owner.feature === feature),
      HISTORY, 'source does not belong to recorded feature');
  }
}
function retainedPrefix(previous, entries, id) {
  requireFeedback(!previous || entries.length >= previous.entries.length
    && previous.entries.every((entry, index) => entry.id === entries[index].id && entry.sha256 === entries[index].sha256),
  id, 'accepted canonical entries were rewritten or removed');
}
function readHistory(root) {
  const text = read(root, HISTORY, MAX_HISTORY, true) ?? '';
  requireFeedback(!text || text.endsWith('\n'), HISTORY, 'unterminated history');
  const lines = text.split('\n').filter(Boolean), records = [], latest = new Map();
  const transfers = new Map(), acceptedSources = new Map();
  requireFeedback(lines.length <= MAX_RECORDS, HISTORY, 'history record capacity exceeded');
  for (const line of lines) {
    const row = parse(line, HISTORY);
    requireFeedback(Buffer.byteLength(JSON.stringify(row)) <= MAX_SPEC, HISTORY, 'history record budget exceeded');
    fields(row, ['schemaVersion', 'sequence', 'previous', 'feature', 'id', 'implementationSha256',
      'specSha256', 'scopeSha256', 'sources', 'entries', 'transfers', 'acknowledges', 'hash'], HISTORY);
    const { hash, ...payload } = row;
    requireFeedback(row.schemaVersion === 1 && row.sequence === records.length + 1
      && row.previous === (records.at(-1)?.hash ?? '') && HASH.test(hash) && hash === digest(payload)
      && typeof row.feature === 'string' && ID.test(row.feature) && typeof row.id === 'string' && ID.test(row.id)
      && [row.implementationSha256, row.specSha256, row.scopeSha256].every(value => typeof value === 'string' && HASH.test(value)),
    HISTORY, 'invalid history hash chain or identity');
    sourceRows(row.sources, row.feature);
    requireFeedback(row.implementationSha256 === digest(row.sources) && Array.isArray(row.entries)
      && row.entries.length > 0 && row.entries.length <= 4096, HISTORY, 'invalid accepted source or entry identity');
    for (const entry of row.entries) {
      fields(entry, ['id', 'sha256'], HISTORY);
      requireFeedback(typeof entry.id === 'string' && ID.test(entry.id)
        && typeof entry.sha256 === 'string' && HASH.test(entry.sha256), HISTORY, 'invalid accepted entry');
    }
    requireFeedback(new Set(row.entries.map(entry => entry.id)).size === row.entries.length
      && row.id === row.entries.at(-1).id, HISTORY, 'reused or inconsistent change ID');
    const prior = latest.get(row.feature);
    retainedPrefix(prior, row.entries, HISTORY);
    requireFeedback(!prior || row.entries.length > prior.entries.length, HISTORY, 'accepted change ID was reused');
    sourceRows(row.transfers);
    ids(row.acknowledges, HASH, HISTORY, true);
    requireFeedback(JSON.stringify(row.acknowledges) === JSON.stringify([...row.acknowledges].sort()),
      HISTORY, 'unordered transfer acknowledgements');
    for (const id of row.acknowledges) {
      const transfer = transfers.get(id);
      requireFeedback(transfer?.waiting.has(row.feature), HISTORY, 'unknown or already resolved recipient acknowledgement');
      transfer.waiting.delete(row.feature);
    }
    const identities = new Set(row.sources.map(digest));
    for (const transfer of transfers.values()) {
      if (transfer.waiting.has(row.feature) && identities.has(transfer.identity)) transfer.waiting.delete(row.feature);
    }
    if (!acceptedSources.has(row.feature)) acceptedSources.set(row.feature, new Map());
    for (const identity of identities) acceptedSources.get(row.feature).set(identity, row.sequence);
    for (const [index, source] of row.transfers.entries()) {
      const former = prior?.sources.find(value => value.path === source.path);
      requireFeedback(former && !row.sources.some(value => value.path === source.path)
        && source.owners.every(owner => owner.feature !== row.feature),
      HISTORY, 'transfer must relinquish a previously owned path to different owners');
      const identity = digest(source), id = digest([row.hash, index]);
      const waiting = new Set(source.owners.map(owner => owner.feature).filter(feature =>
        (acceptedSources.get(feature)?.get(identity) ?? 0) <= prior.sequence));
      transfers.set(id, { id, feature: row.feature, source, former, identity, waiting });
    }
    records.push(row); latest.set(row.feature, row);
  }
  return { text, records, latest, pending: [...transfers.values()].filter(transfer => transfer.waiting.size) };
}

/** @id CODE-FEEDBACK-002 @implements REQ-FEEDBACK-002 */
function inventory(context, history) {
  const { root, model, entities, files } = context;
  requireFeedback(model && Array.isArray(model.tasks) && Array.isArray(model.specs)
    && Array.isArray(model.features) && Array.isArray(model.scope) && Array.isArray(entities) && Array.isArray(files),
  'planning', 'validated planning and native source metadata are required');
  requireFeedback(!context.duplicates?.length, 'ownership', 'duplicate native annotation mapping');
  const known = new Map(model.specs.flatMap(spec => spec.reqs.map(req => [req.id, spec.feature])));
  const canonical = file => path.relative(root, location(root, file, { allowMissing: true })).split(path.sep).join('/');
  const annotations = entities.map(entity => ({ ...entity, path: canonical(entity.path) }));
  const testsOnly = new Set(annotations.filter(entity => entity.kind === 'TEST').map(entity => entity.path));
  annotations.filter(entity => entity.kind === 'CODE').forEach(entity => testsOnly.delete(entity.path));
  const implementations = model.tasks.filter(task => task.kind === 'implementation');
  const candidates = new Set([...files, ...implementations.flatMap(task => task.artifacts)].map(canonical));
  const documentation = new Set(model.tasks.filter(task => task.kind === 'documentation').flatMap(task => task.artifacts).map(canonical));
  const ownership = new Map();
  for (const task of implementations) for (const artifact of task.artifacts) {
    const file = canonical(artifact);
    if (!ownership.has(file)) ownership.set(file, []);
    ownership.get(file).push(task);
  }
  const previouslyKnown = new Set([...history.latest.values()].flatMap(row => row.sources.map(source => source.path)));
  const rows = [];
  let total = 0;
  for (const file of [...candidates].sort()) {
    if (file.startsWith('.sdd/') || testsOnly.has(file) || documentation.has(file) && !ownership.has(file)) continue;
    const absolute = location(root, file, { allowMissing: true });
    const stat = io(() => fs.statSync(absolute, { throwIfNoEntry: false }), file);
    if (!stat && previouslyKnown.has(file)) continue;
    requireFeedback(stat?.isFile(), file, 'implementation artifact is missing or not a regular file');
    total += stat.size;
    requireFeedback(rows.length < 4096 && total <= 64 * 1024 * 1024
      && stat.size <= (context.config.scan?.maxFileBytes ?? 16 * 1024 * 1024), file, 'implementation inventory budget exceeded');
    const tasks = ownership.get(file) ?? [], code = annotations.filter(entity => entity.kind === 'CODE' && entity.path === file);
    requireFeedback(tasks.length > 0, file, 'implementation ownership mapping is unresolved');
    for (const entity of code) {
      requireFeedback(entity.refs.implements.length > 0 && entity.refs.implements.every(req =>
        known.has(req) && tasks.some(task => task.feature === known.get(req) && task.reqs.includes(req))),
      file, `${entity.id}: CODE/REQ ownership mapping is unresolved`);
    }
    const owners = tasks.map(task => ({
      feature: task.feature, task: task.id, reqs: [...task.reqs].sort(),
      codes: code.filter(entity => entity.refs.implements.some(req => task.reqs.includes(req))).map(entity => entity.id).sort(),
    })).sort((a, b) => compare(a.feature, b.feature) || compare(a.task, b.task));
    rows.push({ path: file, sha256: planningFileSha256(root, file), owners });
  }
  return rows;
}

function entriesIn(text, id) {
  const starts = [...text.matchAll(/^```sdd-feedback[ \t]*\r?$/gm)];
  const matches = [...text.matchAll(/^```sdd-feedback[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?:\r?\n|$)/gm)];
  requireFeedback(starts.length === matches.length && matches.length <= 4096, id, 'unclosed or excessive canonical feedback entries');
  const entries = matches.map(match => {
    const entry = parse(match[1], id);
    fields(entry, ['schemaVersion', 'id', 'implementationSha256', 'summary', 'reqs', 'tests'], id);
    requireFeedback(entry.schemaVersion === 1 && typeof entry.id === 'string' && ID.test(entry.id)
      && typeof entry.implementationSha256 === 'string' && HASH.test(entry.implementationSha256)
      && typeof entry.summary === 'string' && entry.summary.trim().length > 0
      && Buffer.byteLength(entry.summary) <= 4096, id, 'incomplete canonical change entry');
    ids(entry.reqs, REQ, id); ids(entry.tests, TEST, id);
    return { schemaVersion: 1, id: entry.id, implementationSha256: entry.implementationSha256,
      summary: entry.summary, reqs: [...entry.reqs].sort(), tests: [...entry.tests].sort() };
  });
  requireFeedback(new Set(entries.map(entry => entry.id)).size === entries.length, id, 'change IDs must be lifetime-unique per feature');
  return entries;
}
function baseSnapshot(getContext, lease) {
  requireFeedback(typeof getContext === 'function', 'feedback', 'current-input reader required');
  const context = getContext();
  requireFeedback(context && context.config && typeof context.root === 'string', 'feedback', 'current project inputs required');
  if (!feedbackRequired(context.config)) return { enabled: false };
  const lock = io(() => fs.lstatSync(location(context.root, LOCK, { allowMissing: true, regular: false }),
    { throwIfNoEntry: false }), LOCK);
  requireFeedback(!lock || lease?.owns(), LOCK, 'writer lock is occupied; confirm its owner is absent before manual recovery');
  const history = readHistory(context.root);
  const sources = inventory(context, history);
  for (const feature of history.latest.keys()) {
    requireFeedback(context.model.specs.some(spec => spec.feature === feature), feature, 'former canonical owner is unresolved');
  }
  for (const transfer of history.pending) for (const owner of [...transfer.former.owners, ...transfer.source.owners]) {
    const spec = context.model.specs.find(value => value.feature === owner.feature);
    requireFeedback(spec && owner.reqs.every(req => spec.reqs.some(value => value.id === req)),
      owner.feature, 'pending transfer canonical owner or affected REQ is unresolved');
  }
  return { enabled: true, context, history, sources };
}
function featureSnapshot(base, feature) {
  const { context, history } = base, spec = context.model.specs.find(spec => spec.feature === feature);
  requireFeedback(spec, feature, 'unknown canonical feature');
  const text = read(context.root, spec.path, MAX_SPEC), entries = entriesIn(text, spec.path);
  const identities = entries.map(entry => ({ id: entry.id, sha256: digest(entry) })), head = history.latest.get(feature);
  retainedPrefix(head, identities, feature);
  const sources = base.sources.filter(row => row.owners.some(owner => owner.feature === feature));
  const reqs = [...new Set([...sources, ...(head?.sources ?? []),
    ...history.pending.flatMap(transfer => [transfer.former, transfer.source])].flatMap(row =>
    row.owners.filter(owner => owner.feature === feature).flatMap(owner => owner.reqs)))].sort();
  requireFeedback(reqs.every(req => spec.reqs.some(current => current.id === req)), feature, 'affected former/current REQ ownership is unresolved');
  const scope = { feature, path: spec.path, requirements: spec.reqs.map(req => req.id).sort(),
    prerequisites: context.model.features.find(row => row.id === feature)?.dependsOn ?? [],
    tasks: context.model.tasks.filter(task => task.feature === feature).map(task => ({
      id: task.id, kind: task.kind, reqs: [...task.reqs].sort(), artifacts: [...task.artifacts].sort(),
      dependsOn: [...task.effectiveDeps].sort(),
    })).sort((a, b) => compare(a.id, b.id)),
    policy: { scan: context.config.scan ?? null, planning: context.config.planning ?? null } };
  const binding = { implementationSha256: digest(sources), specSha256: planningSha256(text), scopeSha256: digest(scope) };
  const pendingTransfers = history.pending.filter(transfer => transfer.waiting.has(feature)).map(transfer => transfer.id).sort();
  const current = Boolean(head && !pendingTransfers.length && Object.entries(binding).every(([key, value]) => head[key] === value));
  return { feature, state: current ? 'current' : 'update-required', exit: current ? 0 : head ? 1 : 2,
    ...binding, recordSha256: head?.hash ?? null, affectedReqs: reqs, pendingTransfers, sources, entries, identities, head, spec };
}
function selectedFeatures(base, initial) {
  const selected = new Set(initial ?? base.context.model.scope), byPath = new Map(base.sources.map(row => [row.path, row]));
  for (const row of base.history.latest.values()) {
    if (row.sources.some(source => !byPath.has(source.path))) selected.add(row.feature);
  }
  for (const feature of selected) {
    requireFeedback(base.context.model.specs.some(spec => spec.feature === feature), feature, 'unknown feature scope');
    for (const transfer of base.history.pending) {
      const participants = [transfer.feature, ...transfer.source.owners.map(owner => owner.feature)];
      if (participants.includes(feature)) participants.forEach(owner => selected.add(owner));
    }
    for (const row of base.sources.filter(source => source.owners.some(owner => owner.feature === feature))) {
      row.owners.forEach(owner => selected.add(owner.feature));
      for (const former of base.history.latest.values()) {
        if (former.sources.some(source => source.path === row.path)) selected.add(former.feature);
      }
    }
  }
  return [...selected].sort();
}
const publicFeature = ({ feature, state, exit, implementationSha256, specSha256, scopeSha256, recordSha256, affectedReqs, pendingTransfers }) =>
  ({ feature, state, exit, implementationSha256, specSha256, scopeSha256, recordSha256, affectedReqs, pendingTransfers });

/** @id CODE-FEEDBACK-STATUS @implements REQ-FEEDBACK-002 REQ-FEEDBACK-003 REQ-FEEDBACK-005 */
export function feedbackStatus(getContext, initial) {
  try {
    const base = baseSnapshot(getContext);
    if (!base.enabled) return { enabled: false, status: 'DISABLED', exit: 0, features: [], errors: [] };
    const features = selectedFeatures(base, initial).map(feature => publicFeature(featureSnapshot(base, feature)));
    const errors = features.filter(row => row.exit).map(row => ({ id: row.feature, exit: row.exit,
      reason: `Feedback ${row.feature}: ${row.pendingTransfers.length ? 'pending ownership transfer acknowledgement'
        : row.recordSha256 ? 'accepted implementation/specification/ownership changed' : 'explicit canonical entry and acceptance required'}` }));
    return { enabled: true, ...verdict(errors), features, errors };
  } catch (error) { return refusal(error); }
}

/** @id CODE-FEEDBACK-INVENTORY @implements REQ-FEEDBACK-002 REQ-FEEDBACK-004 REQ-FEEDBACK-005 */
export function feedbackInventory(getContext) {
  try {
    const base = baseSnapshot(getContext);
    if (!base.enabled) return { enabled: false, bindings: null, errors: [] };
    return { enabled: true, bindings: {
      inventorySha256: digest(base.sources), historySha256: planningSha256(base.history.text),
      policySha256: digest({ planning: base.context.config.planning ?? null, scan: base.context.config.scan ?? null }),
    }, errors: [] };
  } catch (error) { return { ...refusal(error), bindings: null }; }
}

/** @id CODE-FEEDBACK-003 @implements REQ-FEEDBACK-003 */
function newEntry(base, row) {
  const entry = row.entries.at(-1);
  requireFeedback(entry && entry.implementationSha256 === row.implementationSha256,
    row.feature, 'newest canonical entry must bind the current implementation digest');
  requireFeedback(!row.head || row.identities.length > row.head.entries.length,
    row.feature, 'a fresh lifetime-unique change ID is required');
  return entry;
}

/** @id CODE-FEEDBACK-REFERENCES @implements REQ-FEEDBACK-003 */
function entryReferences(base, row) {
  const entry = row.entries.at(-1);
  requireFeedback(entry, row.feature, 'canonical change entry is required');
  requireFeedback(row.affectedReqs.every(req => entry.reqs.includes(req))
    && entry.reqs.every(req => row.spec.reqs.some(current => current.id === req)),
  row.feature, 'entry must cover affected existing REQs');
  const tests = base.context.entities.filter(entity => entity.kind === 'TEST');
  requireFeedback(entry.tests.every(id => tests.some(test => test.id === id
    && test.refs.verifies.some(req => entry.reqs.includes(req))))
    && entry.reqs.every(req => entry.tests.some(id => tests.some(test => test.id === id && test.refs.verifies.includes(req)))),
  row.feature, 'entry must reference existing mapped TESTs for every affected REQ');
}
function writer(root) {
  const directory = location(root, LOCK, { allowMissing: true, regular: false });
  io(() => fs.mkdirSync(directory), LOCK);
  const stat = io(() => fs.lstatSync(directory), LOCK), owner = JSON.stringify({ pid: process.pid }) + '\n';
  const ownerFile = path.join(directory, 'owner.json');
  try { io(() => fs.writeFileSync(ownerFile, owner, { flag: 'wx' }), LOCK); }
  catch (error) { io(() => fs.rmdirSync(directory), LOCK); throw error; }
  const owns = () => {
    const now = io(() => fs.lstatSync(directory, { throwIfNoEntry: false }), LOCK);
    return Boolean(now?.isDirectory() && now.dev === stat.dev && now.ino === stat.ino
      && read(root, `${LOCK}/owner.json`, 1024) === owner);
  };
  return { owns, release() {
    requireFeedback(owns(), LOCK, 'writer lease changed; unrelated lock was retained');
    io(() => fs.unlinkSync(ownerFile), LOCK);
    io(() => fs.rmdirSync(directory), LOCK);
  } };
}
function recordingIdentity(base, row) {
  return digest({ sources: base.sources, history: planningSha256(base.history.text), binding: publicFeature(row),
    entries: row.identities });
}

/** @id CODE-FEEDBACK-005 @implements REQ-FEEDBACK-005 */
export function recordFeedback(getContext, feature) {
  try {
    const before = baseSnapshot(getContext);
    requireFeedback(before.enabled, 'feedback', 'record requires specFeedback.required:true');
    const row = featureSnapshot(before, feature), lease = writer(before.context.root);
    try {
      const entry = row.exit ? newEntry(before, row) : null;
      entryReferences(before, row);
      const after = baseSnapshot(getContext, lease), current = featureSnapshot(after, feature);
      entryReferences(after, current);
      requireFeedback(recordingIdentity(before, row) === recordingIdentity(after, current) && lease.owns(),
        feature, 'inputs or retained history changed before acceptance');
      if (!entry) return { enabled: true, status: 'PASS', exit: 0, features: [publicFeature(row)], errors: [] };
      requireFeedback(before.history.records.length < MAX_RECORDS, HISTORY, 'history capacity reached');
      const transfers = (row.head?.sources ?? []).filter(source => !row.sources.some(current => current.path === source.path))
        .map(source => before.sources.find(current => current.path === source.path)).filter(Boolean);
      const payload = { schemaVersion: 1, sequence: before.history.records.length + 1,
        previous: before.history.records.at(-1)?.hash ?? '', feature, id: entry.id,
        implementationSha256: row.implementationSha256, specSha256: row.specSha256, scopeSha256: row.scopeSha256,
        sources: row.sources, entries: row.identities, transfers, acknowledges: row.pendingTransfers };
      const record = { ...payload, hash: digest(payload) }, line = JSON.stringify(record) + '\n';
      requireFeedback(Buffer.byteLength(line) <= MAX_SPEC
        && Buffer.byteLength(before.history.text) + Buffer.byteLength(line) <= MAX_HISTORY, HISTORY, 'history write budget exceeded');
      const file = location(before.context.root, HISTORY, { allowMissing: true });
      io(() => {
        const fd = fs.openSync(file, 'a');
        try {
          const bytes = Buffer.from(line);
          requireFeedback(fs.writeSync(fd, bytes) === bytes.length, HISTORY, 'partial history write; retained history needs inspection');
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
      }, HISTORY);
      return { enabled: true, status: 'PASS', exit: 0,
        features: [publicFeature({ ...row, state: 'current', exit: 0, recordSha256: record.hash, pendingTransfers: [] })], errors: [] };
    } finally { lease.release(); }
  } catch (error) { return refusal(error); }
}

/** @id CODE-FEEDBACK-COMPLETION @implements REQ-FEEDBACK-004 */
export function feedbackCompletion(getContext, task) {
  const result = feedbackStatus(getContext, [task.feature]);
  return { enabled: result.enabled, bindings: result.enabled && !result.features.length ? null
    : Object.fromEntries(result.features.map(row => [row.feature, {
      implementationSha256: row.implementationSha256, specSha256: row.specSha256,
      scopeSha256: row.scopeSha256, recordSha256: row.recordSha256,
    }])), errors: result.errors };
}
