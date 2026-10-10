---
feature: counters
tier: T1
approval: auto
---
# counters
Goal: state-based G-Counter and PN-Counter. Non-goals: bounded counters, op-based delivery.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COUNTERS-001 | When GCounter.increment(n) is called, the system shall add n to the local replica slot; n shall be a positive int else ValueError. | TEST-COUNTERS-001 |
| REQ-COUNTERS-002 | The GCounter value shall equal the sum over every replica slot. | TEST-COUNTERS-002 |
| REQ-COUNTERS-003 | When GCounter.merge(o) is called, the system shall return a new counter holding the pointwise maximum per replica without mutating either input. | TEST-COUNTERS-003 |
| REQ-COUNTERS-004 | The merge of GCounter and PNCounter shall be commutative, associative and idempotent. | TEST-COUNTERS-004 |
| REQ-COUNTERS-005 | The value of a merge shall never be lower than the value of either input. | TEST-COUNTERS-005 |
| REQ-COUNTERS-006 | When PNCounter.increment(n) or decrement(n) is called, the system shall update the P half or the N half respectively and value shall equal P minus N. | TEST-COUNTERS-006 |
| REQ-COUNTERS-007 | When PNCounter.merge(o) is called, the system shall merge both halves independently. | TEST-COUNTERS-007 |
| REQ-COUNTERS-008 | When to_dict is called, the system shall emit a canonical dict and from_dict(data, replica) shall round-trip it and reject negative or non-int slots with ValueError. | TEST-COUNTERS-008 |
| REQ-COUNTERS-009 | If merge is called with an object of another counter type, then the system shall raise TypeError. | TEST-COUNTERS-009 |

## Assumptions / risks
A replica id must be one writer only; two writers sharing an id lose increments (documented, not detectable).
