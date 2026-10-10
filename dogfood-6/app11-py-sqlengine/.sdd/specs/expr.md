---
feature: expr
tier: T2
approval: auto
---
# expr
Goal: evaluate AST expressions over a row with SQL NULL three-valued logic (TRUE/FALSE/UNKNOWN=None). Non-goals: aggregates (executor), subqueries, implicit casts between text and numbers.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXP-001 | When an arithmetic operator (`+ - * / %`, unary `-`) has a NULL operand, the evaluator shall return NULL. | TEST-EXP-001 |
| REQ-EXP-002 | When both operands of `/` or `%` are ints, the evaluator shall truncate toward zero (remainder takes the dividend's sign); if the divisor is zero, then it shall raise EvalError. | TEST-EXP-002 |
| REQ-EXP-003 | When comparing, the evaluator shall return NULL if either side is NULL, compare int and float numerically, and raise EvalError for incomparable types (number vs text, bool vs number). | TEST-EXP-003 |
| REQ-EXP-004 | The evaluator shall implement AND by the Kleene truth table (FALSE dominates UNKNOWN). | TEST-EXP-004 |
| REQ-EXP-005 | The evaluator shall implement OR by the Kleene truth table (TRUE dominates UNKNOWN). | TEST-EXP-005 |
| REQ-EXP-006 | When NOT is applied, the evaluator shall return NULL for NULL and the negation otherwise; a non-boolean operand of AND/OR/NOT shall raise EvalError. | TEST-EXP-006 |
| REQ-EXP-007 | When IS [NOT] NULL is evaluated, the evaluator shall return TRUE/FALSE and never NULL. | TEST-EXP-007 |
| REQ-EXP-008 | When `x [NOT] IN (list)` is evaluated, the evaluator shall return TRUE on a match, otherwise NULL if x or any list item is NULL, otherwise FALSE; NOT IN is the 3VL negation. | TEST-EXP-008 |
| REQ-EXP-009 | When `x [NOT] BETWEEN lo AND hi` is evaluated, the evaluator shall give `x >= lo AND x <= hi` under 3VL (negated for NOT). | TEST-EXP-009 |
| REQ-EXP-010 | When LIKE is evaluated, the evaluator shall match the whole string with `%` (any run) and `_` (one char), treat other characters literally (including regex metacharacters), and return NULL if either side is NULL. | TEST-EXP-010 |
| REQ-EXP-011 | When `\|\|` is evaluated, the evaluator shall concatenate two texts, return NULL if either is NULL, and raise EvalError for non-text. | TEST-EXP-011 |
| REQ-EXP-012 | When a column is resolved against a Scope, the evaluator shall match qualified names by (table, column) and unqualified names case-insensitively, and raise EvalError for unknown or ambiguous names. | TEST-EXP-012 |
| REQ-EXP-013 | The evaluator shall provide UPPER, LOWER, LENGTH, ABS, NULLIF and COALESCE; all but COALESCE return NULL for a NULL argument; unknown function names or wrong arity raise EvalError. | TEST-EXP-013 |
| REQ-EXP-014 | When AND/OR can be decided by its left operand (FALSE AND .., TRUE OR ..), the evaluator shall not evaluate the right operand; `is_true` shall hold only for the value True. | TEST-EXP-014 |

## Design
Components: `expr.py` with `Scope` (ordered `(table, name)` pairs, `resolve`), `evaluate(node, scope, row)`, 3VL helpers `and3/or3/not3`, `like_match`, `is_true`, `EvalError`.

Kleene truth table (rows = left, cols = right; U = NULL):

| AND | T | F | U |
| --- | --- | --- | --- |
| T | T | F | U |
| F | F | F | F |
| U | U | F | U |

| OR | T | F | U |
| --- | --- | --- | --- |
| T | T | T | T |
| F | T | F | U |
| U | T | U | U |

Invariants: result of a predicate is exactly one of True/False/None; None is the only NULL representation; bool is never a number (`isinstance(True,int)` guarded); evaluation is pure (no row mutation); `evaluate` raises only EvalError.
`x NOT IN (..)` = `NOT (x IN (..))`, so `1 NOT IN (2, NULL)` is UNKNOWN; short-circuit makes error behaviour order-dependent for AND/OR, which planner conjunct reordering must keep in mind.

## Assumptions / risks
Float `NaN` is not produced by any operator (division by zero raises). Resolved columns are looked up by linear scan of the Scope (small N).
