---
feature: navigation
tier: T2
approval: auto
---
# Definition and rename
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NAV-001 | When definition is requested on a bound reference, the server shall return its declaration range. | TEST-NAV-001 |
| REQ-NAV-002 | If a cursor is outside a bound identifier, definition shall return null. | TEST-NAV-002 |
| REQ-NAV-003 | When renaming a declaration, the server shall edit its declaration and only bound references. | TEST-NAV-003 |
| REQ-NAV-004 | If a new name is invalid or reserved, rename shall reject without changes. | TEST-NAV-004 |
| REQ-NAV-005 | If renaming captures a reference or collides with a declaration, rename shall reject. | TEST-NAV-005 |
| REQ-NAV-006 | If a rename version is stale, the server shall reject without changes. | TEST-NAV-006 |
| REQ-NAV-007 | When applying a rename edit, the server shall commit all descending edits at a new version. | TEST-NAV-007 |
| REQ-NAV-008 | If rename is requested on an unresolved reference, the server shall return null. | TEST-NAV-008 |
## Design
Requests parse/analyze snapshots; rename returns a generation-and-version-guarded document workspace edit.
Simulate rename and compare each reference's binding identity after offset mapping to prevent capture.
## Assumptions
Single-document operations; identifiers use half-open offset ranges. No filesystem or transport side effects.
Workspace edits are applied by the text store as one transaction.
