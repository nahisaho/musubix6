---
feature: compact
tier: T2
approval: auto
---
# compact
Goal: Compaction of history (Store.Compact plus package `compact` policies) that frees superseded versions without changing visible state at or above the compacted revision.
Non-goals: disk defragmentation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMPACT-001 | When Compact(rev) succeeds, the store shall keep HashKV(rev) and the visible state at every revision >= rev unchanged. | TEST-COMPACT-001 |
| REQ-COMPACT-002 | When compacting, the store shall keep the latest version <= rev of each live key and remove keys whose latest version <= rev is a tombstone. | TEST-COMPACT-002 |
| REQ-COMPACT-003 | If rev exceeds the current revision, then Compact shall return ErrFutureRev; if rev <= the compacted revision it shall return ErrCompacted; the compacted revision shall never decrease. | TEST-COMPACT-003 |
| REQ-COMPACT-004 | When Get or Range uses a revision below the compacted revision, the store shall return ErrCompacted; the compacted revision itself shall remain readable. | TEST-COMPACT-004 |
| REQ-COMPACT-005 | When EventsSince is called with rev <= the compacted revision, the store shall return ErrCompacted; later events shall be intact. | TEST-COMPACT-005 |
| REQ-COMPACT-006 | When a revision-retention compactor runs, it shall compact to currentRev-retention if that exceeds the compacted revision, otherwise do nothing. | TEST-COMPACT-006 |
| REQ-COMPACT-007 | When a periodic compactor ticks, it shall record (time, revision) checkpoints and compact to the latest checkpoint at least window old; with none it shall do nothing. | TEST-COMPACT-007 |
| REQ-COMPACT-008 | When a compactor run removes versions, it shall report the removed count, and a repeated run shall remove 0. | TEST-COMPACT-008 |
| REQ-COMPACT-009 | While a watcher is live, compaction shall not interrupt its stream. | TEST-COMPACT-009 |
| REQ-COMPACT-010 | If Watch is opened with startRev <= the compacted revision, then the hub shall return ErrCompacted. | TEST-COMPACT-010 |

## Design
Components: `mvcc.Store.Compact` and `HashKV`; `compact.Compactor{Store, Mode, Retention, Window}` decides the target revision.
State/invariant table:

| State | Invariant |
| --- | --- |
| compactRev | monotone non-decreasing, <= rev |
| per-key versions | after Compact(r): at most one version <= r, never a tombstone-only head |
| log | no events with rev <= compactRev |
| checkpoints | ascending by time and rev |

Algorithm: per key, find index i of latest version with main<=r; drop versions[:i], and also versions[i] if it is a tombstone; delete the key when empty.
## Assumptions / risks
HashKV(rev) covers live keys at rev only, so it is compaction-invariant for rev >= compactRev.
