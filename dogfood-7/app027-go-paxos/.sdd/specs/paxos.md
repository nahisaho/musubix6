---
feature: paxos
tier: T2
approval: auto
---
# Multi-Paxos
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PAXOS-001 | When receiving a higher prepare ballot, an acceptor shall promise it and report accepted slots. | TEST-PAXOS-001 |
| REQ-PAXOS-002 | If a ballot is below the promise, prepare and accept shall reject it. | TEST-PAXOS-001 |
| REQ-PAXOS-003 | When a leader wins phase one, it shall recover the highest accepted value for each slot. | TEST-PAXOS-001 |
| REQ-PAXOS-004 | When a stable leader proposes subsequent slots, it shall reuse its ballot without phase one. | TEST-PAXOS-001 |
| REQ-PAXOS-005 | When phase two gets quorum acknowledgments, the cluster shall choose exactly one value per slot. | TEST-PAXOS-001 |
| REQ-PAXOS-006 | If communication lacks quorum, proposals shall fail without a chosen entry. | TEST-PAXOS-001 |
| REQ-PAXOS-007 | When jointly reconfiguring, the cluster shall bind each transition slot to its old or joint quorum and fence prior ballots before new stable proposals. | TEST-PAXOS-001 |
| REQ-PAXOS-008 | When a node restarts, its durable promises and accepted values shall remain intact. | TEST-PAXOS-001 |
| REQ-PAXOS-009 | If a same-ballot same-slot accept conflicts with the stored value, the acceptor shall reject it while accepting identical retransmissions. | TEST-PAXOS-002 |
## Design
Acceptor promises and accepted log are persistent in-memory state, separated from live leader state.
Cluster drives request/reply messages through net.Network, quorum.Config validates identities.
Leader phase one adopts max accepted ballots; no-op fills gaps, sequential chosen prefix activates configuration.
The simulator coordinator owns one active leader and serializes membership barriers; finalization raises durable promises on every provisioned node before returning.
## Assumptions
Crash/restart spike is modeled by clearing volatile leader only, not memory loss.
Only simulator-authenticated messages are used. Configuration entries are reserved internal values.
Membership starts with all potential nodes provisioned; network delays are finite unless partitioned.
This simulator is not decentralized membership discovery: callers submit through the active coordinator only.
