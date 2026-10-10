---
feature: store
tier: T2
approval: auto
---
# store
Goal: facade combining hashtable, ttl, lru and protocol into a key-value server core. Non-goals: persistence, networking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STORE-001 | If capacity is 0 or the clock is NULL, then store_new shall return NULL. | TEST-STORE-001 |
| REQ-STORE-002 | When a key is set, a later get shall return the stored value. | TEST-STORE-002 |
| REQ-STORE-003 | When a key with ttl is read at or after its deadline, the system shall report a miss and remove the entry. | TEST-STORE-003 |
| REQ-STORE-004 | When a key with ttl is read before its deadline, the system shall return the value. | TEST-STORE-004 |
| REQ-STORE-005 | When the store is full, the system shall evict the least recently used live key on set. | TEST-STORE-005 |
| REQ-STORE-006 | When the store is full and expired keys exist, the system shall remove expired keys before evicting a live key. | TEST-STORE-006 |
| REQ-STORE-007 | When store_handle receives a valid GET, SET or DEL frame, the system shall execute it and encode an OK or NOTFOUND response. | TEST-STORE-007 |
| REQ-STORE-008 | If store_handle receives an invalid frame, then the system shall return an error response and leave the store unchanged. | TEST-STORE-008 |
| REQ-STORE-009 | When store_feed receives several pipelined frames, the system shall execute every complete frame in order and report the bytes consumed. | TEST-STORE-009 |
| REQ-STORE-010 | When a key is overwritten without ttl, the system shall clear its earlier deadline. | TEST-STORE-010 |

## Design
- Components: store_t {lru_t *cache; kv_clock_t clock}; request path proto_parse -> store ops -> proto_encode_response. Entry values live in ht entries; lru list order maintained by lru module; expiry in entry->expires_at (ttl module).
- Data flow: set -> expires_at=ttl_expires_at -> if full: ttl_sweep (expired first) -> lru_put (evicts LRU) -> write expires_at. get -> lru_get -> ttl_is_expired? -> lru_del + miss.
- Decisions: expired keys are removed lazily on get and eagerly on a full set; sweep calls back into lru to unlink entries (store owns the unlinking callback). Errors never mutate state: parse fully precedes execution.
- Status codes: 0 OK, 1 NOTFOUND, 2 ERR. Single-threaded.
## Assumptions / risks
- Sweep via ht_remove_if must unlink lru list: TEST-STORE-006.
