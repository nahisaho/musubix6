---
feature: cursor
tier: T1
approval: auto
---
# cursor
Goal: transform caret/selection positions through an op.  Non-goals: multi-range selections.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CURSOR-001 | When an insert lies strictly before a position, transformIndex shall shift the position right by the inserted length. | TEST-CURSOR-001 |
| REQ-CURSOR-002 | While an insert is exactly at the position, transformIndex shall move the position past the insert for bias "after" and keep it for bias "before". | TEST-CURSOR-002 |
| REQ-CURSOR-003 | When a delete lies entirely before a position, transformIndex shall shift the position left by the deleted length. | TEST-CURSOR-003 |
| REQ-CURSOR-004 | When a delete covers the position, transformIndex shall collapse the position to the start of the deletion. | TEST-CURSOR-004 |
| REQ-CURSOR-005 | If the position is negative, non-integer or greater than baseLength(op), then transformIndex shall throw RangeError. | TEST-CURSOR-005 |
| REQ-CURSOR-006 | When transformSelection is called, the system shall transform anchor and head independently and keep their order (direction). | TEST-CURSOR-006 |
| REQ-CURSOR-007 | When a delete covers both ends of a selection, transformSelection shall return a collapsed selection. | TEST-CURSOR-007 |
| REQ-CURSOR-008 | When transformCursors(map, op, owner) is called, the owner's cursor shall use bias "after" and every other cursor bias "before". | TEST-CURSOR-008 |
| REQ-CURSOR-009 | The result of transformIndex shall always lie within [0, targetLength(op)]. | TEST-CURSOR-009 |
