---
feature: resilience
tier: T2
approval: auto
---
# Retry and outlier engine
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RESILIENCE-001 | When transport succeeds, the system shall return its response without retry. | TEST-RESILIENCE-001 |
| REQ-RESILIENCE-002 | When loading a snapshot, the system shall use configured healthy endpoints. | TEST-RESILIENCE-001 |
| REQ-RESILIENCE-003 | When a retryable idempotent request fails, the system shall retry within budget. | TEST-RESILIENCE-002 |
| REQ-RESILIENCE-004 | If a request is not idempotent, the system shall not retry it. | TEST-RESILIENCE-002 |
| REQ-RESILIENCE-005 | If errors are nonretryable, the system shall return immediately. | TEST-RESILIENCE-003 |
| REQ-RESILIENCE-006 | If the deadline is exhausted, the system shall not call transport again. | TEST-RESILIENCE-003 |
| REQ-RESILIENCE-007 | If an endpoint exceeds its consecutive-failure threshold, the system shall eject it. | TEST-RESILIENCE-004 |
| REQ-RESILIENCE-008 | When ejection expires, the system shall allow the endpoint again. | TEST-RESILIENCE-004 |
| REQ-RESILIENCE-009 | When the circuit is open, the system shall fail without calling transport. | TEST-RESILIENCE-005 |
| REQ-RESILIENCE-010 | When a transport attempt returns, the system shall release circuit capacity. | TEST-RESILIENCE-005 |
| REQ-RESILIENCE-011 | If backoff would overflow simulated time, the system shall fail with ErrDeadline without another transport call. | TEST-RESILIENCE-006 |
| REQ-RESILIENCE-012 | When a late successful attempt completes during an endpoint's active ejection, the system shall preserve the ejection. | TEST-RESILIENCE-007 |
| REQ-RESILIENCE-013 | If ejection expiry would overflow time, the system shall saturate expiry at maximum int64 time. | TEST-RESILIENCE-008 |
| REQ-RESILIENCE-014 | When an older failed request completes after a newer ejection, the system shall not shorten the ejection expiry. | TEST-RESILIENCE-009 |
## Design
Proxy owns a snapshot copy and endpoint outlier state; circuit/balancer packages own their independent mutexes.
Attempt table: success=>return/reset failures; nonretryable=>return; retryable+idempotent+budget=>advance time/retry.
Transport is a caller callback outside proxy locks; retry backoff uses deterministic integer simulated time.
Each request owns its supplied start time; callbacks consume zero simulated time and backoff advances only that request's time.
Before every attempt, time greater than or equal to the absolute deadline rejects transport.
## Assumptions / risks
Spike proves race-safe callback execution without holding configuration locks.
Deadline is absolute milliseconds; retry budget counts additional attempts, not the first.
Ejected endpoints are excluded even if this leaves no candidates; no implicit fail-open policy.
