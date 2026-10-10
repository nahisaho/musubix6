---
feature: hashtable
tier: T2
approval: auto
---
# hashtable
Goal: binary-safe chained hash table that grows automatically. Non-goals: thread safety, shrinking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HT-001 | When ht_new is called, the system shall return an empty table with count 0 and capacity 8. | TEST-HT-001 |
| REQ-HT-002 | When ht_put stores a new key, the system shall copy key and value and increase count by 1. | TEST-HT-002 |
| REQ-HT-003 | When ht_put stores an existing key, the system shall replace the value and keep count unchanged. | TEST-HT-003 |
| REQ-HT-004 | When ht_get is called, the system shall return the entry pointer for a present key and NULL for an absent key. | TEST-HT-004 |
| REQ-HT-005 | When ht_del is called, the system shall remove a present key and return 0, and return -1 for an absent key. | TEST-HT-005 |
| REQ-HT-006 | When count exceeds 75% of capacity after an insert, the system shall double capacity and keep every entry retrievable. | TEST-HT-006 |
| REQ-HT-007 | The system shall compare keys by length and bytes so keys with embedded NUL bytes are distinct. | TEST-HT-007 |
| REQ-HT-008 | If table or key is NULL, then ht_put shall return KV_EINVAL and leave the table unchanged. | TEST-HT-008 |
| REQ-HT-009 | When ht_remove_if is called, the system shall call on_remove then delete each entry matching the predicate and return the number removed. | TEST-HT-009 |

## Design
- Components: ht_t {buckets[], cap, count}; ht_entry_t is a chain node that also carries lru links (prev/next) and `expires_at` so ttl and lru modules extend entries without extra allocations.
- Data flow: hash(key,len) FNV-1a 32-bit -> bucket index = hash & (cap-1); cap is always a power of two.
- Decisions: resize when count*4 > cap*3; rehash relinks nodes (no copy, entry pointers stay valid across resize); on any failure the table is left unchanged.
- State table: empty(count=0) -> populated -> grown(cap*2); del never shrinks.
- Binary protocol keys can contain NUL, hence explicit lengths everywhere.
## Assumptions / risks
- Entry pointers stay stable across resize: retired by TEST-HT-006.
- FNV hash over length-delimited bytes: retired by TEST-HT-007.
