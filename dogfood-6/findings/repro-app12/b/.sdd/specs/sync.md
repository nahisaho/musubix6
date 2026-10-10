---
feature: sync
tier: T2
approval: auto
---
# sync
Goal: anti-entropy between named-CRDT stores using digests, state exchange and a gossip driver over a partitionable network. Non-goals: real transport, delta-state encoding, membership.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SYNC-001 | When mutate(name, fn) is called, the system shall apply fn to the named object and tick the store clock for the local replica once. | TEST-SYNC-001 |
| REQ-SYNC-002 | If mutate is called for an unregistered name, then the system shall raise KeyError without ticking the clock. | TEST-SYNC-002 |
| REQ-SYNC-003 | When digest is called, the system shall return a per-name hash that is independent of registration order and changes when state changes. | TEST-SYNC-003 |
| REQ-SYNC-004 | When diff(a, b) is called, the system shall return the sorted names missing on either side or with differing digests. | TEST-SYNC-004 |
| REQ-SYNC-005 | When sync_pair(a, b) is called, the system shall merge both directions so both digests are equal and return the number of names transferred. | TEST-SYNC-005 |
| REQ-SYNC-006 | When a name exists on only one store, the system shall create it on the other from the received kind and data. | TEST-SYNC-006 |
| REQ-SYNC-007 | When sync_pair completes, the system shall set both store clocks to the merge of the two clocks. | TEST-SYNC-007 |
| REQ-SYNC-008 | If a name has different kinds on the two stores, then the system shall raise SyncError and leave both stores unchanged. | TEST-SYNC-008 |
| REQ-SYNC-009 | When sync_pair is repeated with no new mutation, the system shall return 0. | TEST-SYNC-009 |
| REQ-SYNC-010 | While two stores are in different network partitions, sync shall raise PartitionError; after heal it shall succeed. | TEST-SYNC-010 |
| REQ-SYNC-011 | When run_until_converged(net, rng, max_rounds) is called, the system shall run seeded gossip rounds and return the round count, or None when not converged within max_rounds. | TEST-SYNC-011 |
| REQ-SYNC-012 | When stores diverge only through register without mutate, the system shall still sync them (the clock fast path shall not hide state differences). | TEST-SYNC-012 |

## Design
Components: `crdt/sync.py` — `Store(replica)` holds `_objs: name -> (kind, crdt)` and a `VClock`; `Network(stores)` holds partition groups; kinds registry maps kind -> class (gcounter, pncounter, lwwmap, orset), each with `to_dict`/`from_dict(data, replica)`/`merge`. Depends on vclock, counters, lwwmap, orset.

| Invariant | Statement | Enforced by |
| --- | --- | --- |
| I1 atomic | kind check of all names happens before any merge | 008 |
| I2 digest canonical | sha256 of sorted-key JSON of (kind, to_dict) | 003 |
| I3 clock monotone | clock only grows (tick or merge) | 001, 007 |
| I4 skip only when safe | a skip optimisation never hides differing digests | 009, 012 |
| I5 convergence | after pairwise sync of all pairs all digests equal | 005, 011 |

| Event | Precondition | Result |
| --- | --- | --- |
| mutate | name registered | object changed, clock[r]+1 |
| mutate | name unknown | KeyError, no tick |
| sync_pair | same partition, kinds agree | both merged, count of changed names |
| sync_pair | kinds disagree | SyncError, nothing changed |
| sync_pair | different partitions | PartitionError |
| heal | any | one group |

## Assumptions / risks
Each store owns a unique replica id; CRDT objects inside a store use that same replica id.
