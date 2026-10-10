---
feature: deadlock
tier: T2
approval: auto
---
# Deadlock detection
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DEADLOCK-001 | When two actors wait on one another, detector shall report their cycle. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-002 | When an actor waits on itself, detector shall report it. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-003 | When waits are acyclic, detector shall return no cycles. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-004 | When waits are removed, resolved cycles shall disappear. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-005 | When cycles are reported, members and cycle order shall be deterministic. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-006 | When overlapping cycles form an SCC, detector shall report that component once. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-007 | When waits contain disconnected components, all cyclic components shall be reported. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-008 | When runtime blocks an actor, scheduling shall skip it until unblocked. | TEST-DEADLOCK-001 |
| REQ-DEADLOCK-009 | When a wait graph exceeds Python recursion depth, detector shall still return the correct SCCs. | TEST-DEADLOCK-002 |
## Design
WaitGraph uses directed sets and iterative SCC traversal; results are sorted tuples, not exponential cycle enumeration.
Runtime blocked names are separate from analysis; a wait on an external name is not itself a deadlock.
## Assumptions / risks
An SCC signals cyclic waits, not guaranteed deadlock with external events. Spike covers self-loops.
