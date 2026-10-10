---
feature: queue
tier: T2
approval: auto
---
# queue
Goal: in-memory priority queue with leases, delay, idempotency and contract-checked transitions (TS API).   Non-goals: persistence.   Depends: contract, validate.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUE-001 | When a valid job is enqueued, the system shall return {id, deduplicated:false} and the job state shall be queued; an invalid job shall be rejected with the validation errors. | TEST-QUE-001 |
| REQ-QUE-002 | When dequeue(now) is called, the system shall return the visible job with the highest priority, FIFO among equals. | TEST-QUE-002 |
| REQ-QUE-003 | While now < runAt, the system shall not return the job from dequeue. | TEST-QUE-003 |
| REQ-QUE-004 | When a job with an existing idempotencyKey is enqueued, the system shall return the existing id with deduplicated:true and not add a job. | TEST-QUE-004 |
| REQ-QUE-005 | If the number of non-terminal jobs equals capacity, then enqueue shall throw QueueFullError. | TEST-QUE-005 |
| REQ-QUE-006 | When a job is dequeued, the system shall set state running, increment attempts and set leaseUntil = now + leaseMs. | TEST-QUE-006 |
| REQ-QUE-007 | When reclaimExpired(now) is called, the system shall move running jobs with leaseUntil <= now back to retrying (visible immediately), or to dead when attempts >= maxAttempts. | TEST-QUE-007 |
| REQ-QUE-008 | When ack(id) is called on a running job, the system shall set succeeded; otherwise it shall throw IllegalTransitionError. | TEST-QUE-008 |
| REQ-QUE-009 | When cancel(id) is called, the system shall set cancelled if the contract allows it from the current state, else throw IllegalTransitionError. | TEST-QUE-009 |
| REQ-QUE-010 | When nack(id, retryAt) is called on a running job, the system shall set retrying, visible from retryAt, or dead if attempts >= maxAttempts. | TEST-QUE-010 |
| REQ-QUE-011 | The system shall report stats() whose per-state counts sum to the total number of jobs. | TEST-QUE-011 |
| REQ-QUE-012 | When dequeue finds a job whose deadline <= now, the system shall cancel it and skip it. | TEST-QUE-012 |

## Design
Jobs live in a Map; ordering key for ready jobs = (-priority, seq). Every state change goes through `move(job,to)` that checks `canTransition` (contract feature).

| From | Event | To |
| --- | --- | --- |
| queued/retrying | dequeue (visible, not past deadline) | running |
| queued/retrying | dequeue (deadline passed) | cancelled |
| running | ack | succeeded |
| running | nack / lease expiry (attempts<max) | failed→retrying |
| running | nack / lease expiry (attempts>=max) | failed→dead |
| queued/retrying/running | cancel | cancelled |

Invariants: Q1 sum(stats)=jobs.size; Q2 only running jobs have leaseUntil; Q3 non-terminal count <= capacity; Q4 attempts <= maxAttempts.
## Assumptions / risks
Linear scan for dequeue is acceptable at capacity ≤ 10k (spike: not needed).
