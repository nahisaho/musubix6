---
feature: planner
tier: T2
approval: auto
---
# Planner
Goal: validated, inspectable executable plans. Non-goals: SQL text parsing.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-001 | When a query is planned, the engine shall emit scan/filter/project nodes in semantic order. | TEST-PLAN-001 |
| REQ-PLAN-002 | When a physical plan executes, the engine shall evaluate filters, projection, sorting and limit correctly. | TEST-PLAN-002 |
| REQ-PLAN-003 | When explain runs, the engine shall return deterministic nodes, estimates and selected blocks. | TEST-PLAN-003 |
| REQ-PLAN-004 | When equality filter optimization runs, the engine shall use zone maps and keep the residual predicate. | TEST-PLAN-004 |
| REQ-PLAN-005 | When estimating cardinality, the engine shall return bounded deterministic counts for filtered scans. | TEST-PLAN-005 |
| REQ-PLAN-006 | When a catalog is created, the engine shall isolate the mapping from later caller mutations. | TEST-PLAN-006 |
| REQ-PLAN-007 | If queries name unknown tables, columns, opcodes or invalid limits, then the engine shall reject them. | TEST-PLAN-007 |
| REQ-PLAN-008 | When a query batch executes, the engine shall return independent results including planned equijoins and grouped aggregates. | TEST-PLAN-008 |
| REQ-PLAN-009 | If a query has malformed field types, then the engine shall consistently reject it with ValueError before planning. | TEST-PLAN-009 |
| REQ-PLAN-010 | When a plan is shared, the engine shall reject all nested query and node container mutations with TypeError or AttributeError and detach caller aliases. | TEST-PLAN-010 |
| REQ-PLAN-011 | If a filter target is not a builtin immutable scalar or is incompatible with its column, then the engine shall reject it with ValueError before copying or comparison. | TEST-PLAN-011 |
## Design
Query fields: table (required), filters=[(column,op,value)], project=[column], sort=(column,descending), limit=(count,offset).
Optional join={table,left:[keys],right:[keys],how:inner|left|semi|anti}; group=[keys] and aggregates={alias:(op,column)} operate after filtering/join.
Execution order: scan/filter/join/group/sort/project/limit; results are lists of row dictionaries. Unknown fields and malformed shapes raise ValueError.
Frozen Plan stores validated deep-copied query and physical nodes; sorting may reference an unprojected column.
Targets accept exact None/bool/int/float/str/bytes only; numeric bool/int/float interoperate, other nonnull types must match all nonnull column values.
Null targets and isnull allow any accepted scalar; empty/all-null columns impose no additional compatibility restriction.
Catalog snapshots immutable tables; executor dispatches only known operators, applying residual filters after pruning.
## Assumptions / risks
Spike verifies deepcopy isolation; no query executes caller-provided code or mutates catalog tables.
