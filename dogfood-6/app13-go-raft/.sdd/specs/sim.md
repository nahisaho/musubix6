---
feature: sim
tier: T2
---
# sim
Goal: deterministic cluster simulator wiring nodes, fake network and fake clock, advancing tick by tick while checking Raft safety invariants. Non-goals: crash-restart, membership change, real concurrency.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SIM-001 | When New(n,seed) is called, the system shall build n nodes with ids 0..n-1 wired through one network and clock at time 0, with no violations. | TEST-SIM-001 |
| REQ-SIM-002 | When Run(d) is called, the system shall advance the clock by exactly d ticks one tick at a time, and a healthy cluster shall elect exactly one Leader within 1000 ticks. | TEST-SIM-002 |
| REQ-SIM-003 | While running, the system shall record an election-safety violation if two different nodes are Leader in the same term. | TEST-SIM-003 |
| REQ-SIM-004 | When Propose(cmd) is called with a Leader, the system shall replicate it so that after Run every node applied the same sequence containing cmd. | TEST-SIM-004 |
| REQ-SIM-005 | If Propose is called while no node is Leader, then the system shall return ErrNoLeader. | TEST-SIM-005 |
| REQ-SIM-006 [test-only] | While a Leader is isolated in a minority partition, the system shall not commit its new entries and the majority side shall elect a Leader in a higher term. | TEST-SIM-006 |
| REQ-SIM-007 [test-only] | When a partition heals, the system shall converge: the old Leader steps down, uncommitted entries it accepted are discarded and all nodes apply identical sequences. | TEST-SIM-007 |
| REQ-SIM-008 | While running, the system shall record a log-matching violation if two logs hold the same (index,term) with different prefixes. | TEST-SIM-008 |
| REQ-SIM-009 | While running, the system shall record a state-machine-safety violation if two nodes applied different commands at the same index. | TEST-SIM-009 |
| REQ-SIM-010 | While running, the system shall record a leader-completeness violation if a Leader's log lacks an entry already applied by any node. | TEST-SIM-010 |
| REQ-SIM-011 | The system shall be deterministic: equal (n,seed,script) yield equal Trace() values and different seeds yield different Trace() values. | TEST-SIM-011 |
| REQ-SIM-012 [test-only] | When a randomized partition/propose/heal script runs for seeds 1..20 on 5 nodes, the system shall record no violations and converge to identical applied sequences after the final heal. | TEST-SIM-012 |

## Design
Components: `Cluster{clock, net, nodes, applied[id], committed[idx], termLeader[term], viol}`; `Run` loops `Advance(1)` then `check()`.
Constants: ElectionMin 150, ElectionMax 300, Heartbeat 50, latency 5 ticks.
Invariant table (checked after every tick):

| invariant | check | violation tag |
| --- | --- | --- |
| election safety | termLeader[t] set by first Leader seen in t; another id in t ⇒ violation | `election-safety` |
| log matching | for each node pair, at the highest index with equal terms the prefixes must be equal | `log-matching` |
| state machine safety | Apply(idx,e) vs committed[idx]: different cmd ⇒ violation | `state-machine-safety` |
| leader completeness | new Leader (first tick seen per term) must hold every committed[idx] | `leader-completeness` |

Leader() = Leader-role node with the highest term. Propose goes through Leader(); tests reach stale leaders through Node(id).
Trace = FNV-1a over (now,id,role,term,commit,lastIdx) each tick.
## Assumptions / risks
Violation tests forge state through Node(id).Log()/Step on an all-isolated network (spike: TEST-SIM-003/008/009/010 retire "the checkers never fire"). Cost O(n²·len) per tick is fine for n<=5.
