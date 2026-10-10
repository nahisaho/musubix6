---
feature: bucket
tier: T2
---
# bucket
Goal: thread-safe token bucket limiter with injectable clock. Non-goals: distributed state.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BUCKET-001 | When New(rate,burst,now) is called with valid config, the system shall start with a full bucket of burst tokens. | TEST-BUCKET-001 |
| REQ-BUCKET-002 | When Allow is called and at least one token is available, the system shall consume one token and return true; otherwise it shall return false. | TEST-BUCKET-002 |
| REQ-BUCKET-003 | While time elapses, the system shall refill rate tokens per second, capped at burst. | TEST-BUCKET-003 |
| REQ-BUCKET-004 | When AllowN(n) is called, the system shall consume n tokens atomically or none at all. | TEST-BUCKET-004 |
| REQ-BUCKET-005 | If rate <= 0 or burst <= 0, then New shall return ErrInvalidConfig. | TEST-BUCKET-005 |
| REQ-BUCKET-006 | When Wait(ctx) is called and no token is available, the system shall block until a token is granted or ctx is done, returning ctx.Err() in the latter case. | TEST-BUCKET-006 |
| REQ-BUCKET-007 | While many goroutines call Allow concurrently, the system shall never grant more than burst tokens without time elapsing. | TEST-BUCKET-007 |
| REQ-BUCKET-008 | When RetryAfter is called, the system shall return the duration until one token will be available (0 if available now). | TEST-BUCKET-008 |
| REQ-BUCKET-009 | When Refund(n) is called, the system shall return n tokens to the bucket, never exceeding burst. | TEST-BUCKET-009 |

## Design
- Component: `bucket.Bucket` guarded by a mutex; fields tokens(float64), last(time), rate, burst, now func.
- Data flow: every operation calls refill(now) first (tokens=min(burst,tokens+elapsed*rate)), then mutates.
- Wait polls: loop { if AllowN ok return nil; sleep min(RetryAfter, ctx) via timer; select on ctx.Done }.
- Decision: injectable clock makes refill deterministic; Wait uses real timers so its test uses a high rate.
## Assumptions / risks
- Clock never goes backwards; negative elapsed is treated as 0 (covered by TEST-BUCKET-003 design, no extra REQ).
