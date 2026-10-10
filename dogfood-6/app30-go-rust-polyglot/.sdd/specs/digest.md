---
feature: digest
tier: T2
---
# digest
Goal: Rust merging t-digest (k1 scale function) for streaming quantiles with exact min/max and bounded centroid count.   Non-goals: serialization, thread safety.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIGEST-001 | If compression is not finite or lies outside [20, 10000], then new shall return Err(BadCompression). | TEST-DIGEST-001 |
| REQ-DIGEST-002 | If a value is not finite or a weight is not finite and positive, then add shall return Err(BadInput) and leave the digest unchanged. | TEST-DIGEST-002 |
| REQ-DIGEST-003 | The system shall keep total_weight equal to the sum of all added weights, including after compression and merge. | TEST-DIGEST-003 |
| REQ-DIGEST-004 | After compression the system shall hold at most 2*compression centroids regardless of the number of points added. | TEST-DIGEST-004 |
| REQ-DIGEST-005 | The compressed centroids shall be sorted ascending by mean, each weight shall be positive, and the weights shall sum to total_weight. | TEST-DIGEST-005 |
| REQ-DIGEST-006 | When quantile(0) or quantile(1) is called, the system shall return exactly min or max; on an empty digest it shall return Ok(None); if q is outside [0,1] or NaN it shall return Err(BadQuantile). | TEST-DIGEST-006 |
| REQ-DIGEST-007 | The quantile function shall be monotone non-decreasing in q and stay within [min, max]. | TEST-DIGEST-007 |
| REQ-DIGEST-008 | For 100000 uniform points and compression 100, the rank error of quantile(q) shall be at most 1% for the interior and at most 0.2% for q<=0.001 or q>=0.999. | TEST-DIGEST-008 |
| REQ-DIGEST-009 | When two digests are merged, the system shall sum total weights, combine min and max, keep the quantile error within 1%, and treat merging an empty digest as a no-op. | TEST-DIGEST-009 |
| REQ-DIGEST-010 | The cdf function shall return 0 below min, 1 at or above max, be monotone non-decreasing, and satisfy |cdf(quantile(q))-q| <= 0.02. | TEST-DIGEST-010 |
| REQ-DIGEST-011 | When all added values are identical (including a single point), every quantile shall equal that value. | TEST-DIGEST-011 |
| REQ-DIGEST-012 | After compressing 100000 points at compression 100, the first and last centroid weights shall each be at most total_weight/compression/5. | TEST-DIGEST-012 |

## Design
Components: `TDigest { delta, centroids: Vec<(mean, weight)>, buffer: Vec<(x, w)>, total, min, max }`; add pushes into the buffer, compress when buffer length >= 8*delta or when a read needs a flushed state.

| State | add | quantile/cdf | merge |
| --- | --- | --- | --- |
| empty | buffer | None | adopt other |
| buffered | buffer | compress first | push other's centroids into buffer |
| compressed | buffer | direct | as buffered |

Compress: sort centroids+buffer by mean (total order, stable), greedily absorb the next item while k(q_right)-k(q_left) <= 1 with k(q)=delta/(2*pi)*asin(2q-1).
Quantile: centroid centers at cum+w/2; interpolate linearly between neighbouring centers, between min and first center, and last center and max; q=0 and q=1 return min/max.
Invariants: total == sum(weights); means ascending; k-size bound; min/max exact. Decision: f64 weights (non-integer weights allowed), mean update uses weighted incremental mean.
## Assumptions / risks: asin domain error at q slightly outside [0,1] (clamp q before asin, retired by TEST-DIGEST-004/012); NaN ordering (retired by REQ-002 rejection).
