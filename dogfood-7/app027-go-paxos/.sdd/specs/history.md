---
feature: history
tier: T2
approval: auto
---
# Linearizability history checker
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HISTORY-001 | When a sequential register history is legal, Check shall return a legal witness. | TEST-HISTORY-001 |
| REQ-HISTORY-002 | When concurrent operations admit a legal order, Check shall search alternate orders. | TEST-HISTORY-001 |
| REQ-HISTORY-003 | If completed operations violate real-time precedence, Check shall reject the history. | TEST-HISTORY-001 |
| REQ-HISTORY-004 | If a get returns a value never permitted by the register model, Check shall reject it. | TEST-HISTORY-001 |
| REQ-HISTORY-005 | When checking CAS, the model shall validate both returned value and success bit. | TEST-HISTORY-001 |
| REQ-HISTORY-006 | When a pending operation is omitted, Check shall still accept a legal completed history. | TEST-HISTORY-001 |
| REQ-HISTORY-007 | If DFS exhausts its state budget, Check shall report unknown rather than illegal. | TEST-HISTORY-001 |
| REQ-HISTORY-008 | If operation identities duplicate or intervals are malformed, Check shall return an input error. | TEST-HISTORY-001 |
| REQ-HISTORY-009 | When completed intervals share equal boundary timestamps, Check shall impose only strict-before precedence and permit legal tied schedules. | TEST-HISTORY-002 |
| REQ-HISTORY-010 (deferred) | When large histories repeat model states, the checker shall memoize equivalent DFS branches. | — |
| REQ-HISTORY-011 (test-only) | When replaying the deterministic integration corpus across disjoint membership and leader changes, its register histories shall remain legal. | TEST-HISTORY-003 |
## Design
Bounded depth-first search over eligible calls, cloning model state for branches.
An operation is eligible only after every completed operation returning before its invocation.
Pending operations may be dropped or linearized with unconstrained responses; witness returns operation IDs.
## Assumptions
Integer timestamps and IDs are supplied by the harness, not synchronized wall clocks.
Histories are bounded to 63 operations; budget prevents exponential runaway.
Small concurrent histories are compared against hand-constructed legal and illegal schedules.
