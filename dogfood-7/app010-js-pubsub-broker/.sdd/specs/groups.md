---
feature: groups
tier: T2
approval: auto
---
# Groups
Goal: Deterministic consumer-group ownership. Non-goals: cooperative/network rebalancing.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GROUPS-001 | When a member joins a group with valid subscriptions, the broker shall create membership and rebalance. | TEST-GROUPS-001 |
| REQ-GROUPS-002 | If a member/group/subscription is invalid or duplicated, the broker shall reject without rebalancing. | TEST-GROUPS-001 |
| REQ-GROUPS-003 | When rebalancing, the broker shall assign each partition exactly once to sorted eligible members in round-robin order. | TEST-GROUPS-002 |
| REQ-GROUPS-004 | When a new member joins, the broker shall increment generation and fence old assignment tokens. | TEST-GROUPS-002 |
| REQ-GROUPS-005 | When a member leaves, the broker shall redistribute partitions and increment generation. | TEST-GROUPS-003 |
| REQ-GROUPS-006 | While a group is empty, the broker shall retain its generation and offset namespace for later joins. | TEST-GROUPS-003 |
| REQ-GROUPS-007 | When inspecting membership, the broker shall return snapshots unaffected by caller mutations. | TEST-GROUPS-004 |
| REQ-GROUPS-008 | When validating access, the broker shall reject unknown groups/members, stale generations and unowned partitions. | TEST-GROUPS-004 |
## Design
Groups own members, generation and assignment maps; tokens are group/member/generation tuples.
Eligible members are sorted per topic; every rebalance resets local cursors through generation fencing.
## Assumptions / risks
Subscriptions are fixed at join; a leave/rejoin is required to change them.
UTF-16 lexicographic sorting is explicit and deterministic; no locale-dependent comparisons.
