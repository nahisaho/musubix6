---
feature: life
tier: T2
approval: auto
---
# Lifecycle
Goal: deterministic container state machine.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LIFE-001 | When created, a container shall start in created state and reject an empty ID. | TEST-LIFE-001 |
| REQ-LIFE-002 | When a legal action is applied, the container shall transition according to the matrix below. | TEST-LIFE-001 |
| REQ-LIFE-003 | If an action is illegal, state and events shall remain unchanged. | TEST-LIFE-001 |
| REQ-LIFE-004 | While not running, the container shall reject execution. | TEST-LIFE-001 |
| REQ-LIFE-005 | When running, execution shall charge the cgroup and enforce its limits. | TEST-LIFE-001 |
| REQ-LIFE-006 | When stopped, the container shall release all resource usage. | TEST-LIFE-001 |
| REQ-LIFE-007 | When a transition succeeds, the container shall append one destination-state event. | TEST-LIFE-001 |
| REQ-LIFE-008 | When created, the container shall copy argument and environment slices. | TEST-LIFE-001 |
## Design
Matrix: created=start:running,delete:deleted; running=pause:paused,stop:stopped;
paused=resume:running,stop:stopped; stopped=start:running,delete:deleted; deleted=none.
All unspecified state/action pairs reject. Matrix is the source of truth; tests enumerate every cell.
Container mutex serializes actions and execution; callers must not mutate exported fields concurrently.
## Assumptions / risks
No external processes. Stop is reversible within the simulation; delete only marks in-memory state.
