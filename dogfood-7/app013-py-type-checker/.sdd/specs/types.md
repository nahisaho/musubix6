---
feature: types
tier: T2
approval: auto
---
# types
Goal: Implement types for the bounded Python checker.
Non-goals: Full CPython semantics, imports, arbitrary code execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TYPES-001 | When checking the supported subset, the system shall parse primitive types canonically without executing annotation expressions. | TEST-TYPES-001 |
| REQ-TYPES-002 | When checking the supported subset, the system shall normalize flattened deduplicated unions. | TEST-TYPES-002 |
| REQ-TYPES-003 | When checking the supported subset, the system shall treat Any as gradually compatible and Never as bottom. | TEST-TYPES-003 |
| REQ-TYPES-004 | When checking the supported subset, the system shall respect primitive subtyping without conflating strings. | TEST-TYPES-004 |
| REQ-TYPES-005 | When checking the supported subset, the system shall check union coverage in both directions. | TEST-TYPES-005 |
| REQ-TYPES-006 | When checking the supported subset, the system shall enforce mutable generic invariance. | TEST-TYPES-006 |
| REQ-TYPES-007 | When checking the supported subset, the system shall substitute nested generic type variables. | TEST-TYPES-007 |
| REQ-TYPES-008 | When checking the supported subset, the system shall reject malformed annotations and incorrect generic arity. | TEST-TYPES-008 |
| REQ-TYPES-009 (test-only) | When rendering a mixed union, the system shall retain the characterized stable lexical ordering. | TEST-TYPES-009 |
## Design
Pure typed APIs consume immutable annotations or AST nodes; no user code is executed.
Errors are explicit ValueErrors internally and structured diagnostics at the checker boundary.
## Assumptions / risks
Python AST represents PEP 604 unions as BinOp and bool constants separately; spike validates both.
Mutable containers are invariant. Read-only protocol members are covariant; methods use function variance.
The language intentionally excludes loops, imports, comprehensions, exceptions, and user-defined classes.
