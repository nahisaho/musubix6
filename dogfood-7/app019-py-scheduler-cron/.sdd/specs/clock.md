---
feature: clock
tier: T2
approval: auto
---
# Simulation clock
Goal: deterministic fake time and scheduled callbacks. Non-goals: real sleeping.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CLOCK-001 | When creating a clock, it shall normalize an aware instant to UTC and reject naive input. | TEST-CLOCK-001 |
| REQ-CLOCK-002 | When advancing, it shall move monotonically and reject negative durations. | TEST-CLOCK-002 |
| REQ-CLOCK-003 | When callbacks are due, it shall execute them in timestamp order at their scheduled instant. | TEST-CLOCK-003 |
| REQ-CLOCK-004 | When callbacks share a deadline, it shall preserve insertion order. | TEST-CLOCK-004 |
| REQ-CLOCK-005 | When cancelling a callback, it shall prevent execution and report idempotent cancellation. | TEST-CLOCK-005 |
| REQ-CLOCK-006 | When a callback schedules another due callback, the same advance shall execute it. | TEST-CLOCK-006 |
| REQ-CLOCK-007 | If a callback fails, time shall remain at its deadline and remaining callbacks shall remain pending. | TEST-CLOCK-007 |
| REQ-CLOCK-008 | If scheduling in the past or beyond the callback budget, the clock shall fail explicitly. | TEST-CLOCK-008 |
## Design
Heap entries are (UTC deadline, monotonic sequence, callback); cancellation is by sequence.
Advance drains events until a target with a callback budget; exceptions propagate without losing other events.
## Assumptions / risks
Callbacks are synchronous and may schedule at the current instant; budget prevents zero-time loops.
Runtime spike establishes aware datetime ordering and heap tie-breaking.
