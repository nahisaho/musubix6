---
feature: clock
tier: T1
---
# clock
Goal: deterministic fake clock (integer ticks) with ordered timers. Non-goals: real time, goroutines.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CLOCK-001 | When a clock is created, the system shall report Now()==0 and Pending()==0. | TEST-CLOCK-001 |
| REQ-CLOCK-002 | When Advance(d) is called with d>=0, the system shall move Now() forward by d. | TEST-CLOCK-002 |
| REQ-CLOCK-003 | If Advance is called with d<0, then the system shall return ErrNegative and leave Now() unchanged. | TEST-CLOCK-003 |
| REQ-CLOCK-004 | When Now() reaches a timer deadline (inclusive), the system shall fire the timer exactly once. | TEST-CLOCK-004 |
| REQ-CLOCK-005 | When timers share a deadline, the system shall fire them in creation order. | TEST-CLOCK-005 |
| REQ-CLOCK-006 | While a timer callback runs, the system shall report Now() equal to that timer's deadline. | TEST-CLOCK-006 |
| REQ-CLOCK-007 | When Stop is called on a pending timer, the system shall return true and never fire it; on a fired or stopped timer it shall return false. | TEST-CLOCK-007 |
| REQ-CLOCK-008 | When a callback schedules a timer due inside the current Advance window, the system shall fire it within the same Advance in deadline order. | TEST-CLOCK-008 |
| REQ-CLOCK-009 | When AfterFunc is called with d<=0, the system shall treat the deadline as Now() and fire it on the next Advance, including Advance(0). | TEST-CLOCK-009 |
