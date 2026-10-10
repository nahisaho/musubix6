---
feature: cg
tier: T2
approval: auto
---
# Resource accounting
Goal: atomic simulated cgroup limits.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CG-001 | When a reservation equals limits, accounting shall accept it. | TEST-CG-001 |
| REQ-CG-002 | If memory, CPU or pid limits are exceeded, accounting shall reject the reservation. | TEST-CG-001 |
| REQ-CG-003 | If a reservation is rejected, accounting shall preserve all counters. | TEST-CG-001 |
| REQ-CG-004 | If reserve or release contains a negative value, accounting shall reject it. | TEST-CG-001 |
| REQ-CG-005 | If release exceeds usage, accounting shall reject it; otherwise it shall subtract usage. | TEST-CG-001 |
| REQ-CG-006 | When a configured limit is zero, accounting shall treat it as unlimited. | TEST-CG-001 |
| REQ-CG-007 | If a reservation overflows int64, accounting shall reject it. | TEST-CG-001 |
| REQ-CG-008 | When concurrent reservations compete for capacity, accounting shall enforce the same limit atomically. | TEST-CG-001 |
## Design
One mutex protects all three counters; validate the entire request before committing.
Overflow checks precede addition. Snapshot returns a value, never a live pointer.
## Assumptions / risks
Usage is logical units, not kernel metrics. Go race detector is mandatory.
