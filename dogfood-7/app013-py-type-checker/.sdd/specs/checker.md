---
feature: checker
tier: T2
approval: auto
---
# checker
Goal: Implement checker for the bounded Python checker.
Non-goals: Full CPython semantics, imports, arbitrary code execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CHECKER-001 | When checking the supported subset, the system shall infer module assignments and display stable symbol types. | TEST-CHECKER-001 |
| REQ-CHECKER-002 | When checking the supported subset, the system shall enforce annotated assignments with source coordinates. | TEST-CHECKER-002 |
| REQ-CHECKER-003 | When checking the supported subset, the system shall type check annotated function calls and every reachable return, including implicit None fallthrough. | TEST-CHECKER-003 |
| REQ-CHECKER-004 | When checking the supported subset, the system shall integrate narrowing inside conditionals. | TEST-CHECKER-004 |
| REQ-CHECKER-005 | When checking the supported subset, the system shall return syntax diagnostics instead of crashing. | TEST-CHECKER-005 |
| REQ-CHECKER-006 | When checking the supported subset, the system shall reject unsupported executable syntax explicitly. | TEST-CHECKER-006 |
| REQ-CHECKER-007 | When checking the supported subset, the system shall diagnose possibly unbound names after branch joins. | TEST-CHECKER-007 |
| REQ-CHECKER-008 | When checking the supported subset, the system shall provide JSON CLI output and exit status. | TEST-CHECKER-008 |
| REQ-CHECKER-009 | When assigning an empty or recursively empty list/dict literal to an annotation, the system shall contextualize its unknown element types while retaining invariance for existing mutable values. | TEST-CHECKER-009 |
| REQ-CHECKER-010 | When conditional branches continue, the system shall preserve their declarations and diagnose conflicting branch annotations. | TEST-CHECKER-010 |
| REQ-CHECKER-011 | When builtin narrowing guards occur inside and/or/not conditions, the system shall validate them recursively without spurious undefined-builtin diagnostics. | TEST-CHECKER-011 |
## Design
Pure typed APIs consume immutable annotations or AST nodes; no user code is executed.
Errors are explicit ValueErrors internally and structured diagnostics at the checker boundary.
## Assumptions / risks
Python AST represents PEP 604 unions as BinOp and bool constants separately; spike validates both.
Mutable containers are invariant. Read-only protocol members are covariant; methods use function variance.
The language intentionally excludes loops, imports, comprehensions, exceptions, and user-defined classes.
