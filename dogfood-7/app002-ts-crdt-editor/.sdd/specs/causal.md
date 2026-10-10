---
feature: causal
tier: T2
approval: auto
---
# Causal delivery
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CAUSAL-001 | When a local operation is created, the replica shall allocate the next actor counter and snapshot its causal clock. | TEST-CAUSAL-001 |
| REQ-CAUSAL-002 | When dependencies are missing, receive shall buffer until all dependencies arrive and drain to a fixed point. | TEST-CAUSAL-002 |
| REQ-CAUSAL-003 | When same-actor operations arrive reversed, receive shall deliver each counter contiguously. | TEST-CAUSAL-003 |
| REQ-CAUSAL-004 | When a delivered or buffered operation repeats, receive shall be idempotent and reject a conflicting payload. | TEST-CAUSAL-004 |
| REQ-CAUSAL-005 | If structural causal proof is invalid, receive shall reject atomically; if a ready operation has an invalid target/tag binding or Lamport time, it shall reject or quarantine without advancing its clock. | TEST-CAUSAL-005 |
| REQ-CAUSAL-006 | When callers inspect clocks or logs, returned data shall not permit internal mutation. | TEST-CAUSAL-006 |
| REQ-CAUSAL-007 | When local inserts and hides follow remote edits, the replica shall generate operations against visible code-point indexes. | TEST-CAUSAL-007 |
| REQ-CAUSAL-008 | If local indexes or actor identities are invalid, the replica shall reject without consuming counters. | TEST-CAUSAL-008 |
## Design
Replica owns an RGA, vector clock, immutable received-operation map and pending map. No network I/O.
Ready iff all deps are satisfied and own counter equals current+1; successful delivery advances clock and drains pending.
Parent/target/tag references must occur in deps; own deps equal seq-1; receive validates before enqueue.
Local Lamport time advances above every delivered operation; ready operations must exceed every operation included in deps.
Target must name an insert; show tag must name a hide of that target. Ready invalid input throws before enqueue; buffered invalid input is removed to a rejected list on drain.
Editor-only synchronous atomic groups stage state, defer pending delivery until the group completes, and preserve the live Sequence object on commit.
## Assumptions
Actors have exclusive ownership (no two live replicas allocate the same actor); offline logs are retained.
The spike covers buffer fixed-point order and native workspace imports. Replicas reject forged references rather than guessing.
