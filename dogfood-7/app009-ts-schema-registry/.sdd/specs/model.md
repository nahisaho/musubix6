---
feature: model
tier: T2
approval: auto
---
# model
Goal: Avro-like model; non-goals: Apache Avro wire interoperability, named references, persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MODEL-001 | When using model, the system shall validate primitives and named records. | TEST-MODEL-001 |
| REQ-MODEL-002 | When using model, the system shall reject unknown types and duplicate fields. | TEST-MODEL-002 |
| REQ-MODEL-003 | When using model, the system shall validate defaults against the first union branch. | TEST-MODEL-003 |
| REQ-MODEL-004 | When using model, the system shall canonicalize object key order without changing field order. | TEST-MODEL-004 |
| REQ-MODEL-005 | When using model, the system shall fingerprint schemas by canonical SHA256. | TEST-MODEL-005 |
| REQ-MODEL-006 | When using model, the system shall validate arrays maps and enum symbols. | TEST-MODEL-006 |
| REQ-MODEL-007 | When using model, the system shall validate datum including integer boundaries and finite floats. | TEST-MODEL-007 |
| REQ-MODEL-008 | When using model, the system shall bound schema depth and reject cyclic schemas. | TEST-MODEL-008 |
| REQ-MODEL-009 | When canonicalizing schemas, the system shall preserve arbitrary keys named doc inside default datum maps. | TEST-MODEL-009 |
| REQ-MODEL-010 | If schema unions, symbols or aliases contain missing indices, the system shall reject validation and registration without changing registry state. | TEST-MODEL-010 |
## Design
Schema AST flows through validation, compatibility, registry, codec and migration workspaces.
Pure recursive resolution; synchronous atomic in-memory registry; JSON fingerprint envelope, not Avro binary.
Canonicalization retains all semantic keys including defaults and aliases; only doc is omitted.
## Assumptions / risks
Node 24 executes erasable TypeScript directly; spike verifies TS imports and byte round trips.
No remote IO or destructive operations. Depth is bounded at 64; union defaults use first branch.
Record names and aliases use simple identifiers; int/long use safe JS numbers.
