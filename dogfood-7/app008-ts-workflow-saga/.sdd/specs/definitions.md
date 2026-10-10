---
feature: definitions
tier: T2
approval: auto
---
# Versioned definitions
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DEFINITIONS-001 | When a valid definition is registered, lookup shall return its exact version. | TEST-DEFINITIONS-001 |
| REQ-DEFINITIONS-002 | If a version is already registered, registration shall reject replacement. | TEST-DEFINITIONS-002 |
| REQ-DEFINITIONS-003 | When a version is omitted, lookup shall select the highest registered version. | TEST-DEFINITIONS-003 |
| REQ-DEFINITIONS-004 | If a workflow or version is unknown, lookup shall reject. | TEST-DEFINITIONS-004 |
| REQ-DEFINITIONS-005 | When caller-owned definitions are mutated, registered definitions shall remain unchanged. | TEST-DEFINITIONS-005 |
| REQ-DEFINITIONS-006 | If a definition has duplicate step identifiers, registration shall reject it. | TEST-DEFINITIONS-006 |
| REQ-DEFINITIONS-007 | If a name, version or command kind is invalid, registration shall reject it. | TEST-DEFINITIONS-007 |
| REQ-DEFINITIONS-008 | If retry bounds or timer durations are invalid, registration shall reject them. | TEST-DEFINITIONS-008 |
| REQ-DEFINITIONS-009 | When equivalent definitions are hashed, their digest shall be stable across JSON property order. | TEST-DEFINITIONS-009 |
| REQ-DEFINITIONS-010 | When a definition changes semantically, its digest shall change. | TEST-DEFINITIONS-010 |
## Design
Registry owns defensive snapshots of data-only sequential commands: activity, timer, signal.
Explicit versions are positive integers; no replacement. Runtime stores the chosen version and canonical digest.
## Assumptions
No arbitrary workflow closures: declarative commands remove nondeterministic Date/random/IO during replay.
JSON canonicalization and digest equality were exercised in the spike; initial workflows can have zero steps.
