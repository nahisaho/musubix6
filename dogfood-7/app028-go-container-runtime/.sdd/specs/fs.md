---
feature: fs
tier: T2
approval: auto
---
# Overlay filesystem
Goal: in-memory overlay semantics. Non-goals: directories, symlinks and host mounts.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FS-001 | When files overlap, reads shall choose the highest layer. | TEST-FS-001 |
| REQ-FS-002 | When reading data, the filesystem shall return a copy. | TEST-FS-001 |
| REQ-FS-003 | When writing data, the filesystem shall copy the input into the upper layer. | TEST-FS-001 |
| REQ-FS-004 | When removing a lower file, the filesystem shall install a whiteout. | TEST-FS-001 |
| REQ-FS-005 | When writing or removing, the filesystem shall leave lower layers unchanged. | TEST-FS-001 |
| REQ-FS-006 | When listing files, the filesystem shall return sorted visible names. | TEST-FS-001 |
| REQ-FS-007 | If a path is relative, contains parent traversal or NUL, the filesystem shall reject it. | TEST-FS-001 |
| REQ-FS-008 | When no layers exist, writes shall create an upper layer and missing reads shall fail. | TEST-FS-001 |
## Design
Layers are oldest-first maps; entries contain bytes or whiteout flags.
Construction snapshots caller layers; only the final layer is writable. Operations are serialized.
## Assumptions / risks
POSIX absolute paths only. No directory opacity support. Race checks exercise shared accounting independently.
