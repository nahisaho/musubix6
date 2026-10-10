---
feature: scheduler
tier: T2
approval: auto
---
# scheduler
Goal: deterministic reactive UI scheduler. Non-goals: browser bundling, hydration, async effects.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SCHEDULER-001 | When tasks of different priorities are flushed, the scheduler shall run immediate before normal before idle. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-002 | When tasks share a priority, the scheduler shall preserve enqueue order. | TEST-SCHEDULER-002 |
| REQ-SCHEDULER-003 | When the same key is enqueued again, the scheduler shall replace its pending callback and priority. | TEST-SCHEDULER-003 |
| REQ-SCHEDULER-004 | When a task is cancelled before execution, the scheduler shall not execute it. | TEST-SCHEDULER-004 |
| REQ-SCHEDULER-005 | When a callback enqueues another task, the scheduler shall run it in the same flush using priority order. | TEST-SCHEDULER-005 |
| REQ-SCHEDULER-006 | When a flush budget is exhausted, the scheduler shall leave remaining tasks pending. | TEST-SCHEDULER-006 |
| REQ-SCHEDULER-007 | When a task throws, the scheduler shall execute remaining tasks then throw an AggregateError. | TEST-SCHEDULER-007 |
| REQ-SCHEDULER-008 | When a flush is invoked recursively, the scheduler shall reject the recursive call without corrupting the queue. | TEST-SCHEDULER-008 |
| REQ-SCHEDULER-009 | When automatic scheduling is enabled, the scheduler shall coalesce enqueues into one microtask drain. | TEST-SCHEDULER-009 |
| REQ-SCHEDULER-010 | When invalid priority or budget is provided, the scheduler shall reject it without dropping pending work. | TEST-SCHEDULER-010 |
| REQ-SCHEDULER-011 | When a keyed task is replaced, a stale cancellation handle shall not cancel the new enqueue generation. | TEST-SCHEDULER-011 |
| REQ-SCHEDULER-012 | When automatic tasks fail, the scheduler shall drain remaining tasks and deliver AggregateError to onError, or retain it in errors when no handler exists. | TEST-SCHEDULER-012 |

## Design
A keyed Map stores tasks with monotonic sequence numbers; flush selects priority then sequence.
Cancelled tasks disappear; tasks are removed before invocation, errors are aggregated, and reentrant flush is forbidden.
Cancellation handles own a task generation; auto drains catch errors and report to onError or the public errors array.

## Assumptions / risks
Node 24 executes erasable TypeScript directly (spike: .sdd/spikes/runtime.mjs).
Map insertion order and queueMicrotask preserve deterministic ordering (same spike).
Views and effects are synchronous; the host is exclusive to the mount; event callbacks are client-only.
