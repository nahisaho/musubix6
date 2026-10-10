---
feature: store
tier: T2
approval: auto
---
# store
Goal: MVCC versioned key-value store (package `mvcc`) with global revisions, tombstones, range reads at any revision and an ordered event log.
Non-goals: persistence, networking, auth.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STORE-001 | When a new key is Put, the store shall bump the global revision by 1 and return a KeyValue with CreateRev=ModRev=revision and Version=1. | TEST-STORE-001 |
| REQ-STORE-002 | When an existing live key is Put, the store shall keep CreateRev, set ModRev to the new revision and increment Version. | TEST-STORE-002 |
| REQ-STORE-003 | When Get is called at the current revision, the store shall return the latest live value, or found=false for a missing or deleted key. | TEST-STORE-003 |
| REQ-STORE-004 | When Get is called with a past revision, the store shall return the value as of that revision; if the revision is greater than the current revision it shall return ErrFutureRev. | TEST-STORE-004 |
| REQ-STORE-005 | When an existing key is deleted, the store shall bump the revision once and report deleted=true; deleting an absent key shall report deleted=false and leave the revision unchanged. | TEST-STORE-005 |
| REQ-STORE-006 | When a key is Put after being deleted, the store shall start a new generation with Version=1 and CreateRev equal to the new revision. | TEST-STORE-006 |
| REQ-STORE-007 | When Range(start,end) is called, the store shall return live keys in [start,end) in ascending order, where end="" means exactly start and end="\x00" means every key >= start. | TEST-STORE-007 |
| REQ-STORE-008 | When Range has limit>0, the store shall return at most limit keys and the total count of matching keys. | TEST-STORE-008 |
| REQ-STORE-009 | When Range is called with a past revision, the store shall exclude keys that did not yet exist or were already deleted at that revision. | TEST-STORE-009 |
| REQ-STORE-010 | When DeleteRange matches live keys, the store shall delete them all in a single new revision; with no match the revision shall not change. | TEST-STORE-010 |
| REQ-STORE-011 | If a write uses an empty key, then the store shall return ErrEmptyKey and leave all state and the revision unchanged. | TEST-STORE-011 |
| REQ-STORE-012 | When Apply receives several ops, the store shall commit them under one revision and emit one event per effective op, in op order, each carrying that revision. | TEST-STORE-012 |
| REQ-STORE-013 | When EventsSince(rev) is called, the store shall return all events with revision >= rev in commit order, delete events carrying PrevKV and an empty-valued KV with ModRev equal to the delete revision. | TEST-STORE-013 |
| REQ-STORE-014 | When subscribers are registered, the store shall invoke each exactly once per committing Apply, in revision order. | TEST-STORE-014 |
| REQ-STORE-015 | While writers run concurrently, the store shall assign unique, gap-free revisions. | TEST-STORE-015 |
| REQ-STORE-016 | If the decide callback of Apply panics, then the store shall release its locks, leave state and revision unchanged and stay usable (bug fix). | TEST-STORE-016 |

## Design
Components: `mvcc.Store` guarded by one RWMutex; `index map[string][]version` (revisions ascending per key); `log []Event`; `rev` global counter.
State/invariant table:

| State | Invariant |
| --- | --- |
| rev | increases by exactly 1 per effective write batch; never decreases |
| version.main | strictly ascending within a key; (main, sub) unique |
| tombstone | ends a generation; next live version has ver=1, create=main |
| log | ordered by (rev, sub); contains every effective event since compactRev |
| no-op write | (absent delete, empty DeleteRange) consumes no revision, emits no event |

Key decisions: all writes funnel through `Apply(decide)`, which runs `decide` under the write lock (used later for transactions); subscribers are called after commit while the notify lock is held to keep ordering.
## Assumptions / risks
Single process, in-memory. Subscribers must not call back into writes (documented).
