---
feature: pq
tier: T1
---
# pq
Goal: closable priority queue with blocking pop. Non-goals: bounded capacity.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PQ-001 | When Pop is called, the system shall return the item with the highest priority. | TEST-PQ-001 |
| REQ-PQ-002 | When items have equal priority, the system shall return them in insertion order. | TEST-PQ-002 |
| REQ-PQ-003 | When Pop is called on an empty queue, the system shall return ok=false. | TEST-PQ-003 |
| REQ-PQ-004 | When Len is called, the system shall return the number of queued items. | TEST-PQ-004 |
| REQ-PQ-005 | When Push is called after Close, the system shall return ErrClosed. | TEST-PQ-005 |
| REQ-PQ-006 | When PopWait(ctx) is called on an empty queue, the system shall block until an item arrives or ctx is done (returning ctx.Err()). | TEST-PQ-006 |
| REQ-PQ-007 | When PopWait is called on a closed and drained queue, the system shall return ErrClosed. | TEST-PQ-007 |
| REQ-PQ-008 | While many goroutines Push and PopWait concurrently, the system shall deliver each item exactly once. | TEST-PQ-008 |
