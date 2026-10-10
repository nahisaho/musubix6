---
feature: metrics
tier: T2
approval: auto
---
# HDR metrics
Goal: bounded high-dynamic-range duration histograms without external dependencies.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-METRIC-001 | When nonnegative values within range are recorded, count and sum shall increase. | TEST-METRIC-001 |
| REQ-METRIC-002 | If values exceed the configured range or are negative, then Record shall reject them without mutation. | TEST-METRIC-001 |
| REQ-METRIC-003 | When quantiles are queried, the histogram shall return a bucket upper bound within 0.1 percent relative error for positive inputs. | TEST-METRIC-001 |
| REQ-METRIC-004 | When the histogram is empty, any valid quantile shall return zero. | TEST-METRIC-001 |
| REQ-METRIC-005 | If quantiles are outside [0,1] or NaN, then the system shall reject them. | TEST-METRIC-001 |
| REQ-METRIC-006 | When compatible snapshots merge, their count, sum and distribution shall combine without aliasing. | TEST-METRIC-001 |
| REQ-METRIC-007 | If snapshot ranges differ, then Merge shall reject without mutation. | TEST-METRIC-001 |
| REQ-METRIC-008 | When Record and Snapshot run concurrently, they shall remain race-free and preserve all records. | TEST-METRIC-001 |
| REQ-METRIC-009 | If Record or Merge overflows count or sum, then it shall reject without mutation. | TEST-METRIC-001 |
| REQ-METRIC-010 | When count reaches MaxInt64, the 100th percentile shall still return the highest occupied bucket. | TEST-METRIC-002 |
| REQ-METRIC-011 | When count exceeds 2^53, fractional quantile ranks shall be computed without integer precision loss. | TEST-METRIC-003 |
## Design
HDR-style integer exponent/subbucket encoding with 2048 subbuckets (1024 half buckets).
Mutex guards counters; snapshots clone counts and merge validates metadata before mutation.
## Assumptions
MaxValue≤1e12; sum/count overflow is checked before mutation; zero has its own bucket.
Snapshot fields are untrusted input to Merge, which validates shape, nonnegative counters and count totals.
Bit-length bucket sizing is verified in a runtime spike before implementation.
