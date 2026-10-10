---
feature: sat
tier: T2
approval: auto
---
# Boolean CDCL engine
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SAT-001 | When unit clauses exist, the system shall assign their literals. | TEST-SAT-001 |
| REQ-SAT-002 | When assignments imply clauses, the system shall propagate to a fixed point. | TEST-SAT-002 |
| REQ-SAT-003 | If clauses conflict at level zero, the system shall return unsat. | TEST-SAT-003 |
| REQ-SAT-004 | When a decision is needed, the system shall produce a total satisfying assignment. | TEST-SAT-004 |
| REQ-SAT-005 | If a non-root conflict occurs, the system shall backjump and continue search. | TEST-SAT-005 |
| REQ-SAT-006 | If conflicts occur, the system shall learn clauses using first-UIP resolution. | TEST-SAT-006 |
| REQ-SAT-007 | When an empty formula or empty clause is supplied, the system shall return sat or unsat respectively. | TEST-SAT-007 |
| REQ-SAT-008 | If literals are zero, non-integer, or exceed the declared variable count, the system shall reject them. | TEST-SAT-008 |
## Design
Integer CNF literals; trail, levels, reason clauses and first-UIP learning. Scan propagation favors auditability over watched-literal speed.
States search -> propagate -> conflict/analyze/backjump or decide -> sat. Each solve owns its learned clauses and counters.
## Assumptions
Spike brute-forces small CNF as an independent correctness oracle; exponential workloads are out of scope.
