---
feature: signals
tier: T2
approval: auto
---
# signals
Goal: deterministic reactive UI signals. Non-goals: browser bundling, hydration, async effects.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SIGNALS-001 | When a signal is read and written, the graph shall expose the latest value. | TEST-SIGNALS-001 |
| REQ-SIGNALS-002 | When an effect is created, the graph shall run it synchronously and track reads. | TEST-SIGNALS-002 |
| REQ-SIGNALS-003 | When a signal receives an Object.is-equal value, the graph shall not rerun subscribers. | TEST-SIGNALS-003 |
| REQ-SIGNALS-004 | When a conditional effect changes branches, the graph shall unsubscribe stale dependencies. | TEST-SIGNALS-004 |
| REQ-SIGNALS-005 | When writes occur inside nested batches, the graph shall rerun each effect once after the outer batch. | TEST-SIGNALS-005 |
| REQ-SIGNALS-006 | When a computed signal is read, the graph shall lazily cache its derived value and invalidate it on dependency writes. | TEST-SIGNALS-006 |
| REQ-SIGNALS-007 | When an effect is disposed, the graph shall remove subscriptions and invoke its last cleanup once. | TEST-SIGNALS-007 |
| REQ-SIGNALS-008 | When an effect reruns, the graph shall run the previous cleanup before the next body. | TEST-SIGNALS-008 |
| REQ-SIGNALS-009 | When reads occur inside untrack, the graph shall not register their dependencies. | TEST-SIGNALS-009 |
| REQ-SIGNALS-010 | When a self-writing effect fails to converge, the graph shall throw a cycle error and recover for subsequent effects. | TEST-SIGNALS-010 |
| REQ-SIGNALS-011 | When computed dependencies invalidate, the graph shall notify computed-only effects and expose consistent source-derived pairs once per write. | TEST-SIGNALS-011 |
| REQ-SIGNALS-012 | When a computed evaluation throws, subsequent dependency writes shall notify subscribers and permit successful evaluation recovery. | TEST-SIGNALS-012 |
| REQ-SIGNALS-013 | When an effect disposes itself during cleanup or its body, the graph shall not resurrect it and shall release newly returned cleanup exactly once. | TEST-SIGNALS-013 |

## Design
A synchronous dependency graph tracks the active observer; reads subscribe, writes invalidate.
Nested batches use one Set drain; computed invalidation is eager but evaluation is lazy; a 100-run guard catches cycles.

## Assumptions / risks
Node 24 executes erasable TypeScript directly (spike: .sdd/spikes/runtime.mjs).
Map insertion order and queueMicrotask preserve deterministic ordering (same spike).
Views and effects are synchronous; the host is exclusive to the mount; event callbacks are client-only.
