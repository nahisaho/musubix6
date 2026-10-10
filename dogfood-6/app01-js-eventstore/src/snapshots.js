/** @id CODE-SNAP-001 @implements REQ-SNAP-001 REQ-SNAP-002 REQ-SNAP-003 */
export class SnapshotStore {
  #snaps = new Map();

  save(streamId, version, state) {
    const cur = this.#snaps.get(streamId);
    if (cur && version <= cur.version) return false;
    this.#snaps.set(streamId, { version, state: structuredClone(state) });
    return true;
  }

  get(streamId) {
    const cur = this.#snaps.get(streamId);
    return cur ? { version: cur.version, state: structuredClone(cur.state) } : null;
  }
}

/** @id CODE-SNAP-002 @implements REQ-SNAP-004 REQ-SNAP-005 */
export function loadAggregate(store, snaps, streamId, reducer, initial) {
  const snap = snaps.get(streamId);
  const tail = store.read(streamId, 1);
  const head = tail.length;
  let state = structuredClone(initial);
  let version = 0;
  if (snap && snap.version <= head) {
    state = snap.state;
    version = snap.version;
  }
  for (const e of store.read(streamId, version + 1)) {
    state = reducer(state, e);
    version = e.version;
  }
  return { state, version };
}

/** @id CODE-SNAP-003 @implements REQ-SNAP-006 */
export function maybeSnapshot(snaps, streamId, state, version, interval) {
  const last = snaps.get(streamId)?.version ?? 0;
  if (version - last < interval) return false;
  return snaps.save(streamId, version, state);
}
