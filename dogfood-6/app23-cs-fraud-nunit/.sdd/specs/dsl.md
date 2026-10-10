---
feature: dsl
tier: T1
---
# dsl
Goal: parse and evaluate the fraud rule DSL (`rule NAME weight N when EXPR`).   Non-goals: type inference, rule optimisation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DSL-001 | When lexing, the Lexer shall produce number (incl. decimals), identifier, string, operator tokens each with a 1-based line and column. | TEST-DSL-001 |
| REQ-DSL-002 | If a string literal is unterminated, then the Lexer shall throw DslException carrying the line and column of the opening quote. | TEST-DSL-002 |
| REQ-DSL-003 | When parsing, the Parser shall apply precedence (tightest first) arithmetic `*` `/` > `+` `-` > comparison/`in` > not > and > or. | TEST-DSL-003 |
| REQ-DSL-004 | When parentheses are present, the Parser shall let them override precedence. | TEST-DSL-004 |
| REQ-DSL-005 | When parsing a `rule NAME weight N when EXPR` declaration, the Parser shall return a Rule with name, signed integer weight and expression. | TEST-DSL-005 |
| REQ-DSL-006 | When a rule set has two rules with the same name (case-insensitive), the Parser shall throw DslException. | TEST-DSL-006 |
| REQ-DSL-007 | When evaluating, the Evaluator shall compare numbers numerically and strings by ordinal equality. | TEST-DSL-007 |
| REQ-DSL-008 | When `x in [a, b, ...]` is evaluated, the Evaluator shall return true iff x equals one list element. | TEST-DSL-008 |
| REQ-DSL-009 | If a division by zero is evaluated, then the Evaluator shall throw EvalException "division by zero". | TEST-DSL-009 |
| REQ-DSL-010 | While a field is missing from the context, the Evaluator shall treat it as null: ordered comparisons with null are false, `== null` is true. | TEST-DSL-010 |
| REQ-DSL-011 | When a number is directly followed by s/m/h/d, the Lexer shall produce a duration literal worth that many seconds/minutes/hours/days. | TEST-DSL-011 |
| REQ-DSL-012 | When a call `f(args)` is evaluated, the Evaluator shall delegate to the function resolver; if it does not know f, then it shall throw EvalException naming f. | TEST-DSL-012 |
| REQ-DSL-013 | When durations are added or subtracted, or a duration is multiplied by a number, the Evaluator shall return a duration; dividing by zero or adding a duration to a number shall throw EvalException. | TEST-DSL-013 |

## Assumptions / risks: weights are int, `-` unary supported only on number literals.
