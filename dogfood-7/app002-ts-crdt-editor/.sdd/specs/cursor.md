---
feature: cursor
tier: T2
approval: auto
---
# Anchored cursor transforms
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CURSOR-001 | When a cursor is captured, it shall retain adjacent stable IDs and left/right affinity at code-point indexes. | TEST-CURSOR-001 |
| REQ-CURSOR-002 | When text is inserted in its gap, a left-affinity cursor shall stay before the new text. | TEST-CURSOR-002 |
| REQ-CURSOR-003 | When text is inserted in its gap, a right-affinity cursor shall move after the new text. | TEST-CURSOR-003 |
| REQ-CURSOR-004 | When anchor nodes are hidden, resolve shall use retained tombstone order to return a valid visible index. | TEST-CURSOR-004 |
| REQ-CURSOR-005 | When start/end cursors transform, boundary affinity shall remain consistent even on an empty sequence. | TEST-CURSOR-005 |
| REQ-CURSOR-006 | When a selection transforms, it shall preserve direction and independently transform both endpoints. | TEST-CURSOR-006 |
| REQ-CURSOR-007 | If offsets, affinity or foreign anchor IDs are invalid, cursor APIs shall reject without changing document state. | TEST-CURSOR-007 |
| REQ-CURSOR-008 | When replicas converge after concurrent changes and undo, identical anchors shall resolve to identical positions. | TEST-CURSOR-008 |
## Design
Cursor is immutable {left,right,affinity}; null is a boundary. RGA retains hidden nodes and exposes total traversal order.
Left affinity counts visible nodes through the left anchor; right affinity counts visible nodes before the right anchor.
Selections carry anchor/focus separately; index bounds are code points, not UTF-16 offsets.
## Assumptions
Cursors transfer only after their anchor nodes have arrived; missing foreign anchors reject rather than silently clamp.
No grapheme segmentation; the spike distinguishes astral characters and tests a boundary model.
