---
feature: retry
tier: T2
approval: auto
---
# retry
Goal: backoff, retry decision, retry budget and dead-letter queue for the Python worker.   Non-goals: scheduling.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RET-001 | When backoff(attempt, base, cap) is called with mode none, the system shall return min(cap, base*2^(attempt-1)). | TEST-RET-001 |
| REQ-RET-002 | If attempt < 1 or base/cap <= 0 or cap < base, then the system shall raise ValueError. | TEST-RET-002 |
| REQ-RET-003 | While attempt is huge (e.g. 100000), the system shall return cap without overflow or long computation. | TEST-RET-003 |
| REQ-RET-004 | When mode is full, the system shall return a delay within [0, ceiling], deterministic for a given seed. | TEST-RET-004 |
| REQ-RET-005 | When mode is equal, the system shall return a delay within the closed interval [ceiling/2, ceiling]. | TEST-RET-005 |
| REQ-RET-006 | When should_retry is called, the system shall return False if attempts are exhausted or the error is PermanentError, else True. | TEST-RET-006 |
| REQ-RET-007 | When a RetryBudget is consumed, the system shall allow it while tokens >= 1; on_success shall refill by ratio, capped at capacity. | TEST-RET-007 |
| REQ-RET-008 | When the DeadLetterQueue exceeds capacity, the system shall evict the oldest entry and keep insertion order. | TEST-RET-008 |
| REQ-RET-009 | When total_delay(max_attempts, base, cap) is called, the system shall return the sum of the no-jitter delays of the retries (max_attempts-1 of them). | TEST-RET-009 |

## Design
`backoff` = ceiling `min(cap, base*2^(attempt-1))` computed with exponent clamp (no big pow); jitter from `random.Random(seed)`.

| Mode | Range |
| --- | --- |
| none | ceiling |
| full | [0, ceiling] |
| equal | [ceiling/2, ceiling] |

Budget state: tokens ∈ [0, capacity]; consume: tokens>=1 ⇒ tokens-=1 else denied; on_success: tokens=min(capacity, tokens+ratio).
Invariants: R1 0<=tokens<=capacity; R2 delay<=cap; R3 DLQ len<=capacity.
## Assumptions / risks
2**100000 is slow-ish but legal in Python; clamp the exponent via bit math.
