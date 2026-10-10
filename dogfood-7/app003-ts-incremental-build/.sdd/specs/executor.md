---
feature: executor
tier: T2
approval: auto
---
# Bounded DAG executor
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXECUTOR-001 | When fake time advances, due sleepers shall resolve in deadline and insertion order. | TEST-EXECUTOR-001 |
| REQ-EXECUTOR-002 | If fake-clock durations or worker bounds are invalid, then the executor shall reject them. | TEST-EXECUTOR-002 |
| REQ-EXECUTOR-003 | When independent tasks execute, the executor shall run at most the configured concurrency. | TEST-EXECUTOR-003 |
| REQ-EXECUTOR-004 | When a prerequisite completes, its dependent shall start only after prerequisite success. | TEST-EXECUTOR-004 |
| REQ-EXECUTOR-005 | If a task fails, then its descendants shall be skipped while independent tasks complete. | TEST-EXECUTOR-005 |
| REQ-EXECUTOR-006 | When tasks transition, the executor shall report ordered timestamped pending/running/terminal states. | TEST-EXECUTOR-006 |
| REQ-EXECUTOR-007 | If cancellation is requested, then running tasks shall receive an abort signal and queued tasks shall be cancelled. | TEST-EXECUTOR-007 |
| REQ-EXECUTOR-008 (test-only) | The executor transition table shall permit only pending-to-running/skipped/cancelled and running-to-succeeded/failed/cancelled. | TEST-EXECUTOR-008 |
| REQ-EXECUTOR-009 | If fake-clock advances overlap, then the clock shall reject the second advance and preserve monotonic time. | TEST-EXECUTOR-009 |
| REQ-EXECUTOR-010 | When actions await finite chains of resolved promises, advancing fake time shall drain those microtasks before changing deadlines. | TEST-EXECUTOR-010 |
## Design
Graph topology drives lexical ready queues. Each task receives predecessor results and AbortSignal.
Promise settlements trigger scheduling; states are terminal exactly once; cancellation is cooperative for running work.
Transition table is the machine-readable source; fake clock never uses wall time and supports abortable sleeps.
## Assumptions
Actions must honor AbortSignal to terminate; independent failure is not global cancellation.
Advancing fake time flushes microtasks between deadlines; cancellation on an empty graph succeeds immediately.
An event-loop check-phase barrier drains microtasks without timers or wall-time changes; actions must not create infinite microtask chains.
