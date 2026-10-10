---
feature: election
tier: T2
---
# election
Goal: Raft leader election for one node: terms, votes, deterministic randomized timeouts, role transitions. Non-goals: membership change, pre-vote, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ELECT-001 | When a node is created, the system shall be Follower in term 0 with no vote and no known leader. | TEST-ELECT-001 |
| REQ-ELECT-002 | The system shall provide Timeout(seed,id,k,min,max), a pure deterministic value in [min,max] inclusive (min when min>=max) that varies with seed, id and k. | TEST-ELECT-002 |
| REQ-ELECT-003 | When the election timer fires on a Follower, the system shall become Candidate, increment the term, vote for itself and send RequestVote{Term,Candidate,LastIdx,LastTerm} to every peer. | TEST-ELECT-003 |
| REQ-ELECT-004 | When RequestVote arrives, the system shall grant the vote iff the request term is not older than the node's term, the node has no vote or voted for that candidate in this term, and the candidate log is at least as up-to-date; it shall reply VoteResp{Term,Granted}. | TEST-ELECT-004 |
| REQ-ELECT-005 | When any message carries a higher term, the system shall adopt that term, become Follower, clear its vote and forget the leader before processing it. | TEST-ELECT-005 |
| REQ-ELECT-006 | If a RequestVote carries an older term, then the system shall reply Granted=false with its own term and keep its state. | TEST-ELECT-006 |
| REQ-ELECT-007 | When a Candidate holds votes from a majority of the cluster (self included), the system shall become Leader. | TEST-ELECT-007 |
| REQ-ELECT-008 | When a vote is granted, the system shall restart the election timer; a rejected vote shall not restart it. | TEST-ELECT-008 |
| REQ-ELECT-009 | If a Candidate does not win before its timer fires, then the system shall start a new election in term+1 with a fresh vote tally. | TEST-ELECT-009 |
| REQ-ELECT-010 | When a Candidate receives AppendEntries with a term not older than its own, the system shall become Follower of that leader. | TEST-ELECT-010 |
| REQ-ELECT-011 | If a VoteResp is older than the current term, is from a non-peer, or repeats a voter already counted, then the system shall not count it. | TEST-ELECT-011 |
| REQ-ELECT-012 | When a node has no peers, the system shall become Leader at its first election timeout. | TEST-ELECT-012 |

## Design
Components: `Node` (role, term, votedFor, leader, votes set, election timer, k counter), pure `Timeout` (splitmix64 of seed,id,k), `Step(from,msg)` dispatcher.
Role transition table (Step/timer events):

| from | event | to | side effects |
| --- | --- | --- | --- |
| Follower | election timeout | Candidate | term++, votedFor=self, votes={self}, broadcast RequestVote, rearm timer |
| Candidate | election timeout | Candidate | term++, votes={self}, broadcast, rearm |
| Candidate | majority votes | Leader | leader=self (heartbeats in replication) |
| Candidate/Leader | msg.term > term | Follower | term=msg.term, votedFor=none |
| Candidate | AppendEntries term>=term | Follower | leader=from |
| Follower | granted vote | Follower | rearm timer |

Invariants: E1 term never decreases; E2 at most one votedFor per term; E3 Leader only after majority in its own term; E4 votes cleared only on term change.
Majority = floor((peers+1)/2)+1.
## Assumptions / risks
Reply to a higher-term RequestVote is evaluated after the term bump (so a stale votedFor never blocks it): TEST-ELECT-005. Timer re-arm draws the next k each time, so a granted vote also advances k.
