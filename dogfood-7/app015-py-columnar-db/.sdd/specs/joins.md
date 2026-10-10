---
feature: joins
tier: T2
approval: auto
---
# Joins
Goal: correct bag-semantic equijoins. Non-goals: non-equijoins and ambiguous output names.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-JOIN-001 | When hash join runs, the engine shall emit the duplicate-key Cartesian product with SQL-null nonmatching keys. | TEST-JOIN-001 |
| REQ-JOIN-002 | When sort-merge join runs, the engine shall sort inputs and emit the same bag as hash join. | TEST-JOIN-002 |
| REQ-JOIN-003 | When semi join runs, the engine shall emit each matching left row exactly once. | TEST-JOIN-003 |
| REQ-JOIN-004 | When anti join runs, the engine shall emit each unmatched left row including null keys. | TEST-JOIN-004 |
| REQ-JOIN-005 | When left join runs, the engine shall null-extend unmatched left rows and preserve duplicate matches. | TEST-JOIN-005 |
| REQ-JOIN-006 | When join strategy is selected, the engine shall prefer merge for sorted inputs or hash otherwise and expose estimated work. | TEST-JOIN-006 |
| REQ-JOIN-007 | If join keys are absent or have different arity, then the engine shall reject the join before executing. | TEST-JOIN-007 |
| REQ-JOIN-008 | When join cardinality is counted, the engine shall return the exact number without materializing joined rows. | TEST-JOIN-008 |
## Design
Keys are nonempty tuples of column names; any null component never matches.
Output columns are l.<name> and r.<name>; hash buckets and merge duplicate runs preserve bag semantics.
## Assumptions / risks
Spike compares duplicate-run products and empty-input joins; rows contain homogeneous comparable scalar keys.
