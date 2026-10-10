---
feature: offline
tier: T1
approval: auto
---
# offline
Goal: offline queue of pending messages with coalescing, rebase, persistence and retry backoff.  Depends: ops, client (Message type).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OFFLINE-001 | When enqueue(op) is called, the system shall append an entry with the next seq (from 1) and the queue's baseRev. | TEST-OFFLINE-001 |
| REQ-OFFLINE-002 | When enqueue is called and the tail entry is unsent and has fewer than maxCoalesce ops, the system shall compose the op into the tail. | TEST-OFFLINE-002 |
| REQ-OFFLINE-003 | While the tail entry is in flight, enqueue shall create a new entry instead of composing. | TEST-OFFLINE-003 |
| REQ-OFFLINE-004 | When ack(seq) matches the head entry, the system shall remove it; a repeated ack of a removed seq shall be ignored; an ack of a non-head pending seq shall throw. | TEST-OFFLINE-004 |
| REQ-OFFLINE-005 | When rebase(serverOp) is called, the system shall transform every entry in order (server op wins ties), increment baseRev and return the server op as transformed past all entries. | TEST-OFFLINE-005 |
| REQ-OFFLINE-006 | If the queue holds maxEntries entries and the tail is in flight, then enqueue shall throw QueueFullError. | TEST-OFFLINE-006 |
| REQ-OFFLINE-007 | When serialize() is called, the system shall return JSON from which restore() rebuilds an identical queue. | TEST-OFFLINE-007 |
| REQ-OFFLINE-008 | If the JSON is corrupt, has a wrong version, or non-increasing seqs, then restore shall throw QueueCorruptError. | TEST-OFFLINE-008 |
| REQ-OFFLINE-009 | The system shall compute backoffMs(attempt, base, cap) = min(cap, base * 2^attempt) and throw RangeError for a negative or non-integer attempt. | TEST-OFFLINE-009 |
| REQ-OFFLINE-010 | When next() is called, the system shall return the head entry as a Message and mark it in flight; a second call without ack returns null. | TEST-OFFLINE-010 |
| REQ-OFFLINE-011 | The queue size shall never exceed maxEntries: if the tail is unsent but already holds maxCoalesce ops and the queue has maxEntries entries, then enqueue shall throw QueueFullError. | TEST-OFFLINE-011 |

## Assumptions / risks
Coalescing never merges an in-flight entry because the server may already have applied it (TEST-OFFLINE-003).
