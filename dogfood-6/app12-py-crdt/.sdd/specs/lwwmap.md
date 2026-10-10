---
feature: lwwmap
tier: T2
approval: auto
---
# lwwmap
Goal: last-writer-wins map with tombstones and a deterministic total order. Non-goals: wall clock sync, causal ordering.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LWWMAP-001 | When set(key, value, ts) is called, the system shall store the entry stamped (ts, replica) and get(key) shall return the value. | TEST-LWWMAP-001 |
| REQ-LWWMAP-002 | When two replicas write the same key with different ts, the system shall keep the higher ts on merge. | TEST-LWWMAP-002 |
| REQ-LWWMAP-003 | When two writes have equal ts, the system shall keep the one with the greater replica id. | TEST-LWWMAP-003 |
| REQ-LWWMAP-004 | When delete(key, ts) is called, the system shall store a tombstone so get returns the default and keys excludes the key. | TEST-LWWMAP-004 |
| REQ-LWWMAP-005 | When a set and a delete race, the system shall resolve by (ts, replica) so a later set resurrects the key. | TEST-LWWMAP-005 |
| REQ-LWWMAP-006 | If a local write has a stamp not greater than the existing entry stamp, then the system shall ignore it and return False. | TEST-LWWMAP-006 |
| REQ-LWWMAP-007 | When entries have an identical stamp but differing content, the system shall prefer the tombstone, then the greater canonical JSON of the value. | TEST-LWWMAP-007 |
| REQ-LWWMAP-008 | The merge operation shall be commutative, associative and idempotent. | TEST-LWWMAP-008 |
| REQ-LWWMAP-009 | When gc(before_ts) is called, the system shall remove only tombstones with ts lower than before_ts and return how many were removed. | TEST-LWWMAP-009 |
| REQ-LWWMAP-010 | When items is called, the system shall return live key/value pairs sorted by key; to_dict/from_dict(data, replica) shall round-trip including tombstones. | TEST-LWWMAP-010 |
| REQ-LWWMAP-011 | If a key is not a str, then set and delete shall raise TypeError so that to_dict stays sortable (bug: mixed key types crashed to_dict). | TEST-LWWMAP-011 |

## Design
Components: `crdt/lwwmap.py` `LWWMap(replica)`; entry = `(ts:int, replica:str, deleted:bool, value)`.

| Invariant | Statement | Enforced by |
| --- | --- | --- |
| I1 total order | entries compare by (ts, replica, deleted, canonical json) so merge picks a unique max | 002,003,007,008 |
| I2 monotone local | a replica's local write to a key only accepted if its stamp exceeds the stored stamp | 006 |
| I3 tombstone retained | deleted entries stay until gc, otherwise a stale set would resurrect | 004,005,009 |

| existing \ incoming | set newer | set older | delete newer | delete older | identical stamp |
| --- | --- | --- | --- | --- | --- |
| set | take incoming | keep | take incoming | keep | tombstone wins, else greater JSON |
| delete | take incoming | keep | take incoming | keep | tombstone wins |

## Assumptions / risks
gc is unsafe if an older set is still in flight; callers choose before_ts below the minimum acknowledged stamp (documented; TEST-LWWMAP-009 shows the effect).
