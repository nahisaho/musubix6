---
feature: network
tier: T2
---
# network
Goal: deterministic fake network delivering messages through the fake clock, with latency, per-link FIFO, partitions, cuts and down nodes. Non-goals: duplication, reordering, bandwidth.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NET-001 | When Send(from,to,p) targets a registered node and the link is open, the system shall deliver Msg{From,To,Payload} to its handler exactly at now+latency and return true. | TEST-NET-001 |
| REQ-NET-002 | If the destination is not registered, then Send shall return false and count the message as dropped. | TEST-NET-002 |
| REQ-NET-003 | While latency changes between sends, the system shall keep delivery order FIFO per directed link (deliver time never earlier than the previous message on that link). | TEST-NET-003 |
| REQ-NET-004 | While a partition is active, Send between different groups shall return false and be dropped; nodes not listed in any group shall be isolated; a node may always send to itself. | TEST-NET-004 |
| REQ-NET-005 | When Heal is called, the system shall remove all partitions and cuts (down nodes stay down). | TEST-NET-005 |
| REQ-NET-006 | When Cut(a,b) is called, the system shall block only the a→b direction until Restore(a,b). | TEST-NET-006 |
| REQ-NET-007 | When SetLatency(a,b,d) is called, the system shall use d for that directed link only; d<0 is clamped to 0. | TEST-NET-007 |
| REQ-NET-008 | While a node is down, Send from or to it shall return false and be dropped; SetDown(id,false) restores it. | TEST-NET-008 |
| REQ-NET-009 | The system shall keep Sent == Delivered + Dropped + InFlight at all times, counting every Send call in Sent. | TEST-NET-009 |
| REQ-NET-010 | While a message is in flight and at delivery time its link is blocked (partition, Cut, or either endpoint down), the system shall drop it and count it as dropped; if the link was healed before delivery it shall be delivered. | TEST-NET-010 |

## Design
Components: `Net` owns handler map, `reach(from,to)` predicate and per-link state `{latency, lastDeliver}`; delivery is a `clock.AfterFunc`.
Link decision table (evaluated at Send, in order):

| # | condition | outcome |
| --- | --- | --- |
| 1 | from==to and registered | deliver (loopback ignores partition/cut) |
| 2 | dst unregistered | drop |
| 3 | from or to down | drop |
| 4 | Cut(from,to) | drop |
| 5 | partition active and group(from)!=group(to) (unlisted = own group) | drop |
| 6 | otherwise | deliver at max(now+latency(from,to), lastDeliver(link)) |
| 7 | at delivery time rows 3-5 re-evaluated (loopback exempt) | drop if blocked (bug fix NET-010) |

Invariants: I1 Sent==Delivered+Dropped+InFlight; I2 per-link deliver times non-decreasing; I3 same-time deliveries keep Send order (clock creation order).
## Assumptions / risks
Handlers may call Send re-entrantly: covered by clock nested-schedule (TEST-CLOCK-008). Reachability was decided at Send only in v1; bug found by sim review: in-flight messages crossed new partitions. Retired by TEST-NET-010.
