---
feature: snapshots
tier: T2
approval: auto
---
# snapshots
Goal: snapshot store and snapshot-accelerated aggregate loading. Depends on store.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SNAP-001 | When save(stream, version, state) is called, the system shall store a deep copy of state so later mutation of the original does not alter it. | TEST-SNAP-001 |
| REQ-SNAP-002 | When get(stream) is called, the system shall return the latest snapshot {version, state} or null. | TEST-SNAP-002 |
| REQ-SNAP-003 | If save is called with a version not greater than the stored snapshot version, then the system shall ignore it and return false. | TEST-SNAP-003 |
| REQ-SNAP-004 | When loadAggregate is called, the system shall start from the snapshot state and replay only events after the snapshot version, returning {state, version}. | TEST-SNAP-004 |
| REQ-SNAP-005 | If a snapshot version exceeds the stream's version, then loadAggregate shall ignore the snapshot and replay from the initial state. | TEST-SNAP-005 |
| REQ-SNAP-006 | When the loaded version minus the snapshot version reaches the interval, maybeSnapshot shall save a snapshot and return true; otherwise false. | TEST-SNAP-006 |

## Design
SnapshotStore: Map<stream, {version,state}> with structuredClone on save and get.
loadAggregate(store, snaps, stream, reducer, initial): snap = snaps.get; if snap && snap.version <= store version, state=snap.state, from=snap.version+1; else initial, from=1; fold store.read(stream, from).
Decision: reducer must be pure; initial is cloned so shared initial state is never mutated.
## Assumptions / risks
Corrupt future snapshot handled by REQ-SNAP-005.
