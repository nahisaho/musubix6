---
feature: window
tier: T2
---
# window
Goal: thread-safe sliding-window-log limiter. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WINDOW-001 | If limit <= 0 or window <= 0, then New shall return ErrInvalidConfig. | TEST-WINDOW-001 |
| REQ-WINDOW-002 | When Allow is called, the system shall admit it only if fewer than limit events were admitted in the trailing window. | TEST-WINDOW-002 |
| REQ-WINDOW-003 | When an admitted event is older than the window, the system shall stop counting it. | TEST-WINDOW-003 |
| REQ-WINDOW-004 | When Remaining is called, the system shall return limit minus the count of events in the trailing window. | TEST-WINDOW-004 |
| REQ-WINDOW-005 | While many goroutines call Allow concurrently, the system shall never admit more than limit events in one window. | TEST-WINDOW-005 |
| REQ-WINDOW-006 | When Reset is called, the system shall forget all recorded events. | TEST-WINDOW-006 |
| REQ-WINDOW-007 | When an admitted event is exactly one window old, the system shall treat it as expired (bug fix: boundary was inclusive). | TEST-WINDOW-007 |

## Design
- Component: `window.Window` with mutex and a slice of admitted timestamps (ascending).
- Data flow: evict(now) drops timestamps older than now-window, then count/append.
- Decision: log (not counters) for exactness; memory bounded by limit.
## Assumptions / risks
- Boundary semantics of "older than" must be pinned by a test.
