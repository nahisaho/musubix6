---
feature: arithmetic
tier: T2
approval: auto
---
# Linear real arithmetic
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ARITHMETIC-001 | When lower bounds exist, the system shall extract a rational satisfying assignment. | TEST-ARITHMETIC-001 |
| REQ-ARITHMETIC-002 | When upper bounds exist, the system shall support unrestricted negative variables. | TEST-ARITHMETIC-002 |
| REQ-ARITHMETIC-003 | If bounds contradict, the system shall return infeasible. | TEST-ARITHMETIC-003 |
| REQ-ARITHMETIC-004 | When equalities exist, the system shall satisfy both bound directions. | TEST-ARITHMETIC-004 |
| REQ-ARITHMETIC-005 | When multivariate constraints exist, the system shall solve the coupled system using simplex pivots. | TEST-ARITHMETIC-005 |
| REQ-ARITHMETIC-006 | When fractional constraints exist, the system shall preserve exact rational values. | TEST-ARITHMETIC-006 |
| REQ-ARITHMETIC-007 | When constraints are empty or objectives unbounded, the system shall still provide a feasible model. | TEST-ARITHMETIC-007 |
| REQ-ARITHMETIC-008 | When strict bounds exist, the system shall choose positive common slack or return infeasible. | TEST-ARITHMETIC-008 |
## Design
Two-phase primal simplex over Fraction; free variables split into nonnegative positive/negative columns.
Strict inequalities share delta in [0,1]; maximize delta and require optimum > 0. Bland pivoting prevents cycling.
## Assumptions
Spike confirms exact tableau arithmetic; model is rechecked against every input relation.
