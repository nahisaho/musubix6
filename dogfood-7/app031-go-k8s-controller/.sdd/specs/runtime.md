---
feature: runtime
tier: T2
approval: auto
---
# runtime
Goal: deterministic Kubernetes-style controller behavior. Non-goals: Kubernetes API/network adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RUNTIME-001 | When the relevant operation is requested, the system shall consume informer events and reconcile the latest cached object. | TEST-RUNTIME-001 |
| REQ-RUNTIME-002 | When the relevant operation is requested, the system shall enqueue the stable namespace/name key rather than an object pointer. | TEST-RUNTIME-001 |
| REQ-RUNTIME-003 | When the relevant operation is requested, the system shall publish reconciled status through the writer interface. | TEST-RUNTIME-001 |
| REQ-RUNTIME-004 | When the relevant operation is requested, the system shall delay and retry reconciliation errors. | TEST-RUNTIME-002 |
| REQ-RUNTIME-005 | When the relevant operation is requested, the system shall reset retry history after successful reconciliation. | TEST-RUNTIME-002 |
| REQ-RUNTIME-006 | When the relevant operation is requested, the system shall avoid invoking reconcilers for keys absent from the cache. | TEST-RUNTIME-002 |
| REQ-RUNTIME-007 | When the relevant operation is requested, the system shall require an active matching leader token before reconcile and before writes, passing that fencing token to the writer. | TEST-RUNTIME-003 |
| REQ-RUNTIME-008 | When the relevant operation is requested, the system shall process finalizer cleanup before removing deleting objects. | TEST-RUNTIME-003 |
| REQ-RUNTIME-009 | When the relevant operation is requested, the system shall allow distinct keys to reconcile concurrently without data races. | TEST-RUNTIME-003 |
| REQ-RUNTIME-010 | When a writer commits, the system shall increment the global resource version and reject a stale expected version atomically. | TEST-RUNTIME-004 |
| REQ-RUNTIME-011 | When a writer commits, the system shall atomically reject stale leader fencing tokens and publish copied events after releasing transaction locks. | TEST-RUNTIME-004 |
| REQ-RUNTIME-012 | When reconciliation returns the existing status, the system shall not write or trigger a new informer event. | TEST-RUNTIME-005 |
## Design
Informer -> cache -> queue -> leader-gated reconcile -> writer. Workers process distinct keys; optimistic resource versions prevent stale writes.
Illegal/stale operations leave state unchanged; all shared state uses mutexes. Callbacks execute outside state locks.
## Assumptions / risks
In-memory adapters simulate API-server leases and persistence; no credential, destructive external operation, or deployment is required.
Writer adapters must atomically validate the supplied fencing token when accepting writes; cleanup callbacks must be idempotent. Leadership checks cannot roll back callback side effects.
Spike: Go 1.26 supports generic internal packages, embedded metadata, interfaces, fake clocks, and table subtests; go test -race checks synchronization.
