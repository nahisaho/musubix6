---
feature: heuristic
tier: T2
approval: auto
---
# heuristic
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HFF-001 | When goals already hold, hFF shall return zero. | TEST-HFF-001 |
| REQ-HFF-002 | When a relaxed chain achieves the goal, hFF shall count its selected actions. | TEST-HFF-001 |
| REQ-HFF-003 | When one action achieves multiple goals, hFF shall count it once. | TEST-HFF-001 |
| REQ-HFF-004 | When computing relaxation, hFF shall ignore delete effects. | TEST-HFF-001 |
| REQ-HFF-005 | If relaxation reaches a fixed point without the goal, hFF shall return infinity. | TEST-HFF-002 |
| REQ-HFF-006 | When extracting a relaxed plan, hFF shall recursively support preconditions at earlier layers. | TEST-HFF-002 |
| REQ-HFF-007 | When computing hFF repeatedly, results shall be deterministic. | TEST-HFF-002 |
| REQ-HFF-008 | When computing relaxation, the system shall not mutate the input state. | TEST-HFF-002 |
## Design
Build monotonic fact layers and first achievers; regress unmet goals through selected actions.
hFF counts actions, is not admissible, and therefore is never the default optimal A* heuristic.
## Assumptions
Action order breaks achiever ties. Unit relaxed-plan counts intentionally ignore action costs.
