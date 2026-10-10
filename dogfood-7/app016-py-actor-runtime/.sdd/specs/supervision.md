---
feature: supervision
tier: T2
approval: auto
---
# Supervision
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SUPERVISION-001 | When one-for-one restarts, only the failed child shall be recreated. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-002 | When one-for-all restarts, every child shall be recreated. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-003 | When rest-for-one restarts, failed and later children shall be recreated. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-004 | When a child is recreated, its handler shall be produced by its factory. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-005 | When restarting, mailboxes shall preserve pending messages. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-006 | When restart intensity exceeds its window limit, children shall suspend for parent recovery or stop on terminal root exhaustion. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-007 | If strategy is unknown or limits invalid, construction shall reject it. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-008 | When an exhausted supervisor has a parent, it shall escalate to that parent. | TEST-SUPERVISION-001 |
| REQ-SUPERVISION-009 | When a blocked actor restarts, its transient scheduling block shall clear. | TEST-SUPERVISION-002 |
| REQ-SUPERVISION-010 | When a strategy recreates a stopped sibling, its replacement mailbox shall accept new messages. | TEST-SUPERVISION-003 |
## Design
Supervisor owns ordered children and factories; runtime routes handler exceptions to their owner.
Sliding tick window counts failure events, not recreated child count. Parent escalation suspends the subtree without discarding queues.
Successful recreation transitions failed/suspended children to alive; terminal root exhaustion stops and discards queues. Queue preservation applies only to successful restart.
Explicitly stopped children may be recreated by a sibling failure strategy with a fresh empty mailbox; terminal root exhaustion cannot recover.
## Assumptions / risks
Factories must return callable handlers. Supervisor children may be actors or supervisors; recreation of a subtree resets its budget.
