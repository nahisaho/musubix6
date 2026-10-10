---
feature: net
tier: T2
approval: auto
---
# Deterministic simulated network
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NET-001 | When an event is sent, the network shall deliver it at virtual time plus delay. | TEST-NET-001 |
| REQ-NET-002 | When deadlines tie, the network shall preserve insertion order. | TEST-NET-001 |
| REQ-NET-003 | When a link is partitioned, the network shall drop delivery on that directed link. | TEST-NET-001 |
| REQ-NET-004 | When a link heals, the network shall deliver subsequent messages. | TEST-NET-001 |
| REQ-NET-005 | When a duplicate is requested, the network shall enqueue an independent copy. | TEST-NET-001 |
| REQ-NET-006 | When replaying the same schedule, the network shall emit identical traces. | TEST-NET-001 |
| REQ-NET-007 | When a budget is exhausted, Run shall leave undelivered events queued. | TEST-NET-001 |
| REQ-NET-008 | If delay is negative, Send shall reject it without mutating state. | TEST-NET-001 |
## Design
Single-threaded heap ordered by virtual deadline and sequence; callbacks may enqueue messages.
Partitions are checked at delivery, not enqueue. Payloads are immutable strings.
## Assumptions
Go heap and integer ordering spike exercised by net tests; no wall-clock or goroutines.
Directed partitions do not imply reverse-link failures; a dropped message consumes budget.
Trace includes drops, deliveries and virtual timestamps for exact replay.
