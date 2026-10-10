---
feature: contract
tier: T2
---
# contract
Goal: Go loader/validator of `contract/metrics.json` and the log-linear bucket scheme shared with the Rust crate.   Non-goals: schema evolution tooling.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CONTRACT-001 | When Load reads a valid metrics.json, the system shall return its contractVersion, wireVersion and quantiles. | TEST-CONTRACT-001 |
| REQ-CONTRACT-002 | If tier seconds are not strictly increasing or a tier does not divide the next tier, then Validate shall return ErrTiers. | TEST-CONTRACT-002 |
| REQ-CONTRACT-003 | If quantiles are not strictly ascending within the open interval (0,1), then Validate shall return ErrQuantiles. | TEST-CONTRACT-003 |
| REQ-CONTRACT-004 | If any limit is not positive, then Validate shall return ErrLimits. | TEST-CONTRACT-004 |
| REQ-CONTRACT-005 | The system shall compute BucketIndex and BucketBounds for every row of contract/vectors.tsv exactly as listed. | TEST-CONTRACT-005 |
| REQ-CONTRACT-006 | If metrics.json has an unknown field or a wireVersion other than 1, then Load shall return ErrUnknown. | TEST-CONTRACT-006 |

## Design
Components: `go/contract` (Load, Validate, BucketIndex, BucketBounds); `contract/metrics.json` + `contract/vectors.tsv` are the single source consumed by Go and Rust.

| Input | Check | Error |
| --- | --- | --- |
| unknown JSON field / wireVersion != 1 | strict decode | ErrUnknown |
| tiers | strictly increasing, t[i+1] % t[i] == 0 | ErrTiers |
| quantiles | strictly ascending in (0,1) | ErrQuantiles |
| limits | every value > 0 | ErrLimits |

Invariant table: bucket(v) = 8*e + (v>>e) with e = max(0, bitlen(v)-4); lower(i)<=v<=upper(i); upper(i)+1 == lower(i+1); maxBucketIndex = 495 for u64.
Decision: integer-only bucket math so Go and Rust agree bit-for-bit (no float log).
## Assumptions / risks: float log2 rounding would diverge across languages (retired by TEST-CONTRACT-005 and TEST-HIST-003 on the same vectors).
