---
feature: hm
tier: T2
approval: auto
---
# hm
Goal: Implement hm for the bounded Python checker.
Non-goals: Full CPython semantics, imports, arbitrary code execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HM-001 | When checking the supported subset, the system shall infer literals including bool before int. | TEST-HM-001 |
| REQ-HM-002 | When checking the supported subset, the system shall infer homogeneous and heterogeneous lists. | TEST-HM-002 |
| REQ-HM-003 | When checking the supported subset, the system shall infer identity and specialize lambda application. | TEST-HM-003 |
| REQ-HM-004 | When checking the supported subset, the system shall infer higher-order functions with shared constraints. | TEST-HM-004 |
| REQ-HM-005 | When checking the immutable expression subset, the system shall generalize only environment-free variables for independent let-bound identity uses. | TEST-HM-005 |
| REQ-HM-006 | When checking the supported subset, the system shall reject recursive infinite types with occurs checking. | TEST-HM-006 |
| REQ-HM-007 | When checking the supported subset, the system shall diagnose undefined symbols and callable arity. | TEST-HM-007 |
| REQ-HM-008 | When checking the supported subset, the system shall infer arithmetic and numeric widening. | TEST-HM-008 |
| REQ-HM-009 | When checking higher-order calls, the system shall enforce contravariant callable parameters and covariant returns. | TEST-HM-009 |
| REQ-HM-010 | When rendering inferred types with fresh and environment variables, the system shall assign stable distinct parseable names without crashing. | TEST-HM-010 |
## Design
Pure typed APIs consume immutable annotations or AST nodes; no user code is executed.
Errors are explicit ValueErrors internally and structured diagnostics at the checker boundary.
## Assumptions / risks
Python AST represents PEP 604 unions as BinOp and bool constants separately; spike validates both.
Mutable containers are invariant. Read-only protocol members are covariant; methods use function variance.
The language intentionally excludes loops, imports, comprehensions, exceptions, and user-defined classes.
Mutation (attribute/subscript writes and mutating method calls) is unsupported; polymorphic values cannot share writable state.
