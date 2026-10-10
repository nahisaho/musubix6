---
feature: snap
tier: T2
approval: auto
---
# Checkpoints
Goal: portable, validated in-memory runtime snapshots.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SNAP-001 | While running or deleted, or while created or stopped with nonzero usage, a container shall reject checkpointing. | TEST-SNAP-001 |
| REQ-SNAP-002 | When a paused container is restored, its ID and paused state shall be preserved. | TEST-SNAP-001 |
| REQ-SNAP-003 | When restored, a checkpoint shall preserve visible file bytes. | TEST-SNAP-001 |
| REQ-SNAP-004 | When restored, a checkpoint shall preserve charged usage and configured limits. | TEST-SNAP-001 |
| REQ-SNAP-005 | When restored files are changed, the original container shall remain unchanged. | TEST-SNAP-001 |
| REQ-SNAP-006 | When resumed after restore, a paused container shall enter running state. | TEST-SNAP-001 |
| REQ-SNAP-007 | If checkpoint JSON is invalid, incomplete or has trailing data, restoration shall reject it. | TEST-SNAP-001 |
| REQ-SNAP-008 | When restoring, the runtime shall validate schema version, OCI spec, state, usage and filesystem paths. | TEST-SNAP-001 |
## Design
Versioned JSON envelope contains OCI spec, state, usage and flattened visible files.
Restore constructs independent objects and charges usage through normal cgroup validation.
## Assumptions / risks
Checkpoint API requires a quiescent caller; no concurrent direct field mutation or FS mutation during Save.
