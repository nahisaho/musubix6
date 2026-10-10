---
feature: velocity
tier: T1
---
# velocity
Goal: sliding-window velocity statistics (count/sum/distinct) per key over an injected clock.   Non-goals: persistence, threading.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VEL-001 | When ManualClock.Advance(span) is called with a non-negative span, the clock shall move Now forward; a negative span shall throw ArgumentOutOfRangeException. | TEST-VEL-001 |
| REQ-VEL-002 | When counting a key over a window W at time T, the system shall count the events whose timestamp lies in the half-open interval (T-W, T]. | TEST-VEL-002 |
| REQ-VEL-003 | When the clock advances, events older than the window shall no longer be counted. | TEST-VEL-003 |
| REQ-VEL-004 | The system shall keep per-key state isolated: events of key A shall never affect counts of key B. | TEST-VEL-004 |
| REQ-VEL-005 | When Sum is requested for a key and window, the system shall return the decimal sum of amounts of events inside the window. | TEST-VEL-005 |
| REQ-VEL-006 | When Distinct is requested, the system shall return the number of distinct values inside the window, forgetting values whose every occurrence expired. | TEST-VEL-006 |
| REQ-VEL-007 | When an event arrives with a timestamp older than the newest recorded but still inside the max window, the system shall still count it; an event older than the max window shall be dropped. | TEST-VEL-007 |
| REQ-VEL-008 | If a key holds more than the configured capacity of events, then the system shall drop the oldest and set Overflowed for that key. | TEST-VEL-008 |
| REQ-VEL-009 | When Reset(key) is called, the system shall remove all state of that key and clear its Overflowed flag. | TEST-VEL-009 |

## Assumptions / risks: boundary (T-W) exclusive is the single policy; out-of-order handled by sorted insert (TEST-VEL-007).
