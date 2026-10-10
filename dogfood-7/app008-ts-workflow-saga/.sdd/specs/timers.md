---
feature: timers
tier: T2
approval: auto
---
# Deterministic logical timers
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TIMERS-001 | When constructed with logical time, the clock shall return that time without reading wall time. | TEST-TIMERS-001 |
| REQ-TIMERS-002 | When advanced to a later time, the clock shall retain the new time. | TEST-TIMERS-002 |
| REQ-TIMERS-003 | If time moves backwards or is not a safe nonnegative integer, the clock shall reject it. | TEST-TIMERS-003 |
| REQ-TIMERS-004 | When a timer becomes due, draining shall return it exactly once. | TEST-TIMERS-004 |
| REQ-TIMERS-005 | While a deadline is in the future, draining shall not return that timer. | TEST-TIMERS-005 |
| REQ-TIMERS-006 | When deadlines tie, draining shall sort by run identifier then timer identifier. | TEST-TIMERS-006 |
| REQ-TIMERS-007 | When an identical timer is scheduled twice, scheduling shall be idempotent. | TEST-TIMERS-007 |
| REQ-TIMERS-008 | If an existing timer is assigned a different deadline, scheduling shall reject it. | TEST-TIMERS-008 |
| REQ-TIMERS-009 | When a timer is cancelled, it shall not fire and repeated cancellation shall be harmless. | TEST-TIMERS-009 |
| REQ-TIMERS-010 | When a queue snapshot is restored, it shall preserve deadlines and reject invalid snapshots. | TEST-TIMERS-010 |
## Design
Clock is caller-driven; queue identity is the tuple (runId,key), not a concatenated string.
Due ordering uses numeric deadline then Unicode code-unit identifiers, independent of locale and insertion order.
## Assumptions
All times are milliseconds represented as safe integers; runtime persists deadlines and reconstructs on replay.
Queue snapshots are JSON data, defensive copies; timer queue is an optional scheduler index, not source of truth.
