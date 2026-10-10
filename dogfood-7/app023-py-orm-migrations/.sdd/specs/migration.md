---
feature: migration
tier: T2
approval: auto
---
# Schema migrations
Goal: Deterministic schema diff and safe SQLite migration plans.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MIGRATION-001 | When a model schema is extracted, the system shall preserve type and nullability. | TEST-MIGRATION-001 |
| REQ-MIGRATION-002 | When a table is new, the system shall emit a deterministic CREATE TABLE. | TEST-MIGRATION-002 |
| REQ-MIGRATION-003 | When a nullable column is new, the system shall emit ADD COLUMN. | TEST-MIGRATION-003 |
| REQ-MIGRATION-004 | When a table is dropped, the system shall mark the plan destructive and refuse apply by default. | TEST-MIGRATION-004 |
| REQ-MIGRATION-005 | When a column changes type or is dropped, the system shall reject unsupported rebuilds. | TEST-MIGRATION-005 |
| REQ-MIGRATION-006 | When schemas are identical, the system shall return an empty plan. | TEST-MIGRATION-006 |
| REQ-MIGRATION-007 | When an allowed plan is applied, the system shall execute all statements atomically. | TEST-MIGRATION-007 |
| REQ-MIGRATION-008 | When a new NOT NULL column lacks a default, the system shall reject the unsafe addition. | TEST-MIGRATION-008 |
| REQ-MIGRATION-009 | When the connection uses autocommit mode, the system shall close successful or failed plan transactions atomically. | TEST-MIGRATION-009 |
## Design
Schema and Column are immutable; diff orders tables lexically and fields by declaration.
Apply uses one transaction and never executes destructive plans unless explicitly allowed.
## Assumptions / risks
SQLite transactional DDL is proven by the spike. Application use here is entirely in-memory.
Renames and rebuilds are deliberately rejected; no heuristic rename inference.
