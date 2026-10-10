export class ConcurrencyError extends Error {
  constructor(streamId, expected, actual) {
    super(`concurrency conflict on ${streamId}: expected ${expected}, actual ${actual}`);
    this.name = 'ConcurrencyError';
    this.streamId = streamId;
    this.expected = expected;
    this.actual = actual;
  }
}

function assertExpectedVersion(v) {
  if (v !== 'any' && !(Number.isInteger(v) && v >= 0)) {
    throw new TypeError('expectedVersion must be a non-negative integer or "any"');
  }
}

/** @id CODE-STORE-001 @implements REQ-STORE-001 REQ-STORE-002 REQ-STORE-003 REQ-STORE-004 REQ-STORE-006 REQ-STORE-007 */
export class EventStore {
  #streams = new Map();
  #log = [];
  #byCommand = new Map();

  append(streamId, expectedVersion, events) {
    if (!Array.isArray(events) || events.length === 0) {
      throw new RangeError('append requires a non-empty events array');
    }
    const isAny = expectedVersion === 'any';
    assertExpectedVersion(expectedVersion);
    const stream = this.#streams.get(streamId) ?? [];
    if (!isAny && expectedVersion !== stream.length) {
      throw new ConcurrencyError(streamId, expectedVersion, stream.length);
    }
    const stored = events.map((e, i) =>
      Object.freeze({
        streamId,
        version: stream.length + i + 1,
        globalSeq: this.#log.length + i + 1,
        type: e.type,
        data: structuredClone(e.data ?? {}),
        meta: structuredClone(e.meta ?? {}),
      }),
    );
    this.#streams.set(streamId, [...stream, ...stored]);
    this.#log.push(...stored);
    for (const e of stored) {
      const id = e.meta.commandId;
      if (id !== undefined) this.#byCommand.set(id, [...(this.#byCommand.get(id) ?? []), e]);
    }
    return stored;
  }

  /** @id CODE-STORE-002 @implements REQ-STORE-005 */
  read(streamId, fromVersion = 1) {
    return (this.#streams.get(streamId) ?? []).filter((e) => e.version >= fromVersion);
  }

  /** @id CODE-STORE-003 @implements REQ-STORE-009 */
  readAll(fromSeq = 0) {
    return this.#log.filter((e) => e.globalSeq > fromSeq);
  }

  /** @id CODE-STORE-004 @implements REQ-STORE-008 */
  findByCommandId(commandId) {
    return [...(this.#byCommand.get(commandId) ?? [])];
  }
}
