---
feature: orset
tier: T2
approval: auto
---
# orset
Goal: observed-remove set with unique add tags; concurrent add beats remove. Non-goals: tombstone-free OR-set (dotted).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ORSET-001 | When add(e) is called, the system shall create a fresh tag (replica, seq) with seq strictly increasing per replica. | TEST-ORSET-001 |
| REQ-ORSET-002 | While an element has at least one tag not in the tombstone set, the system shall report it as a member. | TEST-ORSET-002 |
| REQ-ORSET-003 | When remove(e) is called, the system shall tombstone only the tags observed locally for e. | TEST-ORSET-003 |
| REQ-ORSET-004 | When an add and a remove of the same element are concurrent, the system shall keep the element after merge (add wins). | TEST-ORSET-004 |
| REQ-ORSET-005 | If remove(e) is called for a non-member, then the system shall change nothing and return False. | TEST-ORSET-005 |
| REQ-ORSET-006 | When an element is re-added after removal, the system shall report it as a member again. | TEST-ORSET-006 |
| REQ-ORSET-007 | The merge operation shall be the union of adds and of tombstones, commutative, associative and idempotent. | TEST-ORSET-007 |
| REQ-ORSET-008 | When state containing the local replica's own tags is merged in, the system shall advance the local seq so a tag is never reused. | TEST-ORSET-008 |
| REQ-ORSET-009 | When compact is called, the system shall drop tombstoned add tags without changing the observable members. | TEST-ORSET-009 |
| REQ-ORSET-011 | When to_dict is called, the system shall emit a canonical dict and from_dict(data, replica) shall round-trip adds, tombstones and seq. | TEST-ORSET-011 |
| REQ-ORSET-010 | When context is called, the system shall return a VClock of the highest seq seen per replica. | TEST-ORSET-010 |
| REQ-ORSET-012 | When canonical is called, the system shall return the replica-independent state (adds and tombstones, no local seq) so that converged replicas yield equal values. | TEST-ORSET-012 |

## Design
Components: `crdt/orset.py` `ORSet(replica)`: `_adds: dict[elem, set[tag]]`, `_removed: set[tag]`, `_seq: int`; `context()` builds a `crdt.vclock.VClock` (cross-feature dependency on vclock).

| Invariant | Statement | Enforced by |
| --- | --- | --- |
| I1 unique tags | (replica, seq) never issued twice by one replica, even after merging its own old state | 001, 008 |
| I2 observed remove | remove tombstones only tags in the local adds map | 003, 004 |
| I3 monotone | _adds tags and _removed only grow except in compact (adds minus removed) | 007, 009 |
| I5 replica-independent view | canonical() omits the local seq, so two replicas holding the same adds/tombstones compare equal | 012 |
| I4 membership | e member iff adds[e] - removed is non-empty | 002 |

| scenario | A | B | merged |
| --- | --- | --- | --- |
| concurrent add/remove | remove(e) of tag t1 | add(e) tag t2 | member (t2 live) |
| remove then merge old | remove t1 | stale copy with t1 | not member |
| re-add | add t3 after remove t1 | - | member |

## Assumptions / risks
Elements must be hashable and JSON-friendly (str/int); tombstones grow until compact is called after full sync.
