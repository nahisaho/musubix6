---
feature: flow
tier: T2
approval: auto
---
# flow
Goal: Implement flow for the bounded Python checker.
Non-goals: Full CPython semantics, imports, arbitrary code execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FLOW-001 | When checking the supported subset, the system shall narrow optional values on None identity guards. | TEST-FLOW-001 |
| REQ-FLOW-002 | When checking the supported subset, the system shall narrow positive and negative isinstance guards. | TEST-FLOW-002 |
| REQ-FLOW-003 | When checking the supported subset, the system shall join branch environments by union. | TEST-FLOW-003 |
| REQ-FLOW-004 | When checking the supported subset, the system shall represent impossible guard branches as Never. | TEST-FLOW-004 |
| REQ-FLOW-005 | When checking the supported subset, the system shall preserve caller environment immutably. | TEST-FLOW-005 |
| REQ-FLOW-006 | When checking the supported subset, the system shall compose conjunction guards in branch order. | TEST-FLOW-006 |
| REQ-FLOW-007 | When checking the supported subset, the system shall support disjunction guards without losing alternatives. | TEST-FLOW-007 |
| REQ-FLOW-008 | When checking the supported subset, the system shall leave unrelated guards and shadowed builtin predicates or types unchanged. | TEST-FLOW-008 |
| REQ-FLOW-009 | When narrowing isinstance guards, the system shall use runtime inheritance (bool <: int), not the arithmetic widening int <: float. | TEST-FLOW-009 |
## Design
Pure typed APIs consume immutable annotations or AST nodes; no user code is executed.
Errors are explicit ValueErrors internally and structured diagnostics at the checker boundary.
## Assumptions / risks
Python AST represents PEP 604 unions as BinOp and bool constants separately; spike validates both.
Mutable containers are invariant. Read-only protocol members are covariant; methods use function variance.
The language intentionally excludes loops, imports, comprehensions, exceptions, and user-defined classes.
