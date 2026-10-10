---
feature: queue
tier: T2
approval: auto
---
# Ready queue
Goal: stable, delayed, priority-aware work selection. Non-goals: persistent broker.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUEUE-001 | When eligible jobs differ in priority, pop shall return highest priority first. | TEST-QUEUE-001 |
| REQ-QUEUE-002 | When priorities tie, pop shall order by due time then insertion sequence. | TEST-QUEUE-002 |
| REQ-QUEUE-003 | When a high-priority future job exists, it shall not block lower-priority ready work. | TEST-QUEUE-003 |
| REQ-QUEUE-004 | When duplicate pending IDs are pushed, the original job shall remain unchanged. | TEST-QUEUE-004 |
| REQ-QUEUE-005 | When cancelling pending work, it shall disappear and cancellation shall be idempotent. | TEST-QUEUE-005 |
| REQ-QUEUE-006 | When an ID is reused after removal, stale heap entries shall not cancel or duplicate new work. | TEST-QUEUE-006 |
| REQ-QUEUE-007 | When inspecting queue size, it shall count live delayed and ready jobs only. | TEST-QUEUE-007 |
| REQ-QUEUE-008 | If ID, priority, or due instant is invalid, push shall fail before mutation. | TEST-QUEUE-008 |
| REQ-QUEUE-009 | If pop receives an instant earlier than its last query, the queue shall reject it without removing work. | TEST-QUEUE-009 |
## Design
Delayed min-heap promotes due work into a priority heap; each insertion gets a generation number.
An authoritative ID map validates stale entries; RLock protects push/pop/cancel/size.
## Assumptions / risks
Higher numeric priority wins; UTC due times are normalized; popped IDs may be reused.
Query time is monotonically nondecreasing, including queries on empty queues.
Generation comparison prevents ABA when cancelling and immediately reusing an ID.
