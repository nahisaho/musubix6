export function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError(`invalid ${label}`);
  return value;
}

export function name(value, label = 'name') {
  if (typeof value !== 'string' || !/^[\w.-]+$/.test(value)) throw new TypeError(`invalid ${label}`);
  return value;
}

/** @id CODE-TOPICS-005 @implements REQ-TOPICS-009 */
function rejectShared(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (value instanceof SharedArrayBuffer ||
      (ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError('shared memory payload is unsupported');
  }
  if (value instanceof Map) {
    for (const [key, item] of value) { rejectShared(key, visited); rejectShared(item, visited); }
  } else if (value instanceof Set) {
    for (const item of value) rejectShared(item, visited);
  } else {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      rejectShared(descriptor.value, visited);
    }
  }
}

export function snapshot(value) {
  const copy = structuredClone(value);
  rejectShared(copy);
  return copy;
}

function partitionFor(key, count) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(key)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash % count;
}

export class Log {
  constructor({ clock = Date.now } = {}) {
    if (typeof clock !== 'function') throw new TypeError('invalid clock');
    this._clock = clock;
    this._lastTime = -Infinity;
    this._log = new Map();
  }

  _now() {
    const time = this._clock();
    if (!Number.isFinite(time) || time < this._lastTime) throw new RangeError('invalid clock regression');
    this._lastTime = time;
    return time;
  }

  /** @id CODE-TOPICS-001 @implements REQ-TOPICS-001 REQ-TOPICS-002 */
  createTopic(topic, partitions = 1) {
    name(topic, 'topic');
    integer(partitions, 'partitions', 1);
    if (this._log.has(topic)) throw new Error('topic exists');
    this._log.set(topic, { name: topic, rr: 0,
      partitions: Array.from({ length: partitions }, () => ({ base: 0, records: [] })) });
    return { name: topic, partitions };
  }

  _topic(topic) {
    const state = this._log.get(topic);
    if (!state) throw new Error('unknown topic');
    return state;
  }

  _partition(topic, partition) {
    integer(partition, 'partition');
    const state = this._topic(topic).partitions[partition];
    if (!state) throw new RangeError('invalid partition');
    return state;
  }

  /** @id CODE-TOPICS-002 @implements REQ-TOPICS-003 REQ-TOPICS-004 */
  _prepare(topic, value, options = {}, log = this._log) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('invalid options');
    const state = log.get(topic);
    if (!state) throw new Error('unknown topic');
    if (options.key !== undefined && typeof options.key !== 'string') throw new TypeError('invalid key');
    const count = state.partitions.length;
    const explicit = options.partition;
    if (explicit !== undefined && (integer(explicit, 'partition') >= count)) throw new RangeError('invalid partition');
    const partition = explicit ?? (options.key === undefined ? state.rr % count : partitionFor(options.key, count));
    return { topic, value: snapshot(value), partition, key: options.key ?? null,
      roundRobin: explicit === undefined && options.key === undefined };
  }

  _append(plan, time, log = this._log) {
    const state = log.get(plan.topic);
    const part = state.partitions[plan.partition];
    const record = { topic: plan.topic, partition: plan.partition, offset: part.base + part.records.length,
      timestamp: time, key: plan.key, value: plan.value };
    part.records.push(record);
    if (plan.roundRobin) state.rr = (state.rr + 1) % state.partitions.length;
    return record;
  }

  /** @id CODE-TOPICS-003 @implements REQ-TOPICS-005 REQ-TOPICS-006 */
  publish(topic, value, options = {}) {
    const plan = this._prepare(topic, value, options);
    return snapshot(this._append(plan, this._now()));
  }

  topics() {
    return [...this._log.values()].map(t => ({ name: t.name, partitions: t.partitions.length }));
  }

  /** @id CODE-TOPICS-004 @implements REQ-TOPICS-007 REQ-TOPICS-008 */
  read(topic, partition, { offset = 0, limit = Number.MAX_SAFE_INTEGER } = {}) {
    integer(offset, 'offset');
    integer(limit, 'limit', 1);
    const part = this._partition(topic, partition);
    const from = Math.max(offset, part.base) - part.base;
    return snapshot(part.records.slice(from, from + limit));
  }
}
