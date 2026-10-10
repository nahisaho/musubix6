---
feature: storage
tier: T2
approval: auto
---
# Storage
Goal: immutable columnar tables with conservative block pruning. Non-goals: transactions and disk IO.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STO-001 | When a table is built, the engine shall compress equal-length named columns with a positive block size. | TEST-STO-001 |
| REQ-STO-002 | When scanning a column, the engine shall return decoded values or selected positions in order. | TEST-STO-002 |
| REQ-STO-003 | When rows are appended, the engine shall return a new table and preserve the original. | TEST-STO-003 |
| REQ-STO-004 | When a snapshot is requested, the engine shall expose an immutable independently safe view. | TEST-STO-004 |
| REQ-STO-005 | If column lengths, schema or block size are invalid, then the engine shall reject the table. | TEST-STO-005 |
| REQ-STO-006 | When zone maps are computed, the engine shall record nonnull min/max and null count for each block. | TEST-STO-006 |
| REQ-STO-007 | When equality pruning is requested, the engine shall retain every block that can contain the target, including nulls. | TEST-STO-007 |
| REQ-STO-008 | When rows are materialized, the engine shall preserve column order and row multiplicity. | TEST-STO-008 |
| REQ-STO-009 | When any source block contains NaN, the engine shall record unordered NaN bounds and conservatively retain its block during equality pruning. | TEST-STO-009 |
## Design
Frozen Table holds read-only named tuple payloads; append constructs a replacement.
Zone maps exclude nulls from bounds and track null counts; prune is conservative, never a residual filter.
## Assumptions / risks
Spike validates MappingProxyType rejects mutation and all-null bounds are represented by None.
