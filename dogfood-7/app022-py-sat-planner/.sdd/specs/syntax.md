---
feature: syntax
tier: T2
approval: auto
---
# syntax
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SYN-001 | When tokenizing input, the parser shall ignore comments and lowercase symbols. | TEST-SYN-001 |
| REQ-SYN-002 | When parsing expressions, the parser shall reject unmatched parentheses. | TEST-SYN-001 |
| REQ-SYN-003 | When parsing a domain, the parser shall preserve action parameters and conjunctions and reject duplicate action names. | TEST-SYN-001 |
| REQ-SYN-004 | When parsing a problem, the parser shall preserve initial facts and goals. | TEST-SYN-001 |
| REQ-SYN-005 | If a domain uses unsupported requirements or negative preconditions, the parser shall reject it. | TEST-SYN-002 |
| REQ-SYN-006 | If action cost is not positive, the model shall reject it. | TEST-SYN-002 |
| REQ-SYN-007 | When constructing actions, the model shall freeze fact sets. | TEST-SYN-002 |
| REQ-SYN-008 | When parsing typed objects, the parser shall preserve declared types and default object type. | TEST-SYN-002 |
| REQ-SYN-009 | If a section tag, requirement or predicate name is nested, the parser shall reject it with ValueError. | TEST-SYN-003 |
| REQ-SYN-010 | If any declared identifier contains ground-label delimiters or is not a PDDL symbol, the parser shall reject it. | TEST-SYN-004 |
## Design
Frozen dataclasses represent lifted and grounded STRIPS actions; atoms are tuples.
S-expression parser accepts typed positive STRIPS, delete effects and optional positive integer :cost.
## Assumptions
Only flat types are supported; equality, quantifiers and numeric PDDL are rejected.
Spike: immutable frozensets are hashable state keys and Python heap tuples break ties safely.
