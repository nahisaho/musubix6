---
feature: vclock
tier: T2
approval: auto
---
# vclock
Goal: immutable vector clocks with a join-semilattice merge and causal comparison. Non-goals: dotted version vectors, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VCLOCK-001 | When increment(r) is called, the system shall return a new VClock whose entry for r is one higher and leave the original unchanged. | TEST-VCLOCK-001 |
| REQ-VCLOCK-002 | When get(r) is called for an unknown replica, the system shall return 0. | TEST-VCLOCK-002 |
| REQ-VCLOCK-003 | When merge(o) is called, the system shall return the pointwise maximum over the union of replicas. | TEST-VCLOCK-003 |
| REQ-VCLOCK-004 | The merge operation shall be commutative, associative and idempotent for every clock triple. | TEST-VCLOCK-004 |
| REQ-VCLOCK-005 | When compare(o) is called, the system shall return exactly one of "equal", "before", "after" or "concurrent". | TEST-VCLOCK-005 |
| REQ-VCLOCK-006 | Where an entry is 0, the system shall normalise it away so that VClock({"a":0}) equals VClock({}) and hashes equal. | TEST-VCLOCK-006 |
| REQ-VCLOCK-007 | If an entry is negative, non-integer, boolean or has an empty replica id, then the system shall raise ValueError. | TEST-VCLOCK-007 |
| REQ-VCLOCK-008 | When dominates(o) is called, the system shall return true iff compare(o) is "after" or "equal". | TEST-VCLOCK-008 |
| REQ-VCLOCK-009 | When to_dict is called, the system shall return a dict with keys in sorted order and from_dict shall round-trip it. | TEST-VCLOCK-009 |
| REQ-VCLOCK-010 | When prune(keep) is called, the system shall drop every replica not in keep and keep the rest unchanged. | TEST-VCLOCK-010 |
| REQ-VCLOCK-011 | If increment is called with n that is not a positive int, then the system shall raise ValueError and leave the clock unchanged (bug: increment(r, -1) silently decremented). | TEST-VCLOCK-011 |

## Design
Components: `crdt/vclock.py` with one frozen class `VClock` wrapping a tuple of sorted `(replica, count)` pairs (single canonical form, so == and hash are structural).

| Invariant | Statement | Enforced by |
| --- | --- | --- |
| I1 canonical | no zero counts, replicas sorted, ids non-empty str | constructor (001, 006, 007) |
| I2 lattice | merge is the least upper bound | 003, 004 |
| I3 total classification | compare returns one of 4 values; before/after antisymmetric | 005 |

| a vs b | a<=b everywhere | a>=b everywhere | result |
| --- | --- | --- | --- |
| equal | yes | yes | equal |
| a<b | yes | no | before |
| a>b | no | yes | after |
| incomparable | no | no | concurrent |

## Assumptions / risks
Counts are Python ints (unbounded); bool is rejected because True==1 would silently pass int checks (TEST-VCLOCK-007).
