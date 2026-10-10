---
feature: tokens
tier: T2
---
# tokens
Goal: execute a validated ProcessModel with tokens, task handlers and wait states. Non-goals: gateway routing (feature gateways), timers, compensation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TOKENS-001 | When Engine.start is called with a valid model, the engine shall create an instance with one token at the start node and run it until the instance completes or every token waits. | TEST-TOKENS-001 |
| REQ-TOKENS-002 | If the model has validation issues, then Engine.start shall throw IllegalArgumentException whose message lists the issue codes. | TEST-TOKENS-002 |
| REQ-TOKENS-003 | The engine shall give tokens unique ids `t1`, `t2`, ... in creation order and number history events from 1 with strictly increasing seq. | TEST-TOKENS-003 |
| REQ-TOKENS-004 | When a token enters a task with attribute `handler=<name>`, the engine shall invoke the registered handler exactly once with the task node and the instance variables, which the handler may modify. | TEST-TOKENS-004 |
| REQ-TOKENS-005 | When a token enters a task with `wait=true`, the engine shall set the token WAITING and keep the instance RUNNING until Engine.complete is called with its token id; complete shall merge the given variables and resume the token. | TEST-TOKENS-005 |
| REQ-TOKENS-006 | If Engine.complete is called for an unknown, not WAITING token or a finished instance, then the engine shall throw IllegalStateException and leave the instance unchanged. | TEST-TOKENS-006 |
| REQ-TOKENS-007 | If a handler throws, then the engine shall set the instance FAILED, record a FAIL event with the error message and consume no further tokens. | TEST-TOKENS-007 |
| REQ-TOKENS-008 | If a task has no `handler` attribute, then the engine shall pass the token through unchanged; an unregistered handler name shall FAIL the instance with NO_HANDLER. | TEST-TOKENS-008 |
| REQ-TOKENS-009 | If a non-end node does not have exactly one outgoing flow, then the engine shall FAIL the instance with NO_ROUTE. | TEST-TOKENS-009 |
| REQ-TOKENS-010 | If the number of steps of one instance exceeds Engine.maxSteps (default 1000), then the engine shall FAIL the instance with STEP_LIMIT. | TEST-TOKENS-010 |
| REQ-TOKENS-011 | When Engine.terminate is called on a RUNNING instance, the engine shall consume all live tokens, set TERMINATED and return true; on a finished instance it shall return false. | TEST-TOKENS-011 |
| REQ-TOKENS-012 | The instance shall expose variables, tokens and history only as unmodifiable snapshots; the instance shall be COMPLETED only when no token is ACTIVE or WAITING. | TEST-TOKENS-012 |
| REQ-TOKENS-013 | When a task completes (handler returned, pass-through, or resumed by Engine.complete), the engine shall append exactly one DONE event for it before the token moves on. | TEST-TOKENS-013 |

## Design
Components: `Engine` (stateless service, handler registry, step budget), `Instance` (mutable aggregate owned by the engine), records `Token`, `Event`; interface `TaskHandler`.
Data flow: start -> new Instance + token t1 at start -> run queue (FIFO of ACTIVE token ids) -> `step(token)` per node type -> move token along the single outgoing flow.

| Instance status | Event | Next status |
| --- | --- | --- |
| RUNNING | last live token consumed at END | COMPLETED |
| RUNNING | handler throws / NO_ROUTE / NO_HANDLER / STEP_LIMIT | FAILED |
| RUNNING | terminate | TERMINATED |
| COMPLETED, FAILED, TERMINATED | any operation | unchanged (complete throws, terminate false) |

| Token state | Event | Next |
| --- | --- | --- |
| ACTIVE | enters wait task | WAITING |
| WAITING | complete | ACTIVE |
| ACTIVE | moves along flow | ACTIVE (new nodeId) |
| ACTIVE | at END / terminate | CONSUMED |

Invariants: token ids unique; event seq strictly increasing; status != RUNNING => no ACTIVE/WAITING token (a failing token is consumed when the instance fails); history append-only.

## Assumptions / risks
Handler exceptions never escape Engine (TEST-TOKENS-007). Loops are bounded by the step budget (TEST-TOKENS-010).
