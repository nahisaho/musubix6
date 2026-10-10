---
feature: pretty
tier: T1
---
# pretty
Goal: print types, schemes and expressions with minimal parentheses and stable variable names.
Non-goals: colour, line wrapping.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PRETTY-001 | When a type is shown, the system shall print Int, Bool and variables named a, b, c.. in order of first appearance. | TEST-PRETTY-001 |
| REQ-PRETTY-002 | When arrows are shown, the system shall treat `->` as right associative and parenthesise only left-nested arrows. | TEST-PRETTY-002 |
| REQ-PRETTY-003 | When pair types are shown, the system shall print `a * b` with `*` right associative and binding tighter than `->`: arrows inside a pair and pairs on the left of `*` are parenthesised. | TEST-PRETTY-003 |
| REQ-PRETTY-004 | When more than 26 variables occur, the system shall continue with a1, b1, .. . | TEST-PRETTY-004 |
| REQ-PRETTY-005 | When a polymorphic scheme is shown, the system shall prefix `forall a b.` listing the occurring quantified names in order of first appearance; monomorphic schemes have no prefix. | TEST-PRETTY-005 |
| REQ-PRETTY-006 | When an expression is shown, the system shall print minimal parentheses such that parse(show_expr(e)) equals e ignoring positions. | TEST-PRETTY-006 |
| REQ-PRETTY-007 | When show_type receives a shared Namer, the system shall reuse names across calls. | TEST-PRETTY-007 |
| REQ-PRETTY-008 | When types equal up to variable renaming are shown, the system shall print identical text. | TEST-PRETTY-008 |
