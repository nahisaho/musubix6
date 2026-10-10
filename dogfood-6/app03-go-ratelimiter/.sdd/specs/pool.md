---
feature: pool
tier: T2
---
# pool
Goal: priority worker pool with admission rate limiting, context cancellation and graceful shutdown. Depends on pq, limiter.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-POOL-001 | If Workers <= 0, then New shall return ErrInvalidConfig. | TEST-POOL-001 |
| REQ-POOL-002 | When jobs are queued before Start, the system shall run higher priority jobs first (single worker). | TEST-POOL-002 |
| REQ-POOL-003 | While running, the system shall execute at most Workers jobs concurrently and shall reach that concurrency. | TEST-POOL-003 |
| REQ-POOL-004 | If a job's submit context is done before it starts, then the system shall skip it and resolve its future with ctx.Err(). | TEST-POOL-004 |
| REQ-POOL-005 | If the configured Limiter rejects a Submit, then the system shall return ErrRateLimited and not enqueue the job. | TEST-POOL-005 |
| REQ-POOL-006 | When Shutdown(ctx) is called, the system shall reject new submits with ErrClosed, drain queued jobs and wait for workers. | TEST-POOL-006 |
| REQ-POOL-007 | If Shutdown ctx expires before drain, then the system shall cancel running jobs' contexts and return ctx.Err(). | TEST-POOL-007 |
| REQ-POOL-008 | If a job panics, then the system shall resolve its future with an error and keep the worker alive. | TEST-POOL-008 |
| REQ-POOL-009 | When Future.Wait(ctx) is called, the system shall return the job's error once done, or ctx.Err() if ctx ends first. | TEST-POOL-009 |
| REQ-POOL-010 | When Stats is called, the system shall report counts of completed and failed jobs. | TEST-POOL-010 |

## Design
- Components: `pool.Pool{q *pq.Queue, lim limiter.Limiter, workers, wg, baseCtx/cancel}`; `Future{done chan, err}`.
- State machine: new → running (Start) → closing (Shutdown: q.Close, workers drain via PopWait until ErrClosed) → stopped. Submit in closing/stopped = ErrClosed.
- Data flow: Submit: closed? → Limiter.Allow → q.Push(prio) ; worker: PopWait(baseCtx-independent) → ctx check → run with recover → resolve future.
- Decision: running jobs get a ctx derived from baseCtx; forced shutdown cancels baseCtx; workers' PopWait uses a separate ctx so draining still works.
## Assumptions / risks
- Submit before Start allowed (queued); Start idempotent.
- Race between Submit and Shutdown: guarded by pool mutex around closed check + Push.
