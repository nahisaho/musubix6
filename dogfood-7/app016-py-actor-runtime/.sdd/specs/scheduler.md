---
feature: scheduler
tier: T2
approval: auto
---
# Scheduler
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SCHEDULER-001 | When actors are spawned, duplicate names shall be rejected. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-002 | When send targets an unknown actor, it shall return False. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-003 | When ready actors compete, turns shall follow spawn-order round robin. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-004 | When step executes, it shall consume at most one message. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-005 | When no actor is ready, step shall return False. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-006 | When run reaches its limit, it shall preserve remaining messages. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-007 | When an actor stops, further sends shall fail and pending work shall be discarded. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-008 | When a turn completes, tick and trace shall record its actor and message. | TEST-SCHEDULER-001 |
| REQ-SCHEDULER-009 | When the last actor spawns a ready actor, that actor shall get the next turn before the cursor wraps. | TEST-SCHEDULER-002 |
## Design
Runtime holds insertion-ordered actors and a rotating cursor; handlers receive runtime, self name, and payload.
State table: alive -> stopped by stop; alive -> failed by exception; stopped/failed cannot receive.
## Assumptions / risks
Handlers execute atomically; self-sends enqueue a future turn. Spike validates reproducible ordering.
