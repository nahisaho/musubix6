---
feature: planner
tier: T2
approval: auto
---
# planner
Goal: bind a parsed SELECT against the catalog and build a logical plan with predicate pushdown, constant folding and join-strategy selection. Non-goals: cost-based ordering, subqueries, index use.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLN-001 | When a SELECT is planned, the planner shall stack nodes bottom-up as Scan/Join (left-deep) -> Filter(WHERE) -> Aggregate -> Filter(HAVING) -> Sort -> Project -> Distinct -> Limit, omitting nodes the query does not need. | TEST-PLN-001 |
| REQ-PLN-002 | If a table is unknown, an alias/table name repeats (case-insensitive), or a column is unknown or ambiguous, then the planner shall raise PlanError. | TEST-PLN-002 |
| REQ-PLN-003 | The planner shall provide `split_conjuncts` (flatten nested AND, left-to-right) and `conjoin` (left-nested AND; empty -> None). | TEST-PLN-003 |
| REQ-PLN-004 | When optimizing, the planner shall push each WHERE conjunct that references only one input table to a Filter directly above that table's Scan, unless the table is on the null-supplying side of a LEFT JOIN. | TEST-PLN-004 |
| REQ-PLN-005 | When optimizing, the planner shall merge a WHERE conjunct that references several tables into the condition of the lowest INNER/CROSS join that has all of them (a CROSS join becomes INNER); otherwise it shall stay in a Filter above the joins. | TEST-PLN-005 |
| REQ-PLN-006 | For a LEFT JOIN, the planner shall never move a WHERE conjunct that references the right side below the join, and shall push ON conjuncts that reference only the right side down to the right Scan while keeping all other ON conjuncts in the join. | TEST-PLN-006 |
| REQ-PLN-007 | When optimizing, the planner shall fold literal-only subexpressions that evaluate without error, drop conjuncts that fold to TRUE, and leave erroring ones (e.g. `1/0`) untouched. | TEST-PLN-007 |
| REQ-PLN-008 | If an aggregate appears in WHERE, ON or GROUP BY, or a select/HAVING/ORDER BY column is neither grouped nor inside an aggregate, then the planner shall raise PlanError. | TEST-PLN-008 |
| REQ-PLN-009 | When a join condition contains conjuncts `l = r` with one side over only the left input and the other over only the right input, the planner shall choose a hash strategy with those keys and keep the other conjuncts as residual; otherwise nested (CROSS: cross). | TEST-PLN-009 |
| REQ-PLN-010 | When `*` or `t.*` is planned, the planner shall expand it into the table columns in declaration order; output names are alias, else the column name, else the lower-cased function name, else `?column?`. | TEST-PLN-010 |
| REQ-PLN-011 | When ORDER BY names an output alias or an integer ordinal, the planner shall substitute the select expression; an out-of-range ordinal raises PlanError. | TEST-PLN-011 |
| REQ-PLN-012 | The planner shall render a plan deterministically with `explain`, one node per line, children indented two spaces. | TEST-PLN-012 |
| REQ-PLN-013 | When binding, the planner shall rewrite every column reference to its canonical `(alias, declared column name)` form, so `E.Dept`, `dept` and `e.dept` are the same grouping key. | TEST-PLN-013 |

## Design
Components: `plan.py` (frozen node dataclasses Scan, OneRow, Filter, Join, Aggregate, Sort, Project, Distinct, Limit), `planner.py` (`plan(select, catalog, optimize=True)`, `explain`, `split_conjuncts`, `conjoin`, `fold`, bind/rewrite helpers).

Pipeline: bind (resolve tables/aliases, canonicalise columns, expand stars, resolve ORDER BY alias/ordinal) -> collect aggregates (rewrite to synthetic columns `$agg<i>`, grouped expressions to `$gk<i>`; leftover real columns = error) -> build join tree -> place conjuncts (optimize only) -> wrap upper nodes.

Pushdown placement table (conjunct P of WHERE; N = tables referenced; nullable = on the right side of some LEFT JOIN):

| N | any table nullable? | placement |
| --- | --- | --- |
| empty | - | Filter above all joins (constants stay put) |
| one table | no | Filter directly above its Scan |
| one table | yes | Filter above all joins |
| several | all present first at INNER/CROSS join J | merged into J.cond (CROSS->INNER) |
| several | first complete at a LEFT join | Filter above all joins |

LEFT JOIN ON conjuncts: right-only -> Filter above right Scan; all others stay in cond. ON conjuncts of INNER/CROSS joins are pooled with the WHERE conjuncts and placed by the same table. Join keys are expressions over exactly one side; residual = remaining conjuncts.
Invariants: (I1) optimize=True and optimize=False plans return identical multisets of rows for the same data; (I2) no conjunct moves below a LEFT JOIN toward its right side from WHERE; (I3) column refs in a bound plan are all qualified (except synthetic `$` names); (I4) every plan node's output scope is derivable from its children.

## Assumptions / risks
Pushdown can change which row triggers a runtime error (e.g. `a > 0 AND 10 / a > 1` after reordering): accepted, documented; evaluation stays left-to-right within a conjunction. Join order is the FROM order (no reordering). Retired by the executor differential test (EXE-013).
