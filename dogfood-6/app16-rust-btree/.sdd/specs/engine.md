---
feature: engine
tier: T2
---
# engine
Goal: durable key-value engine combining WAL, MVCC store and iterators, with crash simulation and recovery. Non-goals: multi-threading.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENG-001 | When a transaction commits, the engine shall append its operations and a Commit record to the WAL and sync before applying. | TEST-ENG-001 |
| REQ-ENG-002 | If a commit conflicts, then the engine shall not write anything to the WAL. | TEST-ENG-002 |
| REQ-ENG-003 | When the engine crashes after commit and recovers, the committed data shall be visible. | TEST-ENG-003 |
| REQ-ENG-004 | When the engine crashes before the WAL sync, the uncommitted transaction shall not be visible after recovery. | TEST-ENG-004 |
| REQ-ENG-005 | If the WAL is torn at any byte offset during a commit, then recovery shall expose either all or none of that transaction. | TEST-ENG-005 |
| REQ-ENG-006 | When recovery completes, the system shall restore the commit clock so new commits get larger timestamps. | TEST-ENG-006 |
| REQ-ENG-007 | When a checkpoint image is supplied, recovery shall start from the image and replay only later commits. | TEST-ENG-007 |
| REQ-ENG-008 | When the engine iterates after recovery, iteration results shall equal the pre-crash committed state. | TEST-ENG-008 |
| REQ-ENG-009 | If the supplied checkpoint image is older than the last Checkpoint record in the WAL, then recovery shall fail with EngineError::StaleCheckpoint. | TEST-ENG-009 |
| REQ-ENG-010 | If the WAL holds a Checkpoint record and no image is supplied, then recovery shall fail with EngineError::MissingCheckpoint. | TEST-ENG-010 |

## Design
`Engine{store: mvcc::Store, wal: wal::Wal}`. Commit protocol: validate conflict -> allocate ts -> append Put/Delete* + Commit(ts) -> sync -> apply to store. Recovery: Wal::open -> replay -> `Store::apply_at`.

| Crash point | Durable state | After recovery |
| --- | --- | --- |
| before append | nothing | txn absent |
| after append, before sync | buffer lost | txn absent |
| torn inside sync | partial frames | txn absent (no valid Commit) |
| after sync, before apply | full frames | txn present |
| after apply | full frames | txn present |

Recovery refuses images whose lsn is below the last Checkpoint record, and logs holding a Checkpoint when no image is given, because replay has already dropped the pre-checkpoint transactions.

Invariants: store state == fold of committed WAL txns; clock == max committed ts.

## Assumptions / risks
Checkpoint image carries ts; txns with ts <= image ts are skipped (depends on WAL REQ-WAL-008).
