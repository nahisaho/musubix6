---
feature: replication
tier: T2
---
# replication
Goal: Raft log replication and commit for a Leader and its Followers: AppendEntries, nextIndex/matchIndex, commit and apply. Non-goals: snapshots, batching limits beyond 64 entries, read-index.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REPL-001 | When a node becomes Leader, the system shall initialise nextIndex=lastIdx+1 and matchIndex=0 per peer, send AppendEntries to every peer immediately and then every Heartbeat ticks while Leader. | TEST-REPL-001 |
| REQ-REPL-002 | When Propose(cmd) is called on the Leader, the system shall append the entry in the current term, replicate it and return its index; on a non-Leader it shall return ErrNotLeader and not touch the log. | TEST-REPL-002 |
| REQ-REPL-003 | If AppendEntries carries an older term, then the system shall reply Success=false with its own term and leave its log untouched. | TEST-REPL-003 |
| REQ-REPL-004 | If a Follower rejects AppendEntries on prev mismatch, then the Leader shall decrement nextIndex for that peer (not below 1) and resend from there immediately. | TEST-REPL-004 |
| REQ-REPL-005 | When AppendEntries passes the prev check, the system shall merge the entries (truncating conflicts only) and reply Success with Match=PrevIdx+len(Entries). | TEST-REPL-005 |
| REQ-REPL-006 | When a successful AppendResp arrives, the Leader shall set matchIndex=Match and nextIndex=Match+1 for that peer. | TEST-REPL-006 |
| REQ-REPL-007 | When a majority (Leader included) holds an index above commitIndex, the Leader shall advance commitIndex to the highest such index. | TEST-REPL-007 |
| REQ-REPL-008 | When a Follower accepts AppendEntries, the system shall set commitIndex to min(Commit, index of the last verified entry) and never lower it. | TEST-REPL-008 |
| REQ-REPL-009 | When commitIndex advances, the system shall call Apply once per index in ascending order and never twice for the same index. | TEST-REPL-009 |
| REQ-REPL-010 | When a valid AppendEntries (term not older) arrives, the system shall record the sender as Leader and restart the election timer; an older-term one shall not restart it. | TEST-REPL-010 |
| REQ-REPL-011 | When a Leader has no peers, the system shall commit and apply a proposed entry immediately. | TEST-REPL-011 |
| REQ-REPL-012 | If the highest majority-replicated index holds an entry from an earlier term than the current term, then the Leader shall not advance commitIndex to it by counting replicas; it shall commit it only once an entry of the current term at or above it is majority-replicated (Raft Figure 8). | TEST-REPL-012 |
| REQ-REPL-013 | If an AppendResp is from an older term, from a non-peer, or reports a Match below the recorded matchIndex, then the Leader shall ignore it (matchIndex and nextIndex never move backwards on a success, and an old-term reply never triggers backtracking). | TEST-REPL-013 |

## Design
Components: Leader state `next[peer]`, `match[peer]`, heartbeat timer; Follower path in `handleAppend`; shared `commit` + `applyTo` pair.
Per-peer replication state machine (Leader side):

| event | next[p] | match[p] | action |
| --- | --- | --- | --- |
| elected | lastIdx+1 | 0 | send AE(prev=next-1) |
| Propose | unchanged | unchanged | send AE to all |
| AppendResp ok (Match m) | m+1 | m | maybeCommit |
| AppendResp reject | max(1,next-1) | unchanged | resend |
| heartbeat tick | unchanged | unchanged | send AE |

Follower AppendEntries table: term<own → reject(own term); prev mismatch → reject; else merge, commit=min(leaderCommit,lastNew), reply ok.
Invariants: R1 0<=match<=lastIdx; R2 commitIndex non-decreasing; R3 applied<=commit; R4 entries applied exactly once in index order; R5 Leader never overwrites/truncates its own log; R6 commitIndex only moves to an index whose entry has term == current term.
## Assumptions / risks
Failure responses carry no hint, so backtracking is one entry per round trip (acceptable for the simulator). Bug fix (Figure 8): commit counting applies only to entries whose term equals the current term (R6), retired by TEST-REPL-012.
