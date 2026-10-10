---
feature: leases
tier: T2
approval: auto
---
# Fenced leases
Goal: atomic distributed-worker ownership model. Non-goals: network persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEASES-001 | When acquiring an unowned key, the store shall return owner, token, and expiry. | TEST-LEASES-001 |
| REQ-LEASES-002 | When a live key is acquired again, including by its owner, the store shall refuse. | TEST-LEASES-002 |
| REQ-LEASES-003 | When a lease expires at the current instant, a new owner shall acquire a higher fencing token. | TEST-LEASES-003 |
| REQ-LEASES-004 | When renewing a live matching lease, the store shall extend expiry from now. | TEST-LEASES-004 |
| REQ-LEASES-005 | If owner or token mismatches or the stored lease has expired, renewal and validation shall refuse; renewal shall preserve older token snapshots. | TEST-LEASES-005 |
| REQ-LEASES-006 | When releasing, only the live matching lease shall succeed and later release shall refuse. | TEST-LEASES-006 |
| REQ-LEASES-007 | If key, owner, or TTL is invalid, the store shall raise ValueError. | TEST-LEASES-007 |
| REQ-LEASES-008 | When concurrent threads acquire one key, exactly one shall succeed. | TEST-LEASES-008 |
## Design
RLock protects a per-key immutable lease map and monotonically increasing store-wide token.
Expiry is exclusive: live iff now < stored expires; operations compare key, owner, and token, not snapshot expiry.
## Assumptions / risks
Fake UTC clock injects time; no operations await or yield while holding the store lock.
Thread contention spike uses a barrier; simulation does not claim cross-process durability.
