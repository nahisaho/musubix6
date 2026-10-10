---
feature: cache
tier: T2
approval: auto
---
# Content-hash cache
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CACHE-001 | When JSON values with reordered object keys are hashed, the cache shall produce equal SHA-256 hashes. | TEST-CACHE-001 |
| REQ-CACHE-002 | When array order or primitive type differs, the hash shall differ. | TEST-CACHE-002 |
| REQ-CACHE-003 | If values contain cycles, non-finite numbers or unsupported values, then hashing shall reject them. | TEST-CACHE-003 |
| REQ-CACHE-004 | When a key is requested, the cache shall distinguish a stored null from a miss. | TEST-CACHE-004 |
| REQ-CACHE-005 | When artifacts are inserted or retrieved, the cache shall defensively copy JSON values. | TEST-CACHE-005 |
| REQ-CACHE-006 | When capacity is exceeded, the cache shall evict the least recently used key. | TEST-CACHE-006 |
| REQ-CACHE-007 | When a build key is generated, version, node ID and dependency-ID/hash pairs sorted by ID shall contribute to it. | TEST-CACHE-007 |
| REQ-CACHE-008 | When entries are deleted or cleared, the cache shall update hit/miss/size statistics consistently. | TEST-CACHE-008 |
| REQ-CACHE-009 | If an array contains holes, then canonical hashing shall reject it rather than collide with an empty array. | TEST-CACHE-009 |
| REQ-CACHE-010 | When optional artifact metadata is cached, the cache shall copy it on insertion, hits and transactional publication. | TEST-CACHE-010 |
## Design
Canonical JSON encoder rejects lossy inputs; hash uses node:crypto SHA-256; artifacts remain memory-only.
Map insertion order implements LRU; hit refreshes recency, stored values are copied on both boundaries.
## Assumptions
JSON object own enumerable string keys are supported; repeated references are allowed but cycles are rejected.
Capacity is a positive integer; persisted disk cache and cross-process sharing are out of scope.
