---
feature: syntax
tier: T2
approval: auto
---
# Syntax
Goal: Compile a documented Unicode regex subset. Non-goals: locale and inline flags.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SYNTAX-001 | When literals concatenate, the compiler shall preserve order. | TEST-SYNTAX-001 |
| REQ-SYNTAX-002 | When escaped metacharacters appear, the compiler shall treat them literally. | TEST-SYNTAX-001 |
| REQ-SYNTAX-003 | When alternatives appear, the compiler shall preserve left-first order. | TEST-SYNTAX-002 |
| REQ-SYNTAX-004 | When empty groups or alternatives appear, the compiler shall permit empty matches. | TEST-SYNTAX-002 |
| REQ-SYNTAX-005 | When bracket classes contain ranges or negation, the compiler shall evaluate them. | TEST-SYNTAX-003 |
| REQ-SYNTAX-006 | When a range is reversed or a bracket is unclosed, the compiler shall reject it. | TEST-SYNTAX-003 |
| REQ-SYNTAX-007 | When Unicode L, Lu, Ll, N, Nd, Z or whitespace/digit/word predicates appear, the compiler shall recognize codepoints. | TEST-SYNTAX-004 |
| REQ-SYNTAX-008 | When a Unicode predicate is complemented, the compiler shall invert it. | TEST-SYNTAX-004 |
| REQ-SYNTAX-009 | If a pattern contains dangling escapes, unmatched groups, unknown categories or orphan quantifiers, the compiler shall raise ValueError. | TEST-SYNTAX-005 |
| REQ-SYNTAX-010 | When dot appears, the compiler shall match one codepoint except newline. | TEST-SYNTAX-005 |
## Design
Recursive descent produces immutable tuple nodes; category predicates use unicodedata.
Parse errors carry an offset. Quantifier bounds and nesting are limited before execution.
## Assumptions
Python 3.11+ codepoint strings; no byte or locale patterns. Spike: Unicode Nd includes Arabic digits; Lu includes Greek.
Spike: Python re supports possessive quantifiers; custom executor needed for observable step limits.
