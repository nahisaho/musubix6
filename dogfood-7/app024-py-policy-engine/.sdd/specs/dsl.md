---
feature: dsl
tier: T2
approval: auto
---
# Restricted ABAC DSL
Goal: safe expression parsing. Non-goals: arbitrary Python execution.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DSL-001 | When parsing equality, the system shall produce a canonical comparison tree. | TEST-DSL-001 |
| REQ-DSL-002 | When parsing Boolean operators, the system shall retain and-before-or precedence. | TEST-DSL-002 |
| REQ-DSL-003 | When evaluating a comparison, the system shall resolve nested request attributes. | TEST-DSL-003 |
| REQ-DSL-004 | When evaluating membership, the system shall support literal collections. | TEST-DSL-004 |
| REQ-DSL-005 | If an attribute is absent, the system shall raise ValueError. | TEST-DSL-005 |
| REQ-DSL-006 | If code calls or private attributes occur, the system shall reject them. | TEST-DSL-006 |
| REQ-DSL-007 | When evaluating a false conjunction, the system shall short-circuit later attributes. | TEST-DSL-007 |
| REQ-DSL-008 | If expressions exceed 256 AST nodes, the system shall reject them. | TEST-DSL-008 |
## Design
Python ast.parse produces a validated, serializable tuple tree; no eval/exec is used.
Only public subject/resource/action/env paths and explicit comparison/Boolean operators are permitted.
## Assumptions
Spike: Python AST membership and precedence remain explicit nodes; validated by spikes.py.
