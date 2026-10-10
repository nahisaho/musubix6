---
feature: vdom
tier: T2
approval: auto
---
# vdom
Goal: deterministic reactive UI vdom. Non-goals: browser bundling, hydration, async effects.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VDOM-001 | When h is called, the virtual DOM shall flatten nested children and remove null or boolean children. | TEST-VDOM-001 |
| REQ-VDOM-002 | When scalar children are supplied, the virtual DOM shall normalize them to text nodes. | TEST-VDOM-002 |
| REQ-VDOM-003 | When a VNode is created, the virtual DOM shall snapshot props and children without mutating caller objects. | TEST-VDOM-003 |
| REQ-VDOM-004 | When text changes, diff shall emit a text patch. | TEST-VDOM-004 |
| REQ-VDOM-005 | When a node type or key changes, diff shall emit a replacement patch. | TEST-VDOM-005 |
| REQ-VDOM-006 | When props change, diff shall emit updates including removal values. | TEST-VDOM-006 |
| REQ-VDOM-007 | When keyed siblings reorder, diff shall emit move patches identifying their previous indexes. | TEST-VDOM-007 |
| REQ-VDOM-008 | When keyed siblings are added or removed, diff shall emit inserts and removals. | TEST-VDOM-008 |
| REQ-VDOM-009 | When duplicate sibling keys are encountered, diff shall reject the ambiguous tree. | TEST-VDOM-009 |
| REQ-VDOM-010 | When unkeyed siblings have matching positions, diff shall reuse their positional identities. | TEST-VDOM-010 |
| REQ-VDOM-011 | When a NaN numeric key is supplied, h shall reject it rather than create unstable matching identity. | TEST-VDOM-011 |

## Design
Immutable typed VNodes feed a pure recursive patch planner; sibling keys match before indexes.
Patch paths refer to old indexes, child structural patches carry old and new indexes, and host reconciliation uses the same matching table.

## Assumptions / risks
Node 24 executes erasable TypeScript directly (spike: .sdd/spikes/runtime.mjs).
Map insertion order and queueMicrotask preserve deterministic ordering (same spike).
Views and effects are synchronous; the host is exclusive to the mount; event callbacks are client-only.
