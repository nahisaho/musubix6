---
feature: bloom
tier: T1
approval: auto
---
# bloom
Goal: a deterministic, serializable Bloom filter used by SSTables to skip negative lookups. Non-goals: counting/blocked filters, thread safety.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BLOOM-001 | When constructed with (n, p), the system shall size the filter to m = ceil(-n ln p / (ln 2)^2) bits rounded up to a multiple of 8 and k = max(1, round(m/n * ln 2)) hashes. | TEST-BLOOM-001 |
| REQ-BLOOM-002 | If n is 0 or p is not in the open interval (0,1), then the system shall throw std::invalid_argument. | TEST-BLOOM-002 |
| REQ-BLOOM-003 | When a key has been added, may_contain(key) shall return true (no false negatives). | TEST-BLOOM-003 |
| REQ-BLOOM-004 | While no key has been added, may_contain shall return false for every key. | TEST-BLOOM-004 |
| REQ-BLOOM-005 | When 1000 distinct keys are added at p=0.01, the observed false-positive rate over 10000 absent keys shall be below 3%. | TEST-BLOOM-005 |
| REQ-BLOOM-006 | When serialized and deserialized, the system shall yield a filter with identical bits, k and answers. | TEST-BLOOM-006 |
| REQ-BLOOM-007 | If serialized data has a bad magic, is truncated, or has trailing bytes, then deserialize shall throw lsm::FormatError. | TEST-BLOOM-007 |
| REQ-BLOOM-008 | When two filters with equal (m,k) are merged, the result shall contain the union of their keys; if (m,k) differ the system shall throw std::invalid_argument. | TEST-BLOOM-008 |
| REQ-BLOOM-009 | The key hash shall be FNV-1a 64-bit (stable across runs); the empty key shall be accepted. | TEST-BLOOM-009 |

## Assumptions
Double hashing h1 + i*h2 (h2 forced odd) is adequate for the 3% bound; retired by TEST-BLOOM-005.
