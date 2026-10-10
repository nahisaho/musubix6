---
feature: contracts
tier: T2
approval: auto
---
# contracts
Goal: Implement contracts for the bounded Python checker.
Non-goals: Full CPython semantics, imports, arbitrary code execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CONTRACTS-001 | When checking the supported subset, the system shall instantiate explicit generic function signatures. | TEST-CONTRACTS-001 |
| REQ-CONTRACTS-002 | When checking the supported subset, the system shall validate generic bounds. | TEST-CONTRACTS-002 |
| REQ-CONTRACTS-003 | When checking the supported subset, the system shall reject missing and extra generic arguments. | TEST-CONTRACTS-003 |
| REQ-CONTRACTS-004 | When checking the supported subset, the system shall accept structural protocols with required members. | TEST-CONTRACTS-004 |
| REQ-CONTRACTS-005 | When checking the supported subset, the system shall report absent and incompatible protocol members deterministically. | TEST-CONTRACTS-005 |
| REQ-CONTRACTS-006 | When checking the supported subset, the system shall apply contravariant parameters and covariant returns to methods. | TEST-CONTRACTS-006 |
| REQ-CONTRACTS-007 | When checking the supported subset, the system shall keep mutable protocol attributes invariant. | TEST-CONTRACTS-007 |
| REQ-CONTRACTS-008 | When checking the supported subset, the system shall infer generic bindings from nested actual arguments. | TEST-CONTRACTS-008 |
| REQ-CONTRACTS-009 | When binding generic arguments, the system shall validate instantiated formals with mutable invariance. | TEST-CONTRACTS-009 |
| REQ-CONTRACTS-010 | When binding a union with one variable-bearing alternative, the system shall match concrete alternatives independently of lexical order and infer from the remainder; ambiguous multiple-variable unions shall be rejected. | TEST-CONTRACTS-010 |
## Design
Pure typed APIs consume immutable annotations or AST nodes; no user code is executed.
Errors are explicit ValueErrors internally and structured diagnostics at the checker boundary.
## Assumptions / risks
Python AST represents PEP 604 unions as BinOp and bool constants separately; spike validates both.
Mutable containers are invariant. Read-only protocol members are covariant; methods use function variance.
The language intentionally excludes loops, imports, comprehensions, exceptions, and user-defined classes.
