---
feature: rollout
tier: T2
approval: auto
---
# Rollout
Goal: Stable, unbiased-enough assignment for 10,000 deterministic buckets.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ROLL-001 | When a flag and user are hashed, the system shall return a stable bucket from SHA-256. | TEST-ROLL-001 |
| REQ-ROLL-002 | When components contain separators, the system shall encode tuple boundaries unambiguously. | TEST-ROLL-002 |
| REQ-ROLL-003 | When percentage is zero or 100, the system shall target none or all users. | TEST-ROLL-003 |
| REQ-ROLL-004 | When percentage increases, the system shall preserve every prior assignment. | TEST-ROLL-004 |
| REQ-ROLL-005 | If percentage is non-finite or outside 0..100, the system shall throw a range error. | TEST-ROLL-005 |
| REQ-ROLL-006 | When salt or flag changes, the system shall isolate assignments. | TEST-ROLL-006 |
| REQ-ROLL-007 | When weighted variants are selected, the system shall choose the containing half-open bucket interval. | TEST-ROLL-007 |
| REQ-ROLL-008 | If weights are non-finite, negative, exceed two decimal places, do not sum to 100 or variant names duplicate, the system shall reject them. | TEST-ROLL-008 |
| REQ-ROLL-009 | When sampling 10,000 user keys, the system shall assign approximately half at 50 percent. | TEST-ROLL-009 |
## Design
Hash JSON [flag,user,salt], read first uint32 big-endian, modulo 10,000.
Percentage boundary is floor(percent*100); variants use cumulative integer boundaries.
## Assumptions / risks
Cryptographic hashing is deterministic in Node; spike verifies tuple encoding and golden digest.
Modulo bias is under one bucket in 2^32; this is assignment, not cryptographic authorization.
