---
feature: comp
tier: T2
---
# comp
Goal: saga-style compensation: undo completed tasks in reverse completion order through registered compensation handlers. Non-goals: persistence of the log, compensation of compensations, nested sub-processes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMP-001 | When a task with attribute `compensate=<name>` completes, the CompensationService shall append a log entry (task id, token id, completion event seq) to the instance's compensation log. | TEST-COMP-001 |
| REQ-COMP-002 | When compensate(instance) is called, the service shall run the handlers of the logged entries in descending completion seq, each at most once per entry, and return one outcome per entry. | TEST-COMP-002 |
| REQ-COMP-003 | The service shall neither log nor compensate tasks without a `compensate` attribute. | TEST-COMP-003 |
| REQ-COMP-004 | If no handler is registered for an entry's `compensate` name, then the outcome shall be MISSING_HANDLER and compensation shall continue with the remaining entries. | TEST-COMP-004 |
| REQ-COMP-005 | If a compensation handler throws, then the outcome shall be FAILED with the message, the remaining entries shall still run, and the result shall not be allCompensated. | TEST-COMP-005 |
| REQ-COMP-006 | When compensate is called again, the service shall skip entries already COMPENSATED and retry only FAILED or MISSING_HANDLER entries. | TEST-COMP-006 |
| REQ-COMP-007 | When tasks of parallel branches completed, the service shall order compensation by the global completion seq, so the last completed task is compensated first. | TEST-COMP-007 |
| REQ-COMP-008 | When a task completed several times in a loop, the service shall log and compensate each completion separately. | TEST-COMP-008 |
| REQ-COMP-009 | When cancel(instance) is called on a RUNNING instance, the service shall terminate it and then compensate; when the instance FAILED, the service shall compensate it on request. | TEST-COMP-009 |
| REQ-COMP-010 | If compensate is called on a RUNNING instance, then the service shall throw IllegalStateException and run no handler. | TEST-COMP-010 |
| REQ-COMP-011 | The service shall not log a task whose handler failed or that is still WAITING; a resumed wait task completed through Engine.complete shall be logged. | TEST-COMP-011 |
| REQ-COMP-012 | When a compensation handler runs, it shall receive the task node and the instance variables as they are at that time, so it can read values produced by forward handlers. | TEST-COMP-012 |

## Design
Components: `CompensationService(Engine)` (registry of compensation handlers; per-instance log keyed by `Instance.id()`), `CompensationHandler`, records `LogEntry(taskId, tokenId, seq, state, detail)` and `Outcome`, `CompensationResult`.
Data flow: forward completion is observed from instance history (`DONE` events, one per completed task: REQ-TOKENS-013) -> `sync(instance)` appends new entries for tasks having `compensate` -> `compensate` iterates entries in descending seq -> handler.

| Entry state | Event | Next |
| --- | --- | --- |
| PENDING | compensate, handler ok | COMPENSATED |
| PENDING | handler throws | FAILED |
| PENDING | handler name unregistered | MISSING_HANDLER |
| FAILED, MISSING_HANDLER | compensate again | re-run (-> any above) |
| COMPENSATED | compensate again | skipped (terminal) |

| Instance status | compensate | cancel |
| --- | --- | --- |
| RUNNING | IllegalStateException | terminate then compensate |
| FAILED, TERMINATED, COMPLETED | allowed | terminate returns false, then compensate |

Invariants: entries ordered by unique ascending seq (history seq); an entry is COMPENSATED at most once; log built only from DONE events so tasks whose handler threw are never logged; sync is idempotent (a seq is added once).

## Assumptions / risks
A DONE event exists for every completed task (retired by REQ-TOKENS-013 and TEST-TOKENS-013). Compensation handlers run synchronously on the caller's thread and must not start new instances.
