---
feature: retry
tier: T1
---
# retry
Goal: retry with exponential backoff using an injected clock. Non-goals: jitter.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RETRY-001 | When FakeClock(start) is created, now() shall return start and sleep(s) shall advance now() by s without real waiting. | TEST-RETRY-001 |
| REQ-RETRY-002 | If sleep() receives a negative duration, then FakeClock shall raise ValueError. | TEST-RETRY-002 |
| REQ-RETRY-003 | When delay(n) is called, the policy shall return base*factor**(n-1) for attempt n (1-based). | TEST-RETRY-003 |
| REQ-RETRY-004 | While the computed delay exceeds max_delay, the policy shall return max_delay. | TEST-RETRY-004 |
| REQ-RETRY-005 | When should_retry(n) is called, the policy shall return True only if n < max_attempts. | TEST-RETRY-005 |
| REQ-RETRY-006 | When the callable succeeds, run_with_retry shall return its result, sleeping delay(n) on the clock after each failed attempt n. | TEST-RETRY-006 |
| REQ-RETRY-007 | If every attempt fails, then run_with_retry shall raise RetriesExhausted carrying attempts and the last error. | TEST-RETRY-007 |
| REQ-RETRY-008 | If the error type is not in policy.retry_on, then run_with_retry shall propagate it immediately without sleeping. | TEST-RETRY-008 |
| REQ-RETRY-009 | When an on_retry callback is given, run_with_retry shall call it with (attempt, error, delay) before each sleep. | TEST-RETRY-009 |
| REQ-RETRY-010 | When no_retry_policy() is called, the system shall return a policy with max_attempts 1 that never retries. | TEST-RETRY-010 |
