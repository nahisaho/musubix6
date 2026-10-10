---
feature: leader
tier: T2
approval: auto
---
# leader
Goal: deterministic Kubernetes-style controller behavior. Non-goals: Kubernetes API/network adapters.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEADER-001 | When the relevant operation is requested, the system shall grant the first eligible candidate a lease. | TEST-LEADER-001 |
| REQ-LEADER-002 | When the relevant operation is requested, the system shall deny acquisition while another unexpired holder owns the lease. | TEST-LEADER-001 |
| REQ-LEADER-003 | When the relevant operation is requested, the system shall reject nonpositive lease durations and empty holder names. | TEST-LEADER-001 |
| REQ-LEADER-004 | When the relevant operation is requested, the system shall renew only the matching holder and fencing token. | TEST-LEADER-002 |
| REQ-LEADER-005 | When the relevant operation is requested, the system shall deny a renewal at or after lease expiry. | TEST-LEADER-002 |
| REQ-LEADER-006 | When the relevant operation is requested, the system shall permit failover at the exact expiry boundary. | TEST-LEADER-002 |
| REQ-LEADER-007 | When the relevant operation is requested, the system shall monotonically increase fencing tokens on each acquisition. | TEST-LEADER-003 |
| REQ-LEADER-008 | When the relevant operation is requested, the system shall reject a stale holder release after failover. | TEST-LEADER-003 |
| REQ-LEADER-009 | When the relevant operation is requested, the system shall return lease snapshots that cannot mutate stored ownership. | TEST-LEADER-003 |
## Design
Lease transitions vacant -> held -> expired -> held. Mutex-protected fencing tokens forbid stale renewals and releases.
Illegal/stale operations leave state unchanged; all shared state uses mutexes. WithFence holds the lease lock across a trusted storage transaction; the transaction must not reenter the elector. User callbacks run only after the transaction.
## Assumptions / risks
In-memory adapters simulate API-server leases and persistence; no credential, destructive external operation, or deployment is required.
Writer adapters must atomically validate the supplied fencing token when accepting writes; cleanup callbacks must be idempotent. Leadership checks cannot roll back callback side effects.
Spike: Go 1.26 supports generic internal packages, embedded metadata, interfaces, fake clocks, and table subtests; go test -race checks synchronization.
