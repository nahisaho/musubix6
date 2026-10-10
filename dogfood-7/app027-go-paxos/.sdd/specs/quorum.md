---
feature: quorum
tier: T2
approval: auto
---
# Joint membership quorum
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUORUM-001 | When constructing a stable configuration, it shall own a copy of its voter list. | TEST-QUORUM-001 |
| REQ-QUORUM-002 | If voters repeat or are empty, construction shall reject the configuration. | TEST-QUORUM-001 |
| REQ-QUORUM-003 | When stable votes form a strict majority, Has shall return true. | TEST-QUORUM-001 |
| REQ-QUORUM-004 | When stable votes are below majority, Has shall return false. | TEST-QUORUM-001 |
| REQ-QUORUM-005 | When joint votes form majorities of both old and new sets, Has shall return true. | TEST-QUORUM-001 |
| REQ-QUORUM-006 | If joint votes satisfy only one set, Has shall return false. | TEST-QUORUM-001 |
| REQ-QUORUM-007 | When a nonmember votes, it shall not count toward quorum. | TEST-QUORUM-001 |
| REQ-QUORUM-008 | When enumerating joint membership, Members shall return a sorted unique union. | TEST-QUORUM-001 |
## Design
Immutable Config with Old and optional New voter sets. Joint quorum is old-majority AND new-majority.
Membership is activated only after the replicated joint entry is chosen; finalization uses joint quorum.
## Assumptions
Integer identities are positive; runtime spike checks overlapping and disjoint quorums.
Callers cannot directly mutate private voter storage; Members returns a copy.
No Byzantine votes: sender identity is the simulator's node identity.
