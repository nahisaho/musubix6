---
feature: orch
tier: T2
---
# orch
Goal: Saga orchestrator running steps in dependency order, compensating in reverse on failure, with retries, idempotency keys, persisted state and crash resume. Non-goals: parallel step execution.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ORCH-001 | When every step succeeds, the system shall mark each step DONE in execution order and the saga COMPLETED, returning step results keyed by name. | TEST-ORCH-001 |
| REQ-ORCH-002 | When a step action runs, the system shall pass a StepContext holding sagaId, step name, 1-based attempt and results of previously completed steps. | TEST-ORCH-002 |
| REQ-ORCH-003 | If a step fails permanently, then the system shall compensate the previously DONE steps in reverse execution order, not the failed step, and end COMPENSATED. | TEST-ORCH-003 |
| REQ-ORCH-004 | Where a completed step has no compensation, the system shall mark it COMPENSATED without error. | TEST-ORCH-004 |
| REQ-ORCH-005 | When a step action fails retryably and then succeeds, the system shall retry through the injected clock per policy and still complete the saga. | TEST-ORCH-005 |
| REQ-ORCH-006 | If an action exhausts retries, then the system shall start compensation and mark the step FAILED. | TEST-ORCH-006 |
| REQ-ORCH-007 | If a compensation exhausts retries, then the system shall mark the step COMPENSATION_FAILED, continue compensating the remaining steps, and end the saga FAILED. | TEST-ORCH-007 |
| REQ-ORCH-008 | When a saga is re-run after a crash while RUNNING, the system shall resume at the first step not DONE without re-executing DONE steps. | TEST-ORCH-008 |
| REQ-ORCH-009 | When a saga that is already COMPLETED, COMPENSATED or FAILED is run again, the system shall return the recorded result without invoking any action or compensation. | TEST-ORCH-009 |
| REQ-ORCH-010 | If the persisted fingerprint differs from the definition fingerprint, then the system shall throw DefinitionMismatch before running any step. | TEST-ORCH-010 |
| REQ-ORCH-011 | If an action throws NonRetryableException, then the system shall not retry and shall compensate immediately. | TEST-ORCH-011 |
| REQ-ORCH-012 | If a state save hits a stale version, then the system shall propagate ConcurrencyException and run no further step. | TEST-ORCH-012 |
| REQ-ORCH-013 | When a saga is re-run while COMPENSATING, the system shall continue compensating only steps still DONE or COMPENSATING and never re-run actions. | TEST-ORCH-013 |
| REQ-ORCH-014 | When an action key is already completed in the idempotency store, the system shall replay the cached result instead of invoking the action. | TEST-ORCH-014 |
| REQ-ORCH-015 | If an action key is IN_FLIGHT elsewhere, then the system shall propagate InFlight, leave the saga RUNNING with the step reset to PENDING, and neither fail the step nor compensate (bug fix: InFlight was treated as a step failure). | TEST-ORCH-015 |

## Design
Components: Orchestrator(StateStore, ClockInterface, IdempotencyStore, RetryPolicy action, RetryPolicy compensation); uses SagaDefinition::executionOrder/compensationOrder/fingerprint, SagaInstance transitions, RetryExecutor, IdempotentExecutor, KeyFactory.
Flow table:
| saga status on entry | behavior |
| --- | --- |
| none | create PENDING, save |
| PENDING/RUNNING | verify fingerprint, forward-run steps not DONE |
| COMPENSATING | skip forward phase, compensate remaining |
| COMPLETED/COMPENSATED/FAILED | return recorded result |
Step status flow: PENDING→RUNNING→DONE|FAILED; DONE→COMPENSATING→COMPENSATED|COMPENSATION_FAILED. A step left RUNNING by a crash is reset to PENDING and re-run under the same idempotency key.
Invariants: (1) a state save follows every transition, (2) a DONE step is never re-executed, (3) compensation order = reverse of execution order restricted to DONE steps, (4) terminal saga is never mutated.
## Assumptions / risks: crash simulated by a store that throws after N saves (TEST-ORCH-008); stale-version spike in TEST-ORCH-012.
