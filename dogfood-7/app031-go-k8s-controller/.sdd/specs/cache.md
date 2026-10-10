---
feature: cache
tier: T2
approval: auto
---
# cache
Goal: deterministic Kubernetes-style controller behavior. Non-goals: Kubernetes API/network adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CACHE-001 | When the relevant operation is requested, the system shall return an isolated copy after inserting an object. | TEST-CACHE-001 |
| REQ-CACHE-002 | When the relevant operation is requested, the system shall reject an update whose resource version is stale. | TEST-CACHE-001 |
| REQ-CACHE-003 | When the relevant operation is requested, the system shall accept a strictly newer resource version. | TEST-CACHE-001 |
| REQ-CACHE-004 | When the relevant operation is requested, the system shall reject stale deletion events. | TEST-CACHE-002 |
| REQ-CACHE-005 | When the relevant operation is requested, the system shall retain a tombstone preventing stale resurrection. | TEST-CACHE-002 |
| REQ-CACHE-006 | When the relevant operation is requested, the system shall return objects in deterministic key order. | TEST-CACHE-002 |
| REQ-CACHE-007 | When the relevant operation is requested, the system shall replace the complete cache with a list snapshot. | TEST-CACHE-003 |
| REQ-CACHE-008 | When the relevant operation is requested, the system shall reject snapshots older than any previously observed event or relist version. | TEST-CACHE-003 |
| REQ-CACHE-009 | When the relevant operation is requested, the system shall notify watchers outside the lock using isolated objects. | TEST-CACHE-003 |
| REQ-CACHE-010 | When an unseen key is deleted, the system shall retain its tombstone and reject stale later adds. | TEST-CACHE-004 |
| REQ-CACHE-011 | When a list snapshot is accepted at version V, the system shall reject subsequent add and delete events at or below V, including previously unseen keys. | TEST-CACHE-005 |
## Design
Generic copy-on-read store; resource versions and tombstones guard informer events. Snapshot replacement publishes an ordered diff.
Illegal/stale operations leave state unchanged; all shared state uses mutexes. Callbacks execute outside state locks.
## Assumptions / risks
In-memory adapters simulate API-server leases and persistence; no credential, destructive external operation, or deployment is required.
Writer adapters must atomically validate the supplied fencing token when accepting writes; cleanup callbacks must be idempotent. Leadership checks cannot roll back callback side effects.
Spike: Go 1.26 supports generic internal packages, embedded metadata, interfaces, fake clocks, and table subtests; go test -race checks synchronization.
