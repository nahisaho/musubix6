---
feature: executor
tier: T2
approval: auto
---
# executor
Goal: Python worker that executes jobs with handlers, timeouts, cancellation and retries.   Non-goals: concurrency.   Depends: contract, retry.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXE-001 | When a handler is registered for a type, the system shall use it; a duplicate registration shall raise ValueError. | TEST-EXE-001 |
| REQ-EXE-002 | If no handler exists for a job type, then the system shall mark the job dead with reason no_handler. | TEST-EXE-002 |
| REQ-EXE-003 | When the handler returns, the system shall set succeeded, store the result and set attempts to 1. | TEST-EXE-003 |
| REQ-EXE-004 | If the handler raises a transient error, then the system shall set retrying with delay from backoff and keep attempts count. | TEST-EXE-004 |
| REQ-EXE-005 | If the handler raises PermanentError, then the system shall set dead immediately. | TEST-EXE-005 |
| REQ-EXE-006 | When attempts reach max_attempts on failure, the system shall set dead and add a dead-letter entry. | TEST-EXE-006 |
| REQ-EXE-007 | If ctx.check() finds the clock past the per-attempt timeout, then the system shall treat the attempt as a transient failure with reason timeout. | TEST-EXE-007 |
| REQ-EXE-008 | When cancellation is requested, the system shall set cancelled without retry. | TEST-EXE-008 |
| REQ-EXE-009 | The system shall record a state history where each consecutive pair is allowed by the shared contract. | TEST-EXE-009 |
| REQ-EXE-010 | If the retry budget is exhausted, then the system shall set dead with reason budget_exhausted instead of retrying. | TEST-EXE-010 |
| REQ-EXE-011 | When run_until_done is called, the system shall loop attempts, sleeping the backoff delays through the injected sleep, and return the final record. | TEST-EXE-011 |
| REQ-EXE-012 | When a job ends dead for any reason (permanent, budget_exhausted, no_handler, exhausted), the system shall add exactly one dead-letter entry carrying the error or reason. | TEST-EXE-012 |

## Design
Executor(handlers, clock, sleep, seed, budget, dlq). `run_attempt(job)` performs one attempt and moves the job state via a `transition` helper that consults contract `can_transition`.

| Outcome of attempt | Next state | Reason |
| --- | --- | --- |
| return | succeeded | ok |
| transient, attempts<max, budget ok | failed→retrying | error |
| transient, budget empty | failed→dead | budget_exhausted |
| transient, attempts>=max | failed→dead | exhausted (+DLQ) |
| PermanentError | failed→dead | permanent |
| cancel flag | cancelled | cancelled |
| no handler | failed→dead | no_handler |

Invariants: E1 history is a valid path in the contract graph; E2 attempts<=max_attempts; E3 terminal state is never left.
## Assumptions / risks
Python cannot preempt handlers; timeouts are cooperative via ctx.check(). Documented limitation.
