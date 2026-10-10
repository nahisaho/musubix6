---
feature: retry
tier: T2
---
# retry
Goal: Retry policy with exponential backoff, jitter and an injected clock. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RETRY-001 | If a RetryPolicy is built with maxAttempts<1, negative base delay, multiplier<1, jitter outside [0,1] or maxDelay<baseDelay, then the system shall throw InvalidArgumentException. | TEST-RETRY-001 |
| REQ-RETRY-002 | When delayFor(n) is called, the system shall return baseDelay*multiplier^(n-1) as an integer of milliseconds. | TEST-RETRY-002 |
| REQ-RETRY-003 | While the computed delay exceeds maxDelay, the system shall return maxDelay. | TEST-RETRY-003 |
| REQ-RETRY-004 | Where jitter j>0, delayFor shall return floor(delay*(1-j*r)) using the injected random source r in [0,1); where j=0 the random source shall not be called. | TEST-RETRY-004 |
| REQ-RETRY-005 | If the attempt number is so large that the exponential overflows, then delayFor shall return maxDelay and never INF or NaN. | TEST-RETRY-005 |
| REQ-RETRY-006 | When shouldRetry is asked after a failure, the system shall allow a retry only while attemptsMade < maxAttempts. | TEST-RETRY-006 |
| REQ-RETRY-007 | If an exception is NonRetryableException or not an instance of a configured retryOn class, then shouldRetry shall return false. | TEST-RETRY-007 |
| REQ-RETRY-008 | When FakeClock sleeps for d ms, the system shall advance now() by d; if d is negative it shall throw InvalidArgumentException. | TEST-RETRY-008 |
| REQ-RETRY-009 | When the executor runs a callable, the system shall return its result, retrying retryable failures after sleeping delayFor on the clock and passing the 1-based attempt number. | TEST-RETRY-009 |
| REQ-RETRY-010 | If all attempts fail, then the executor shall throw RetriesExhausted carrying the attempt count and the last exception as previous. | TEST-RETRY-010 |
| REQ-RETRY-011 | If the callable throws a non-retryable exception, then the executor shall rethrow it unchanged without sleeping. | TEST-RETRY-011 |
| REQ-RETRY-012 | Where a total time budget is set and elapsed time plus the next delay would exceed it, the executor shall stop and throw RetriesExhausted without sleeping that delay. | TEST-RETRY-012 |

## Design
- `Saga\Retry\ClockInterface{now():int; sleep(int):void}`; `FakeClock` is the only clock used in tests; real clock never sleeps in unit tests.
- Delay table (base=100, mult=2, max=1000): n=1→100, 2→200, 3→400, 4→800, 5→1000(cap), 100→1000 (computed in float with is_finite guard, never int overflow).
- Invariants: 0 <= delayFor(n) <= maxDelay; delayFor monotone non-decreasing when jitter=0; attempts made never exceed maxAttempts.
- Executor state: attempt (1..max) → run → ok | retryable fail → shouldRetry? budget check → sleep → attempt+1 | stop → RetriesExhausted.
## Assumptions / risks: float pow overflow retired by TEST-RETRY-005; budget boundary (elapsed+delay == budget allowed) retired by TEST-RETRY-012.
