---
feature: parse
tier: T1
---
# parse
Goal: tokenize and parse a small lambda calculus (let, let rec, if, pairs, operators) into a position-annotated AST.
Non-goals: type checking, pretty printing.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSE-001 | When the source has integer, true/false and identifier tokens, the tokenizer shall return them with 1-based line and column. | TEST-PARSE-001 |
| REQ-PARSE-002 | When `\x y. e` or `fun x y -> e` is parsed, the system shall build nested single-parameter Lam nodes. | TEST-PARSE-002 |
| REQ-PARSE-003 | When juxtaposed atoms are parsed, the system shall build left-associative App nodes (f a b = (f a) b). | TEST-PARSE-003 |
| REQ-PARSE-004 | When binary operators are parsed, the system shall honour precedence (`*` over `+ -` over `== <`) and left associativity, desugaring `a op b` to App(App(Var op,a),b). | TEST-PARSE-004 |
| REQ-PARSE-005 | When `let x = e1 in e2` or `let rec f = e1 in e2` is parsed, the system shall build Let nodes with a rec flag. | TEST-PARSE-005 |
| REQ-PARSE-006 | When `(a, b)` is parsed, the system shall build a Pair node; `(e)` shall be plain grouping. | TEST-PARSE-006 |
| REQ-PARSE-007 | When `-- text` appears, the system shall ignore the comment up to end of line. | TEST-PARSE-007 |
| REQ-PARSE-008 | If the source has an unexpected token or character, then the system shall raise ParseError carrying the line and column of the offender. | TEST-PARSE-008 |
| REQ-PARSE-009 | If input ends early or has trailing tokens, then the system shall raise ParseError at the end position or the first extra token. | TEST-PARSE-009 |
| REQ-PARSE-010 | If a keyword is used as a binder name, then the system shall raise ParseError. | TEST-PARSE-010 |
| REQ-PARSE-011 | If nesting (parentheses, lambda/let/if bodies) exceeds 100 levels, then the system shall raise ParseError "nesting too deep" at the offending token instead of overflowing the Python stack. | TEST-PARSE-011 |

## Assumptions / risks: lambda and let/if bodies extend as far right as possible (retired by TEST-PARSE-002/005).
