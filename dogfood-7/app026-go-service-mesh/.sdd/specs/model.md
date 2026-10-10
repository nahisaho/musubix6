---
feature: model
tier: T2
approval: auto
---
# Mesh resource contracts
Goal: validated copy-safe endpoint snapshots. Non-goals: network transport, credentials.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MODEL-001 | When an endpoint with nonempty ID/address and positive weight is validated, the system shall accept it. | TEST-MODEL-001 |
| REQ-MODEL-002 | If an endpoint ID is empty, the system shall reject it. | TEST-MODEL-001 |
| REQ-MODEL-003 | If an address is empty, the system shall reject it. | TEST-MODEL-002 |
| REQ-MODEL-004 | If weight is nonpositive, the system shall reject it. | TEST-MODEL-002 |
| REQ-MODEL-005 | If endpoint IDs repeat, the system shall reject the snapshot. | TEST-MODEL-003 |
| REQ-MODEL-006 | If a snapshot version is zero, the system shall reject it. | TEST-MODEL-003 |
| REQ-MODEL-007 | When a snapshot is cloned, the system shall copy endpoint storage. | TEST-MODEL-004 |
| REQ-MODEL-008 | When a snapshot is cloned, the system shall copy metadata maps. | TEST-MODEL-004 |
| REQ-MODEL-009 | When selecting eligible endpoints, the system shall omit unhealthy endpoints. | TEST-MODEL-005 |
| REQ-MODEL-010 | When selecting eligible endpoints, the system shall retain input order. | TEST-MODEL-005 |
## Design
The root mesh package owns Endpoint and Snapshot; consumers only receive clones.
Validation is atomic and permits empty endpoint sets to represent draining.
## Assumptions / risks
Go 1.26 supports modules and standard-library tests (runtime spike).
Map and slice copies must be deep enough for string-valued metadata; deterministic ordering is explicit.
Fake integer millisecond time avoids flaky timing; race checks cover shared consumers.
