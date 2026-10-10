---
feature: migration
tier: T2
approval: auto
---
# migration
Goal: Avro-like migration; non-goals: Apache Avro wire interoperability, named references, persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MIGRATION-001 | When using migration, the system shall plan add default drop rename and promote operations. | TEST-MIGRATION-001 |
| REQ-MIGRATION-002 | When using migration, the system shall reject unsafe migrations lacking reader resolution. | TEST-MIGRATION-002 |
| REQ-MIGRATION-003 | When using migration, the system shall execute plans while preserving input immutability. | TEST-MIGRATION-003 |
| REQ-MIGRATION-004 | When using migration, the system shall include drop operations for obsolete writer fields. | TEST-MIGRATION-004 |
| REQ-MIGRATION-005 | When using migration, the system shall support nested record migration. | TEST-MIGRATION-005 |
| REQ-MIGRATION-006 | When using migration, the system shall produce deterministic auditable fingerprints. | TEST-MIGRATION-006 |
| REQ-MIGRATION-007 | When using migration, the system shall validate source data before applying migration. | TEST-MIGRATION-007 |
| REQ-MIGRATION-008 | When using migration, the system shall snapshot schemas so plans cannot follow caller mutation. | TEST-MIGRATION-008 |
## Design
Schema AST flows through validation, compatibility, registry, codec and migration workspaces.
Pure recursive resolution; synchronous atomic in-memory registry; JSON fingerprint envelope, not Avro binary.
## Assumptions / risks
Node 24 executes erasable TypeScript directly; spike verifies TS imports and byte round trips.
No remote IO or destructive operations. Depth is bounded at 64; union defaults use first branch.
Record names and aliases use simple identifiers; int/long use safe JS numbers.
