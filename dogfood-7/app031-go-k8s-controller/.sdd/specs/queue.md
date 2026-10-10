---
feature: queue
tier: T2
approval: auto
---
# queue
Goal: deterministic Kubernetes-style controller behavior. Non-goals: Kubernetes API/network adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUEUE-001 | When the relevant operation is requested, the system shall deduplicate pending keys. | TEST-QUEUE-001 |
| REQ-QUEUE-002 | When the relevant operation is requested, the system shall deliver keys in FIFO order. | TEST-QUEUE-001 |
| REQ-QUEUE-003 | When the relevant operation is requested, the system shall prevent simultaneous delivery of the same processing key. | TEST-QUEUE-001 |
| REQ-QUEUE-004 | When the relevant operation is requested, the system shall enqueue a dirty processing key once after Done. | TEST-QUEUE-002 |
| REQ-QUEUE-005 | When the relevant operation is requested, the system shall delay a failed key until its retry deadline. | TEST-QUEUE-002 |
| REQ-QUEUE-006 | When the relevant operation is requested, the system shall cap exponential retry delays at the configured maximum. | TEST-QUEUE-002 |
| REQ-QUEUE-007 | When the relevant operation is requested, the system shall reset retry counters when Forget is called. | TEST-QUEUE-003 |
| REQ-QUEUE-008 | When the relevant operation is requested, the system shall reject new work after shutdown. | TEST-QUEUE-003 |
| REQ-QUEUE-009 | When the relevant operation is requested, the system shall promote delayed keys using the injected clock without sleeping. | TEST-QUEUE-003 |
| REQ-QUEUE-010 | When Forget follows a successful retry through another event, the system shall cancel outstanding delayed retries for that key. | TEST-QUEUE-004 |
## Design
Generic comparable keys; pending -> processing -> done; dirty processing keys requeue once. Fake-clock deadlines promote through Tick.
Illegal/stale operations leave state unchanged; all shared state uses mutexes. Callbacks execute outside state locks.
## Assumptions / risks
In-memory adapters simulate API-server leases and persistence; no credential, destructive external operation, or deployment is required.
Writer adapters must atomically validate the supplied fencing token when accepting writes; cleanup callbacks must be idempotent. Leadership checks cannot roll back callback side effects.
Spike: Go 1.26 supports generic internal packages, embedded metadata, interfaces, fake clocks, and table subtests; go test -race checks synchronization.
