---
feature: executor
tier: T2
approval: auto
---
# executor
Goal: execute plans (scan, filter, hash/nested-loop joins, group-by, aggregates, sort, distinct, limit) with SQL NULL semantics through an `Engine` facade. Non-goals: transactions, persistence, subqueries, parallelism.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXE-001 | When CREATE TABLE or INSERT is executed, the engine shall change the catalog and return a Result with no columns and `rowcount` = rows inserted (0 for CREATE); INSERT values are evaluated expressions without column references. | TEST-EXE-001 |
| REQ-EXE-002 | When a WHERE or HAVING predicate evaluates to FALSE or NULL for a row, the engine shall drop the row; only TRUE keeps it. | TEST-EXE-002 |
| REQ-EXE-003 | When an INNER join is executed, the engine shall return the same rows for hash and nested-loop strategies, never match NULL keys, and compare int and float keys by value. | TEST-EXE-003 |
| REQ-EXE-004 | When a LEFT join is executed, the engine shall emit every left row at least once, padding right columns with NULL when no right row satisfies the full ON condition (including residual conditions). | TEST-EXE-004 |
| REQ-EXE-005 | When a CROSS join or comma list is executed, the engine shall return the cartesian product in left-major order; a SELECT without FROM shall produce exactly one row. | TEST-EXE-005 |
| REQ-EXE-006 | When GROUP BY is executed, the engine shall form one group per distinct key tuple with NULL equal to NULL, emit groups in first-appearance order, and allow grouping by expressions. | TEST-EXE-006 |
| REQ-EXE-007 | The engine shall implement COUNT(*), COUNT(x), SUM, AVG, MIN, MAX ignoring NULL inputs; SUM of ints is an int, AVG is a float, SUM/AVG/MIN/MAX over no non-NULL input are NULL and COUNT is 0; SUM/AVG of non-numbers raise EvalError. | TEST-EXE-007 |
| REQ-EXE-008 | When an aggregate query has no GROUP BY, the engine shall emit exactly one row even for empty input; with GROUP BY and empty input it shall emit no rows. | TEST-EXE-008 |
| REQ-EXE-009 | When an expression combines aggregates and group keys (`SUM(a) / COUNT(*)`, `k + 1`), the engine shall evaluate it per group; HAVING may use aggregates not present in the select list. | TEST-EXE-009 |
| REQ-EXE-010 | When ORDER BY is executed, the engine shall sort stably by the keys in order, NULLs first for ASC and last for DESC, comparing numbers by value, and raise EvalError for incomparable mixed types. | TEST-EXE-010 |
| REQ-EXE-011 | When LIMIT n [OFFSET m] is executed, the engine shall skip m rows and return at most n rows; OFFSET past the end gives no rows. | TEST-EXE-011 |
| REQ-EXE-012 | When DISTINCT is executed, the engine shall keep the first occurrence of each row, treating NULLs as equal and numbers by value. | TEST-EXE-012 |
| REQ-EXE-013 | When COUNT(DISTINCT x) / SUM(DISTINCT x) is executed, the engine shall consider each distinct non-NULL value once. | TEST-EXE-013 |
| REQ-EXE-014 | For any query and data, the engine shall return the same multiset of rows (same order when ORDER BY is a total order) with optimization on or off and with hash or forced nested-loop joins. | TEST-EXE-014 |
| REQ-EXE-015 | If lexing, parsing, planning, catalog access or evaluation fails, then the engine shall raise an exception that is an instance of SqlError. | TEST-EXE-015 |

## Design
Components: `executor.py` (`execute_plan(node, ctx)` returning `(scope, rows)` per node type; hash join, nested-loop join, grouping, aggregate accumulators, sort key builder), `engine.py` (`Engine(optimize=True, join_strategy=None)`, `execute(sql) -> Result`, `Result(columns, rows, rowcount)`), `errors.py` (`SqlError` base of LexError/ParseError/CatalogError/EvalError/PlanError).

Per-node row contract: every operator is a function rows -> rows (lists of tuples); no operator mutates its input; scope (column order) of a node's output is `plan.output_scope(node)`.

NULL handling table:

| operation | NULL behaviour |
| --- | --- |
| Filter / HAVING | row kept only if predicate is True |
| hash join key | any NULL key component -> row never matches (inner) / padded (left) |
| GROUP BY / DISTINCT key | NULL is its own equal group |
| COUNT(*) | counts rows; COUNT(x) skips NULL |
| SUM/AVG/MIN/MAX | skip NULL; all-NULL/empty -> NULL |
| ORDER BY ASC / DESC | NULL smallest: first / last |

Aggregate accumulator states: `empty` (no non-NULL seen) -> `has-values` (running value). Invariants: (I1) LEFT join output count >= left input count; (I2) group order = first appearance; (I3) hash and nested joins agree on any input (property-tested); (I4) Sort is stable (Python `sorted` + per-key passes, last key first); (I5) results never alias catalog row storage mutably (rows are tuples).

## Assumptions / risks
Python equality conflates `1`, `1.0` (intended) and `True` (not intended): key normalisation must be type-aware. Retired by TEST-EXE-014 (randomised mixed data) and focused bug tests.
