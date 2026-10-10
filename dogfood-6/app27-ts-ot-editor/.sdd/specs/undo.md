---
feature: undo
tier: T2
approval: auto
---
# undo
Goal: per-user undo/redo stacks that stay valid while remote ops arrive.  Non-goals: persistence.  Depends: ops.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-UNDO-001 | When record(op, docBefore) is called, the system shall push invert(op, docBefore) and clear the redo stack. | TEST-UNDO-001 |
| REQ-UNDO-002 | When undo(doc) is called, the system shall pop and return the inverse op and push its inverse on the redo stack. | TEST-UNDO-002 |
| REQ-UNDO-003 | If undo or redo is called on an empty stack, then the system shall return null. | TEST-UNDO-003 |
| REQ-UNDO-004 | When redo(doc) is called after undo, the system shall return an op that re-applies the undone edit. | TEST-UNDO-004 |
| REQ-UNDO-005 | When remote(op) is called, the system shall transform every undo entry so that undoing still removes only the local text (remote text survives). | TEST-UNDO-005 |
| REQ-UNDO-006 | When an undo entry becomes a no-op after transformation, the system shall drop it. | TEST-UNDO-006 |
| REQ-UNDO-007 | When record is called with merge:true and an undo entry exists, the system shall compose it into one undo step. | TEST-UNDO-007 |
| REQ-UNDO-008 | While the undo stack holds capacity entries, record shall drop the oldest. | TEST-UNDO-008 |
| REQ-UNDO-009 | When remote(op) is called, the system shall transform the redo stack as well. | TEST-UNDO-009 |
| REQ-UNDO-010 | The system shall expose canUndo, canRedo and clear(). | TEST-UNDO-010 |

## Design
Stacks hold ops already based on the *current* document (top entry) and on the doc after the entry above it (next entry), i.e. each entry is relative to the result of applying the entries above it.
| Event | undo stack | redo stack |
| --- | --- | --- |
| record | push inv | clear |
| undo | pop; | push invert(popped, doc) |
| redo | push invert(popped, doc) | pop |
| remote(r) | top->bottom: [e2,r]=transform(e,r) (r becomes r') | same |
Invariant: top entry baseLength == current doc length; no-op entries never stored; stack size <= capacity.
Merge: new inverse is composed as compose(newInv, topInv) so one undo reverts both edits.
## Assumptions / risks
Inverse ties: transform(e, r) puts the local entry first; accepted since undo text deletion is order independent.
