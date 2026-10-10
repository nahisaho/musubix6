---
feature: operators
tier: T2
approval: auto
---
# Operators
Goal: composable vectorized row-position operations. Non-goals: arbitrary executable expressions.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OPS-001 | When selection runs, the engine shall return stable positions satisfying the predicate. | TEST-OPS-001 |
| REQ-OPS-002 | When projection runs, the engine shall return only requested columns at selected positions. | TEST-OPS-002 |
| REQ-OPS-003 | When predicates are evaluated, the engine shall support eq/ne/lt/le/gt/ge/isnull and reject unknown operators. | TEST-OPS-003 |
| REQ-OPS-004 | When aggregate runs, the engine shall ignore nulls for sum/min/max/avg and distinguish count from count_all. | TEST-OPS-004 |
| REQ-OPS-005 | When grouping runs, the engine shall preserve first-seen groups including null keys. | TEST-OPS-005 |
| REQ-OPS-006 | When sorting runs, the engine shall produce stable ascending or descending rows with nulls last. | TEST-OPS-006 |
| REQ-OPS-007 | When limiting rows, the engine shall honor nonnegative offset/count and reject negative inputs. | TEST-OPS-007 |
| REQ-OPS-008 | When distinct runs, the engine shall remove duplicate selected-key tuples while preserving first occurrences. | TEST-OPS-008 |
## Design
Predicates use fixed opcodes: eq/ne use Python equality (None equals only None); ordering with either null is false; isnull ignores its RHS.
count counts nonnulls; count_all counts all rows; empty sum/count/count_all are zero, empty min/max/avg are None; unknown aggregates raise ValueError.
Operators consume vectors or materialized dictionaries; selection returns positions for late materialization.
## Assumptions / risks
Spike covers empty aggregates and stable reverse sorting with separately retained null rows.
