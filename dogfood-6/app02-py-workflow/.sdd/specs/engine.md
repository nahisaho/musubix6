---
feature: engine
tier: T2
---
# engine
Goal: execute a DAG of callables using dag ordering, retry backoff and persisted store transitions, with cancellation and resume. Non-goals: threads/parallel execution (sequential deterministic scheduling by layers).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENGINE-001 | When run() is called, the engine shall execute tasks in topological order. | TEST-ENGINE-001 |
| REQ-ENGINE-002 | When a task runs, the engine shall pass it a dict of its dependencies' results keyed by task id. | TEST-ENGINE-002 |
| REQ-ENGINE-003 | If the graph has a cycle, then run() shall raise CycleError before executing any task or recording any state. | TEST-ENGINE-003 |
| REQ-ENGINE-004 | When a task fails with a retryable error, the engine shall transition it to RETRYING, sleep the policy delay on the injected clock, and rerun it. | TEST-ENGINE-004 |
| REQ-ENGINE-005 | If a task exhausts its retries, then the engine shall mark it FAILED and mark all its transitive dependents CANCELLED without running them. | TEST-ENGINE-005 |
| REQ-ENGINE-006 | When cancel() is called during a run, the engine shall not start further tasks and shall mark every non-terminal task CANCELLED. | TEST-ENGINE-006 |
| REQ-ENGINE-007 | When cancel() is called before run(), run() shall execute nothing and report all tasks CANCELLED. | TEST-ENGINE-007 |
| REQ-ENGINE-008 | When run() is called with a store holding SUCCEEDED tasks, the engine shall skip them and reuse their persisted results. | TEST-ENGINE-008 |
| REQ-ENGINE-009 | When run() finishes, the engine shall return a RunReport with per-task final state, results, and ok true only if all tasks SUCCEEDED. | TEST-ENGINE-009 |
| REQ-ENGINE-010 | When a task starts, succeeds, retries or fails, the engine shall record the matching store transition. | TEST-ENGINE-010 |
| REQ-ENGINE-011 | If a dependency id is unknown, then run() shall raise UnknownDependency before executing any task. | TEST-ENGINE-011 |
| REQ-ENGINE-012 | When run() finds tasks left RUNNING by a crashed earlier run, the engine shall recover them to RETRYING via the store and rerun them instead of raising IllegalTransition. | TEST-ENGINE-012 |

## Design
Components: engine/runner.py (Engine.run loop), engine/report.py (RunReport), uses dag.Graph for order/dependents/validation, retry.RetryPolicy + FakeClock-compatible clock for backoff, store.StateStore for transitions.
Data flow: validate graph -> order -> for each task: skip if SUCCEEDED, cancel if dep not SUCCEEDED, else PENDING->RUNNING -> action(deps results) with retry loop (RUNNING->RETRYING->RUNNING) -> SUCCEEDED|FAILED -> failed cascades CANCELLED.
Decisions: results are persisted in the journal detail so resume can reuse them; cancel flag checked before each task start and after each action.
## Assumptions / risks
Actions are deterministic JSON-serializable results (TEST-ENGINE-008). Sequential execution only.
