---
feature: compatibility
tier: T2
approval: auto
---
# compatibility
Goal: Avro-like compatibility; non-goals: Apache Avro wire interoperability, named references, persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMPATIBILITY-001 | When using compatibility, the system shall promote writer numerics only in the legal direction. | TEST-COMPATIBILITY-001 |
| REQ-COMPATIBILITY-002 | When using compatibility, the system shall allow reader added fields only with valid defaults. | TEST-COMPATIBILITY-002 |
| REQ-COMPATIBILITY-003 | When using compatibility, the system shall ignore writer fields absent from the reader. | TEST-COMPATIBILITY-003 |
| REQ-COMPATIBILITY-004 | When using compatibility, the system shall resolve reader field aliases and named record aliases. | TEST-COMPATIBILITY-004 |
| REQ-COMPATIBILITY-005 | When using compatibility, the system shall require every writer union branch to resolve. | TEST-COMPATIBILITY-005 |
| REQ-COMPATIBILITY-006 | When using compatibility, the system shall resolve enum symbols using reader enum default. | TEST-COMPATIBILITY-006 |
| REQ-COMPATIBILITY-007 | When using compatibility, the system shall apply backward forward full and none directions. | TEST-COMPATIBILITY-007 |
| REQ-COMPATIBILITY-008 | When using compatibility, the system shall check all history for transitive modes and reject invalid modes. | TEST-COMPATIBILITY-008 |
| REQ-COMPATIBILITY-009 (test-only) | When exposing compatibility modes, the system shall preserve the seven-mode direction and transitivity policy table. | TEST-COMPATIBILITY-009 |
## Design
Schema AST flows through validation, compatibility, registry, codec and migration workspaces.
Pure recursive resolution; synchronous atomic in-memory registry; JSON fingerprint envelope, not Avro binary.
Exact reader field names precede aliases; multiple alias matches without an exact match are incompatible.
## Assumptions / risks
Node 24 executes erasable TypeScript directly; spike verifies TS imports and byte round trips.
No remote IO or destructive operations. Depth is bounded at 64; union defaults use first branch.
Record names and aliases use simple identifiers; int/long use safe JS numbers.
