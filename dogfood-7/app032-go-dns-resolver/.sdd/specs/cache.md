---
feature: cache
tier: T2
approval: auto
---
# cache
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CACHE-001 | When storing positive data, the cache shall expire at the minimum record TTL. | TEST-CACHE-001 |
| REQ-CACHE-002 | When returning data, the cache shall age TTLs by elapsed whole seconds. | TEST-CACHE-001 |
| REQ-CACHE-003 | When caching a negative answer, the cache shall use min(SOA TTL, SOA minimum). | TEST-CACHE-002 |
| REQ-CACHE-004 | If a negative answer lacks SOA, the cache shall not store it. | TEST-CACHE-002 |
| REQ-CACHE-005 | When keying data, the cache shall normalise names and distinguish query types. | TEST-CACHE-003 |
| REQ-CACHE-006 | When callers mutate stored or returned data, the cache shall remain unchanged. | TEST-CACHE-003 |
| REQ-CACHE-007 | When capacity is exhausted, the cache shall evict the least recently used entry. | TEST-CACHE-004 |
| REQ-CACHE-008 | When accesses overlap, the cache shall remain race-free. | TEST-CACHE-004 |
## Design
A mutex guards an LRU list and map; immutable copies cross the cache boundary.
A caller-supplied clock makes TTL boundaries deterministic. Zero TTL is not cached.
## Assumptions
Capacity is positive; invalid capacity becomes one. NXDOMAIN and NODATA are cached per query type.
Spike: race-enabled standard-library builds and monotonic fake-clock tests run locally.
