---
feature: topics
tier: T2
approval: auto
---
# Topics
Goal: In-memory partitioned log. Non-goals: persistence or network protocols.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TOPICS-001 | When a valid topic is created, the broker shall allocate the requested positive partition count. | TEST-TOPICS-001 |
| REQ-TOPICS-002 | If creation uses an invalid name/count or existing name, the broker shall reject without changing state. | TEST-TOPICS-001 |
| REQ-TOPICS-003 | When publishing unkeyed records, the broker shall round-robin partitions and append contiguous per-partition offsets. | TEST-TOPICS-002 |
| REQ-TOPICS-004 | When publishing keyed records, the broker shall consistently hash the key or honor a valid explicit partition. | TEST-TOPICS-002 |
| REQ-TOPICS-005 | When publishing, the broker shall snapshot structured-cloneable payloads without shared memory and stamp its injected clock. | TEST-TOPICS-003 |
| REQ-TOPICS-006 | When records or metadata are returned, the broker shall isolate them from caller mutations. | TEST-TOPICS-003 |
| REQ-TOPICS-007 | When reading a partition, the broker shall return ordered records from the requested absolute offset, capped by limit. | TEST-TOPICS-004 |
| REQ-TOPICS-008 | If topic, partition, offset, limit, key or payload is invalid, the broker shall reject before appending or advancing round-robin. | TEST-TOPICS-004 |
| REQ-TOPICS-009 | If shared memory occurs in a clone-preserved non-enumerable Error cause, the broker shall reject it without appending. | TEST-TOPICS-005 |
## Design
Log owns topic maps and immutable snapshots; public methods return clones.
Offsets are array indices until retention sets a base offset; FNV-1a hashes UTF-8 keys.
## Assumptions / risks
Single-process synchronous calls are atomic; structuredClone handles cycles (spike/runtime.js).
Clock is finite monotonic; shared buffers and nested shared-memory views are rejected before cloning.
