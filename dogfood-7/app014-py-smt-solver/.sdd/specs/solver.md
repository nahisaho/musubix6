---
feature: solver
tier: T2
approval: auto
---
# DPLL(T) orchestration
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SOLVER-001 | When Boolean clauses are asserted, the system shall return a satisfying Boolean model. | TEST-SOLVER-001 |
| REQ-SOLVER-002 | When arithmetic atoms are assigned, the system shall check their signed theory constraints. | TEST-SOLVER-002 |
| REQ-SOLVER-003 | When equality atoms are assigned, the system shall run ground congruence closure. | TEST-SOLVER-003 |
| REQ-SOLVER-004 | If a Boolean candidate conflicts with theory, the system shall learn a blocking lemma and retry; if Boolean search is exhausted, the system shall return unsat without a model. | TEST-SOLVER-004 |
| REQ-SOLVER-005 | When real and uninterpreted atoms coexist, the system shall combine their disjoint-sort models. | TEST-SOLVER-005 |
| REQ-SOLVER-006 | When push and pop are called, the system shall restore assertions and reject scope underflow. | TEST-SOLVER-006 |
| REQ-SOLVER-007 | If a theory-candidate budget is exhausted, the system shall return unknown without a model. | TEST-SOLVER-007 |
| REQ-SOLVER-008 | When the JSON CLI receives clauses and ground theory atoms, the system shall emit status and exact serializable models. | TEST-SOLVER-008 |
| REQ-SOLVER-009 | When JSON atom declarations repeat, the system shall preserve each declaration's one-based clause index while interning identical atoms. | TEST-SOLVER-009 |
| REQ-SOLVER-010 | If JSON input contains a zero rational denominator, the system shall emit a structured error and exit 2 without a traceback. | TEST-SOLVER-010 |
| REQ-SOLVER-011 | When distinct ground terms have identical display strings, the system shall serialize all class values losslessly using structural term records. | TEST-SOLVER-011 |
## Design
Intern typed atoms into positive Boolean variable IDs. CDCL produces candidates; inconsistent theory assignments yield sound blocking clauses.
Negated arithmetic equality branches into strict alternatives; the CLI accepts JSON, never eval. Real and EUF sorts are intentionally disjoint.
## Assumptions
Models satisfy every asserted clause and selected atom; finite candidate budget defaults to 10000; no proof certificates.
