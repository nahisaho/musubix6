---
feature: registry
tier: T2
approval: auto
---
# registry
Goal: Avro-like registry; non-goals: Apache Avro wire interoperability, named references, persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REGISTRY-001 | When using registry, the system shall register versions with monotonically allocated global IDs. | TEST-REGISTRY-001 |
| REQ-REGISTRY-002 | When using registry, the system shall deduplicate schemas per subject without creating versions. | TEST-REGISTRY-002 |
| REQ-REGISTRY-003 | When using registry, the system shall reject incompatible writes atomically. | TEST-REGISTRY-003 |
| REQ-REGISTRY-004 | When using registry, the system shall configure and enforce subject compatibility modes. | TEST-REGISTRY-004 |
| REQ-REGISTRY-005 | When using registry, the system shall return isolated schema snapshots from all read APIs. | TEST-REGISTRY-005 |
| REQ-REGISTRY-006 | When using registry, the system shall support latest explicit versions and informative unknown errors. | TEST-REGISTRY-006 |
| REQ-REGISTRY-007 | When using registry, the system shall enforce optimistic expected-version conflicts before deduplication. | TEST-REGISTRY-007 |
| REQ-REGISTRY-008 | When using registry, the system shall validate subject names and preserve case-sensitive isolation. | TEST-REGISTRY-008 |
## Design
Schema AST flows through validation, compatibility, registry, codec and migration workspaces.
Pure recursive resolution; synchronous atomic in-memory registry; JSON fingerprint envelope, not Avro binary.
## Assumptions / risks
Node 24 executes erasable TypeScript directly; spike verifies TS imports and byte round trips.
No remote IO or destructive operations. Depth is bounded at 64; union defaults use first branch.
Record names and aliases use simple identifiers; int/long use safe JS numbers.
