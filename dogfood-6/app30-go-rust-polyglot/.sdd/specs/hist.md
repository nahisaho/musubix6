---
feature: hist
tier: T2
---
# hist
Goal: Rust log-linear histogram (HDR-style, 8 sub-buckets per power of two) with merge, quantiles and sparse binary encoding.   Non-goals: float values, negative values.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HIST-001 | When bucket_index(v) is called, the system shall return 8*e+(v>>e) with e=max(0,bitlen(v)-4). | TEST-HIST-001 |
| REQ-HIST-002 | When bucket_bounds(i) is called, the system shall return inclusive bounds such that upper(i)+1==lower(i+1) and bucket_index maps both bounds back to i. | TEST-HIST-002 |
| REQ-HIST-003 | The system shall agree with every row of contract/vectors.tsv for bucket_index and bucket_bounds. | TEST-HIST-003 |
| REQ-HIST-004 | When record(v) is called, the system shall increment count, add v to sum (saturating) and update min and max. | TEST-HIST-004 |
| REQ-HIST-005 | When record_n(v,0) is called, the system shall leave the histogram unchanged. | TEST-HIST-005 |
| REQ-HIST-006 | When two histograms are merged, the system shall add bucket counts, count and sum, and the result shall be independent of merge order. | TEST-HIST-006 |
| REQ-HIST-007 | When quantile(q) is called on a non-empty histogram, the system shall return the upper bound of the bucket holding rank ceil(q*count), clamped to max; on an empty histogram it shall return None; if q is outside [0,1] or NaN it shall return Err. | TEST-HIST-007 |
| REQ-HIST-008 | When a histogram is encoded and decoded, the system shall round-trip exactly (counts, count, sum, min and max); if the bytes are truncated, unsorted, duplicated or hold an index above 495, then decode shall return Err. | TEST-HIST-008 |
| REQ-HIST-009 | When count would overflow u64, the system shall saturate count at u64::MAX and not panic. | TEST-HIST-009 |

## Design
Components: `Histogram { counts: BTreeMap<u16,u64>, count, sum, min, max }`; wire format = varint(n) then n pairs (varint index-delta, varint count), index-delta strictly > 0 after first, then trailer varint sum, min, max (min<=max when n>0, else decode returns Err).

| State | record | merge | decode |
| --- | --- | --- | --- |
| empty (count 0, min=MAX, max=0) | non-empty | copy other | empty ok |
| non-empty | count/sum saturate | counts add | indexes strictly increasing |

Invariants: sum(counts)==count (until saturation); min<=max when non-empty; merge commutative and associative; encode is canonical (decode(encode(h))==h).
Decision: BTreeMap gives deterministic order, so encoding is canonical.
## Assumptions / risks: saturating counts break the sum(counts)==count invariant at the limit; accepted and tested by TEST-HIST-009.
