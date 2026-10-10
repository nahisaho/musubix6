---
feature: history
tier: T2
approval: auto
---
# Collaborative undo/redo
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HISTORY-001 | When a text insertion is performed, the editor shall group its code-point operations as one undo entry. | TEST-HISTORY-001 |
| REQ-HISTORY-002 | When undo follows an insertion, the editor shall hide only the inserted nodes and preserve remote descendants. | TEST-HISTORY-002 |
| REQ-HISTORY-003 | When redo follows insertion undo, the editor shall remove its own hide tags and reuse original node identities. | TEST-HISTORY-003 |
| REQ-HISTORY-004 | When a deletion is undone, the editor shall restore its tags but never clear a concurrent remote hide. | TEST-HISTORY-004 |
| REQ-HISTORY-005 | When undo or redo repeats across cycles, the editor shall emit fresh causally ordered CRDT operations. | TEST-HISTORY-005 |
| REQ-HISTORY-006 | When a new nonempty edit follows undo, the editor shall clear redo; remote edits and no-op edits shall not. | TEST-HISTORY-006 |
| REQ-HISTORY-007 | If undo/redo stacks are empty or edits are invalid, no state or counter shall change. | TEST-HISTORY-007 |
| REQ-HISTORY-008 | When history operations are replicated, all peers shall converge without relying on peers' local stacks. | TEST-HISTORY-008 |
## Design
Editor wraps Replica and keeps local stacks of node IDs and active hide tags, not string snapshots.
Insert undo emits hides; delete undo emits shows; redo of delete allocates fresh hide tags. Only local edits enter history.
Range validation precedes every grouped edit. Empty edits are no-ops. Operations are the public replication output.
Groups run on a staged replica with deferred pending drains; capacity and every operation validate before commit, and stack changes follow successful commit.
## Assumptions
Undo is intention-preserving: another actor's deletion wins. No durable history storage or automatic text replacement.
Runtime spike retires OR-tag ordering risk; later deterministic network tests cover interactions across features.
