---
feature: statistics
tier: T2
approval: auto
---
# Statistics and costs
Goal: Deterministic row-count and work estimates. Non-goals: histogram learning or runtime feedback.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STAT-001 | If row or column statistics are nonfinite or out of range, the system shall reject the catalog. | TEST-STAT-001 |
| REQ-STAT-002 | When relation statistics are absent, the system shall use 1000 rows. | TEST-STAT-002 |
| REQ-STAT-003 | When estimating equality to a scalar, the system shall use non-null fraction divided by distinct count. | TEST-STAT-003 |
| REQ-STAT-004 | When estimating AND/OR, the system shall assume independence and clamp probability to [0,1]. | TEST-STAT-004 |
| REQ-STAT-005 | When estimating equijoins, the system shall divide non-null row products by maximum distinct count. | TEST-STAT-005 |
| REQ-STAT-006 | When estimating projection, the system shall preserve input row count. | TEST-STAT-006 |
| REQ-STAT-007 | When costing a node, the system shall sum child work and output rows. | TEST-STAT-007 |
| REQ-STAT-008 | When constructing a catalog, the system shall snapshot input statistics without exposing mutable state. | TEST-STAT-008 |
| REQ-STAT-009 | If nullFraction is explicitly null or nonnumeric, the system shall reject it rather than treating it as omitted. | TEST-STAT-009 |
| REQ-STAT-010 | When a selective parent reduces an oversized intermediate, the system shall saturate only the requested final estimate and preserve empty products. | TEST-STAT-010 |
| REQ-STAT-011 | When combined predicates underflow ordinary probability multiplication, the system shall preserve log-domain selectivity and match separate-filter estimates. | TEST-STAT-011 |
| REQ-STAT-012 | When a probability is positive but subnormal, the system shall use its retained logarithm to recover accurate normal-range cardinalities. | TEST-STAT-012 |
| REQ-STAT-013 | When a statistics name matches an inherited object property, the system shall use the absent-statistics fallback unless that name is an own property. | TEST-STAT-013 |
## Design
Catalog is a frozen snapshot; missing column stats use 10 distinct and zero null fraction.
Estimator recursively derives alias-qualified column statistics; cardinalities and costs saturate at Number.MAX_SAFE_INTEGER.
## Assumptions / risks
Independence is approximate, not a result correctness claim; inequalities use 1/3.
rows and distinct are finite in [0,MAX_SAFE_INTEGER]; nullFraction is in [0,1]; distinct<=rows; zero distinct is valid only for empty/all-null columns. Divisors floor at 1; NULL equality selects zero. Uncapped/log-domain intermediates preserve selective recovery across overflow; only public estimates/costs saturate; zero products stay zero.
