---
feature: memtable
tier: T2
approval: auto
---
# memtable
Goal: an in-memory multi-version ordered map (skiplist) holding puts and tombstones keyed by (user key asc, seq desc). Non-goals: concurrency, persistence, WAL.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MEM-001 | When put(key,value,seq) is called, get(key) shall return state Found with that value. | TEST-MEM-001 |
| REQ-MEM-002 | When a key is put twice with increasing seq, get shall return the newer value and both versions shall be retained (entry_count counts both). | TEST-MEM-002 |
| REQ-MEM-003 | When del(key,seq) is called, get(key) shall return state Deleted (distinct from NotFound); a later put shall make it Found again. | TEST-MEM-003 |
| REQ-MEM-004 | If a key was never written, then get shall return state NotFound (including on an empty memtable). | TEST-MEM-004 |
| REQ-MEM-005 | When get(key, snapshot) is called, the system shall return the newest version with seq <= snapshot, or NotFound when none is visible. | TEST-MEM-005 |
| REQ-MEM-006 | The entries() sequence shall be ordered by user key ascending then seq descending, independent of insertion order. | TEST-MEM-006 |
| REQ-MEM-007 | When seek(key) is called, the iterator shall point at the first entry whose user key >= key (newest version first), or at end when none exists. | TEST-MEM-007 |
| REQ-MEM-008 | When an entry is inserted, approximate_bytes shall grow by key.size()+value.size()+32 and shall never decrease. | TEST-MEM-008 |
| REQ-MEM-009 | If seq is not strictly greater than max_seq(), then put/del shall throw std::invalid_argument and leave the memtable unchanged. | TEST-MEM-009 |
| REQ-MEM-010 | The skiplist shall have height in [1,12], every upper level sorted and a subsequence of the level below (check_invariants), and be reproducible for a fixed seed. | TEST-MEM-010 |
| REQ-MEM-011 | When freeze() is called, subsequent put/del shall throw std::logic_error while reads keep working; freeze is idempotent. | TEST-MEM-011 |
| REQ-MEM-012 | The system shall accept empty keys, empty values and keys containing NUL bytes, ordered bytewise. | TEST-MEM-012 |

## Design
Components: `types.hpp` (Entry, ValueType, LookupResult, internal-key comparator) and `memtable.hpp` (MemTable over an arena-less skiplist, nodes owned by unique_ptr in a vector). Data flow: put/del -> check state+seq -> choose height from xorshift PRNG (p=1/4, max 12) -> splice at every level.

| State | put/del | get/seek/entries | freeze |
| --- | --- | --- | --- |
| Active | ok (seq > max_seq) | ok | -> Frozen |
| Frozen | throws logic_error | ok | no-op |

| Invariant | Enforced by |
| --- | --- |
| I1 level 0 strictly ordered by (key asc, seq desc) | splice position search |
| I2 level i+1 nodes subset of level i, same order | splice at each level <= node height |
| I3 max_seq strictly increases per insert | seq check before any mutation |
| I4 approximate_bytes monotone | only += in insert |

## Assumptions / risks
Single seed PRNG gives stable heights; retired by TEST-MEM-010 (height >= 3 at 2000 entries, invariants hold).
