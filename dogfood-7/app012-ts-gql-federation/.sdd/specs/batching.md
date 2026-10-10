---
feature: batching
tier: T2
approval: auto
---
# Request-local batching
Goal: Deduplicate entity loads without sharing data between requests.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BATCH-001 | When loads occur in one microtask turn, the loader shall dispatch one ordered batch. | TEST-BATCH-001 |
| REQ-BATCH-002 | When equivalent structured keys load, the loader shall reuse one promise. | TEST-BATCH-002 |
| REQ-BATCH-003 | If a batch exceeds maxBatchSize, the loader shall split it without reordering. | TEST-BATCH-003 |
| REQ-BATCH-004 | If a batch rejects, the loader shall reject its loads and allow retry. | TEST-BATCH-004 |
| REQ-BATCH-005 | When a key is cleared, subsequent loads shall refetch it. | TEST-BATCH-005 |
| REQ-BATCH-006 | When a key is primed, the loader shall preserve an existing cached value. | TEST-BATCH-006 |
| REQ-BATCH-007 | If a batch returns wrong cardinality, the loader shall reject every affected load. | TEST-BATCH-007 |
| REQ-BATCH-008 | If an individual result is an Error, the loader shall reject only that load. | TEST-BATCH-008 |
## Design
Microtask queue entries own resolve/reject closures; cache stores pending promises keyed by canonical JSON.
Dispatch drains a snapshot, chunks by a positive integer limit, and evicts failed entries only if still current.
## Assumptions
Spike: queueMicrotask snapshots coalesce synchronous loads; Promise.all preserves response ordering.
Keys are JSON-compatible, acyclic objects; caches exist only for one request, with explicit clear/prime.
