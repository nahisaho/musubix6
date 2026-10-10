---
feature: lease
tier: T2
approval: auto
---
# lease
Goal: Leases with TTL (package `lease`) that bind keys to a lifetime; revocation or expiry deletes attached keys atomically.
Non-goals: wall clock, persistence of leases.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEASE-001 | When Grant is called with ttl >= MinTTL, the manager shall return a new lease with an increasing ID; a smaller ttl shall return ErrTTLTooSmall. | TEST-LEASE-001 |
| REQ-LEASE-002 | When Put is called with a live lease, the manager shall store the key with KeyValue.Lease set; an unknown lease shall return ErrLeaseNotFound and leave the store unchanged. | TEST-LEASE-002 |
| REQ-LEASE-003 | When a lease is revoked, the manager shall delete all its live keys in a single revision and forget the lease; an unknown lease shall return ErrLeaseNotFound. | TEST-LEASE-003 |
| REQ-LEASE-004 | If a revoked lease has no live keys, then the manager shall not consume a revision. | TEST-LEASE-004 |
| REQ-LEASE-005 | When KeepAlive is called on a live lease, the manager shall reset expiry to now+TTL and return the TTL. | TEST-LEASE-005 |
| REQ-LEASE-006 | When Expire(now) runs, the manager shall revoke every lease with expiry <= now ordered by (expiry, ID) and return their IDs. | TEST-LEASE-006 |
| REQ-LEASE-007 | If KeepAlive targets a lease whose expiry has passed but that is not yet revoked, then the manager shall return ErrLeaseExpired and not extend it. | TEST-LEASE-007 |
| REQ-LEASE-008 | When a leased key is overwritten with another lease or none, the manager shall detach it from the old lease so that revoking the old lease keeps the key. | TEST-LEASE-008 |
| REQ-LEASE-009 | When TimeToLive is called, the manager shall return the remaining TTL and the sorted live attached keys; an unknown lease shall return ErrLeaseNotFound. | TEST-LEASE-009 |
| REQ-LEASE-010 | If Put names a lease whose expiry has passed but that is not yet revoked, then the manager shall return ErrLeaseExpired and leave the store unchanged (bug fix). | TEST-LEASE-010 |

## Design
Components: `lease.Manager` (injected clock `func() int64` seconds) wraps `mvcc.Store`; `leases map[ID]*lease{ttl, expiry, keys set}`.
State/invariant table:

| State | Transition | Invariant |
| --- | --- | --- |
| live (now < expiry) | KeepAlive | expiry = now + ttl |
| live | now >= expiry | expired-pending (still listed until Expire) |
| expired-pending | KeepAlive | rejected ErrLeaseExpired |
| live/expired-pending | Revoke/Expire | gone; attached live keys deleted in 1 revision |

Invariants: a key belongs to at most one lease (the one in its stored KeyValue.Lease); lease IDs never reused; a no-op revoke consumes no revision.
## Assumptions / risks
Keys deleted behind the manager's back are skipped on revoke (retired by TEST-LEASE-004).
