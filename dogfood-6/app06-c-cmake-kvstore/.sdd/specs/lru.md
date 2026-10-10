---
feature: lru
tier: T2
approval: auto
---
# lru
Goal: capacity-bounded cache evicting the least recently used entry, built on hashtable. Non-goals: weighting by value size.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LRU-001 | If capacity is 0, then lru_new shall return NULL; otherwise it shall return an empty cache. | TEST-LRU-001 |
| REQ-LRU-002 | When lru_put inserts a new key, the system shall make that entry the most recently used. | TEST-LRU-002 |
| REQ-LRU-003 | When lru_put would make the entry count exceed capacity, the system shall evict the least recently used entry from list and table. | TEST-LRU-003 |
| REQ-LRU-004 | When lru_get hits, the system shall promote the entry to most recently used. | TEST-LRU-004 |
| REQ-LRU-005 | When lru_put overwrites an existing key, the system shall promote it and shall not evict anything. | TEST-LRU-005 |
| REQ-LRU-006 | When lru_del removes a key, the system shall unlink it from the list and the table. | TEST-LRU-006 |
| REQ-LRU-007 | When an entry is evicted, the system shall invoke the registered eviction callback with its key before freeing it. | TEST-LRU-007 |

## Design
- Components: lru_t {ht_t *ht; head (MRU), tail (LRU); cap; on_evict, ctx}; list links live inside ht_entry_t (lru_prev/lru_next).
- Data flow: put -> ht_put -> link at head -> if count>cap evict tail via callback then ht_del. get -> ht_get -> move to head.
- Decisions: list manipulation is the only writer of lru_prev/next; an overwrite reuses the entry (ht_put returns the same entry) so links stay consistent; evict callback runs before free so the store can observe the key.
- State table: n<cap -> n==cap -> put new => evict tail (n stays cap).
## Assumptions / risks
- ht_put overwrite keeps the same ht_entry_t pointer: TEST-LRU-005.
