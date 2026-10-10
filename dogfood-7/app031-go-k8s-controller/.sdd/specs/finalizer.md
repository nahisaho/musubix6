---
feature: finalizer
tier: T2
approval: auto
---
# finalizer
Goal: deterministic Kubernetes-style controller behavior. Non-goals: Kubernetes API/network adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FINALIZER-001 | When the relevant operation is requested, the system shall add the requested finalizer exactly once to a live object. | TEST-FINALIZER-001 |
| REQ-FINALIZER-002 | When the relevant operation is requested, the system shall preserve unrelated finalizers during registration. | TEST-FINALIZER-001 |
| REQ-FINALIZER-003 | When the relevant operation is requested, the system shall avoid registering finalizers on deleting objects. | TEST-FINALIZER-001 |
| REQ-FINALIZER-004 | When the relevant operation is requested, the system shall invoke cleanup while deleting an object carrying the finalizer. | TEST-FINALIZER-002 |
| REQ-FINALIZER-005 | When the relevant operation is requested, the system shall retain the finalizer if cleanup fails. | TEST-FINALIZER-002 |
| REQ-FINALIZER-006 | When the relevant operation is requested, the system shall remove only its own finalizer after successful cleanup. | TEST-FINALIZER-002 |
| REQ-FINALIZER-007 | When the relevant operation is requested, the system shall not invoke cleanup when its finalizer is absent. | TEST-FINALIZER-003 |
| REQ-FINALIZER-008 | When the relevant operation is requested, the system shall leave the caller's object unchanged. | TEST-FINALIZER-003 |
| REQ-FINALIZER-009 | When the relevant operation is requested, the system shall reject an empty finalizer name without invoking cleanup. | TEST-FINALIZER-003 |
## Design
Live -> registered; deleting+owned -> cleanup -> removed; cleanup failure retains ownership. Pure copy-on-write transformations.
Illegal/stale operations leave state unchanged; all shared state uses mutexes. Callbacks execute outside state locks.
## Assumptions / risks
In-memory adapters simulate API-server leases and persistence; no credential, destructive external operation, or deployment is required.
Writer adapters must atomically validate the supplied fencing token when accepting writes; cleanup callbacks must be idempotent. Leadership checks cannot roll back callback side effects.
Spike: Go 1.26 supports generic internal packages, embedded metadata, interfaces, fake clocks, and table subtests; go test -race checks synchronization.
