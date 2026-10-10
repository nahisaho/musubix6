---
feature: conditions
tier: T2
approval: auto
---
# conditions
Goal: Small ABAC condition DSL (tokenizer, parser, evaluator). Non-goals: arithmetic.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COND-001 | When an expression contains a comparison `a.b == "x"` or `!=`, the system shall evaluate it against the attribute context. | TEST-COND-001 |
| REQ-COND-002 | When an expression uses `<`, `<=`, `>`, `>=` on numbers, the system shall compare numerically. | TEST-COND-002 |
| REQ-COND-003 | When an expression combines operands with `&&`, `\|\|` and `!`, the system shall apply precedence ! > && > \|\| and honour parentheses. | TEST-COND-003 |
| REQ-COND-004 | When an expression uses `in [..]`, the system shall be true iff the left value equals a list element. | TEST-COND-004 |
| REQ-COND-005 | If an attribute path is missing from the context, then the system shall evaluate the comparison to false (fail closed), including for `!=`. | TEST-COND-005 |
| REQ-COND-006 | If the expression has a syntax error, then the system shall throw Rbac\Conditions\ParseException. | TEST-COND-006 |
| REQ-COND-007 | When an expression is empty, the system shall evaluate to true only for an explicitly empty condition string. | TEST-COND-007 |
| REQ-COND-008 | If operand types of an ordering comparison are not both numeric, then the system shall evaluate to false. | TEST-COND-008 |
| REQ-COND-009 | If a negated operand references a missing attribute (e.g. `!(a.b == 1)`), then the system shall evaluate the whole condition to false (fail closed), not true. | TEST-COND-009 |

## Design
- `Lexer` -> tokens; `Parser` (recursive descent) -> AST arrays; `Evaluator` walks AST with context; `Condition::evaluate(expr, ctx)` facade.
- Fail-closed: any missing attribute or type mismatch makes the leaf false; `!` applies after, so `!(missing == 1)` is true (documented risk).
- Paths are dot-separated lookups in nested arrays.
## Assumptions / risks: negation of missing leaf is tested by TEST-COND-005 (only `!=` form).
