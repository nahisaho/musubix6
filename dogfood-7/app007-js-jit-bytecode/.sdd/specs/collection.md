---
feature: collection
tier: T2
approval: auto
---
# Mark-compact heap simulator
Goal: deterministic bounded heap with stable handles. Non-goals: actual host-memory collection.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GC-001 | When allocating an object, the heap shall return a stable opaque handle and resolve its fields. | TEST-GC-001 |
| REQ-GC-002 | When collecting, the heap shall mark root-reachable objects transitively and reclaim unreachable objects. | TEST-GC-002 |
| REQ-GC-003 | When collection compacts addresses, live handles and object references shall continue to resolve. | TEST-GC-003 |
| REQ-GC-004 | When cycles are unreachable, collection shall reclaim them without recursive overflow. | TEST-GC-004 |
| REQ-GC-005 | When allocation reaches capacity, the heap shall collect supplied roots and either allocate or throw OutOfMemory. | TEST-GC-005 |
| REQ-GC-006 | If a handle is dead, forged or foreign, the heap shall reject dereference. | TEST-GC-006 |
| REQ-GC-007 | When fields or explicit roots change, the next collection shall use the current graph and root set. | TEST-GC-007 |
| REQ-GC-008 | When collecting, the heap shall report marked, reclaimed, moved and live counts consistently. | TEST-GC-008 |
## Design
Heap-owned frozen handles index a handle table; addresses index a dense object array.
Iterative mark traverses direct handle-valued object fields, then compaction rewrites table addresses.
The root set is explicit; allocation-time collection temporarily roots references in the new fields.
Recognized dead/foreign handles in fields or roots fail preflight before mutation/collection; plain object payloads are not handles.
## Assumptions / risks
Only direct handle fields are graph edges; nested arrays/plain objects are scalar payloads.
Compaction changes simulated addresses, never handle identities; foreign refs must fail before mutation.
