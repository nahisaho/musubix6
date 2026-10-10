---
feature: lifecycle
tier: T2
approval: auto
---
# Lifecycle
Goal: Deterministic maintenance from injected time. Non-goals: background timers.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LIFECYCLE-001 | When a member joins or heartbeats, the broker shall record its injected-clock activity timestamp. | TEST-LIFECYCLE-001 |
| REQ-LIFECYCLE-002 | When maintenance sees activity age at least sessionTimeout, the broker shall remove expired members and rebalance once per group. | TEST-LIFECYCLE-001 |
| REQ-LIFECYCLE-003 | When retention is configured, maintenance shall remove a contiguous old prefix while preserving absolute offsets. | TEST-LIFECYCLE-002 |
| REQ-LIFECYCLE-004 | When a consumer commit precedes retained data, polling shall begin at the earliest retained offset without moving its commit. | TEST-LIFECYCLE-002 |
| REQ-LIFECYCLE-005 | When dedupe age reaches dedupeTtl, maintenance shall expire producer and transaction dedupe entries so IDs become reusable. | TEST-LIFECYCLE-003 |
| REQ-LIFECYCLE-006 | While dedupe is unexpired, retention shall not destroy saved idempotent retry results. | TEST-LIFECYCLE-003 |
| REQ-LIFECYCLE-007 | If time regresses/is nonfinite or maintenance options are invalid, the broker shall reject before expiring any state. | TEST-LIFECYCLE-004 |
| REQ-LIFECYCLE-008 | When maintenance runs at the same time repeatedly, the broker shall be idempotent and report accurate expiry/prune counts. | TEST-LIFECYCLE-004 |
| REQ-LIFECYCLE-009 (test-only) | The exported lifecycle state table shall characterize supported maintenance transitions. | TEST-LIFECYCLE-005 |
## Design
Lifecycle extends Delivery, overrides join and exposes heartbeat/maintenance; no real timers exist.
Maintenance validates time/options first, batches group expiry, prunes prefixes and expires dedupe maps.
## Assumptions / risks
Exact boundary uses age >= timeout/TTL; retention removes timestamp < now-retentionMs.
Timestamps are sampled once per operation, monotonic finite numbers (spike/runtime.js).
