---
feature: runtime
tier: T2
approval: auto
---
# runtime
Goal: deterministic reactive UI runtime. Non-goals: browser bundling, hydration, async effects.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RUNTIME-001 | When a view is mounted, the runtime shall create the host tree synchronously. | TEST-RUNTIME-001 |
| REQ-RUNTIME-002 | When view signals change, the runtime shall schedule one normal-priority update until flushed. | TEST-RUNTIME-002 |
| REQ-RUNTIME-003 | When keyed siblings reorder, the runtime shall preserve matching host identities. | TEST-RUNTIME-003 |
| REQ-RUNTIME-004 | When node types change, the runtime shall replace their host nodes. | TEST-RUNTIME-004 |
| REQ-RUNTIME-005 | When props or text change, the runtime shall update the existing host node. | TEST-RUNTIME-005 |
| REQ-RUNTIME-006 | When a mount is disposed, the runtime shall remove its root and cancel queued updates. | TEST-RUNTIME-006 |
| REQ-RUNTIME-007 | When a removed host subtree contains listeners, the runtime shall detach its listeners. | TEST-RUNTIME-007 |
| REQ-RUNTIME-008 | When multiple mounts share a scheduler, the runtime shall update each independently. | TEST-RUNTIME-008 |
| REQ-RUNTIME-009 | When view evaluation or VNode preflight fails, the runtime shall keep the committed tree and allow a later signal change to retry. | TEST-RUNTIME-009 |
| REQ-RUNTIME-010 | When a view is mounted after an SSR snapshot, the runtime shall render equivalent HTML after updates. | TEST-RUNTIME-010 |
| REQ-RUNTIME-011 (test-only) | When an invalid descendant fails preflight, the runtime shall preserve committed identities, props, children and listeners and permit a valid retry. | TEST-RUNTIME-011 |
| REQ-RUNTIME-012 | When a DOM adapter creates or updates attributes, it shall coerce once and validate the exact string it writes. | TEST-RUNTIME-012 |
| REQ-RUNTIME-013 (test-only) | When a DOM-backed keyed list updates or disposes, the runtime shall preserve keyed element identity and detach listeners from removed elements. | TEST-RUNTIME-013 |

## Design
A mount owns one graph effect and one keyed scheduler task; view evaluation precedes host mutation.
An injected host adapter implements create/update/children/remove; matching VNodes retain identity and disposal owns listener cleanup.

## Assumptions / risks
Node 24 executes erasable TypeScript directly (spike: .sdd/spikes/runtime.mjs).
Map insertion order and queueMicrotask preserve deterministic ordering (same spike).
Views and effects are synchronous; the host is exclusive to the mount; event callbacks are client-only.
Host operations must not throw; external host failure is outside transactional guarantees. View evaluation and validation finish before host mutation.
