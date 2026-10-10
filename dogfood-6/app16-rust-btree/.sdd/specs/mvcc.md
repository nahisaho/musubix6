---
feature: mvcc
tier: T2
---
# mvcc
Goal: multi-version store on top of the B+tree with snapshot isolation, first-committer-wins conflicts and garbage collection. Non-goals: serializable isolation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MVCC-001 | When a key is written in a transaction and committed, a later transaction shall read the value. | TEST-MVCC-001 |
| REQ-MVCC-002 | While a transaction is open, it shall not see commits made after its start timestamp. | TEST-MVCC-002 |
| REQ-MVCC-003 | When a transaction reads a key it wrote, the system shall return its own uncommitted value. | TEST-MVCC-003 |
| REQ-MVCC-004 | If two concurrent transactions write the same key, then the second commit shall fail with Conflict. | TEST-MVCC-004 |
| REQ-MVCC-005 | When concurrent transactions write different keys, both commits shall succeed. | TEST-MVCC-005 |
| REQ-MVCC-006 | When a key is deleted, a later snapshot shall see None while an older snapshot shall still see the value. | TEST-MVCC-006 |
| REQ-MVCC-007 | When gc is called, the system shall remove versions invisible to every active snapshot and keep the newest visible one. | TEST-MVCC-007 |
| REQ-MVCC-008 | When gc finds a key whose newest version is a tombstone older than every snapshot, the system shall remove the key completely. | TEST-MVCC-008 |
| REQ-MVCC-009 | When user keys where one is a prefix of another are stored, the key encoding shall preserve user key order and keep versions newest first. | TEST-MVCC-009 |
| REQ-MVCC-010 | When a transaction is aborted, the system shall discard its writes and release its snapshot. | TEST-MVCC-010 |

## Design
Versioned key = `esc(key) ++ [0,0] ++ be64(u64::MAX - ts)` (`esc` maps 0x00 to 0x00 0xFF) stored in `btree::BTree`; value = `[1]++val` or `[0]` tombstone.

| Element | Rule |
| --- | --- |
| clock | last committed ts, +1 per commit |
| snapshot | txn.start_ts = clock at begin, registered in active set |
| visibility | version visible iff ts <= start_ts; newest such version wins |
| commit | conflict iff any written key has a version with ts > start_ts; a commit without writes returns start_ts and leaves the clock unchanged |
| gc horizon | min active start_ts, else clock |

Invariants: versions of one user key are contiguous and newest first; no two versions share (key, ts).

## Assumptions / risks
Escaping must keep `a` < `a\0` < `b`; spike with TEST-MVCC-009.
