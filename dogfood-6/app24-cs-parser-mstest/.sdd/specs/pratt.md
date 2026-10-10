---
feature: pratt
tier: T1
---
# pratt
Goal: operator-precedence expression parser builder (precedence climbing) on top of combinators and error merging. Non-goals: mixfix/ternary operators.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PRT-001 | When infix operators of one level are Left-associative, the system shall group `a-b-c` as `(a-b)-c`. | TEST-PRT-001 |
| REQ-PRT-002 | When an infix level is Right-associative, the system shall group `a^b^c` as `a^(b^c)`. | TEST-PRT-002 |
| REQ-PRT-003 | If a None-associative operator is chained at its own level, then the system shall fail with a message containing "non-associative" at the second operator. | TEST-PRT-003 |
| REQ-PRT-004 | When a prefix operator has precedence p, the system shall let it bind tighter than infix levels below p and looser than levels at or above p (`-2^2` = -(2^2), `-2*3` = (-2)*3). | TEST-PRT-004 |
| REQ-PRT-005 | When postfix operators follow an operand, the system shall apply them repeatedly (`3!!`) respecting precedence against infix levels. | TEST-PRT-005 |
| REQ-PRT-006 | While operators of several levels are mixed, the system shall give higher-precedence operators tighter grouping; parentheses supplied through a recursive atom override it. | TEST-PRT-006 |
| REQ-PRT-007 | If an operand is missing after an infix operator, then the system shall fail at the offset after the operator expecting the atom label, not succeed on the shorter prefix. | TEST-PRT-007 |
| REQ-PRT-008 | If two infix operators registered at one precedence level disagree on associativity, then Build shall throw InvalidOperationException. | TEST-PRT-008 |

## Assumptions / risks: operator parsers are tried in registration order (longer operators must be registered first).
