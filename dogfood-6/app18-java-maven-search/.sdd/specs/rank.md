---
feature: rank
tier: T2
---
# rank
Goal: Okapi BM25 scoring and bounded top-k selection.
Non-goals: BM25F, learned ranking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RANK-001 | When computing idf, the system shall return ln(1 + (N-df+0.5)/(df+0.5)), strictly positive even when df = N; if df > N or df < 0 it shall throw IllegalArgumentException. | TEST-RANK-001 |
| REQ-RANK-002 | When tf grows, the term score shall increase monotonically and stay below idf*(k1+1). | TEST-RANK-002 |
| REQ-RANK-003 | When two documents have the same tf, the longer document shall score lower (b > 0). | TEST-RANK-003 |
| REQ-RANK-004 | If b = 0, then length shall not matter; if k1 = 0, then the score shall equal idf for tf >= 1. | TEST-RANK-004 |
| REQ-RANK-005 | If k1 < 0, b outside [0,1] or any parameter is NaN, then construction shall throw IllegalArgumentException. | TEST-RANK-005 |
| REQ-RANK-006 | When results are read, TopK shall order hits by score descending then docId ascending. | TEST-RANK-006 |
| REQ-RANK-007 | When more than k hits are offered, TopK shall retain exactly the best k (ties at the boundary keep the smaller docId); k <= 0 or NaN score shall throw IllegalArgumentException. | TEST-RANK-007 |
| REQ-RANK-008 | When scoring a term list, the scorer shall sum per-term scores, count a repeated term once per occurrence, ignore deleted docs and give unknown terms 0. | TEST-RANK-008 |
| REQ-RANK-009 | When the index is empty (avgDocLength 0), the scorer shall return no hits and never produce NaN or infinity. | TEST-RANK-009 |

## Design
TopK is a bounded min-heap of size k whose root is the worst retained hit.

| State | Event | Next | Note |
| --- | --- | --- | --- |
| size<k | offer | size+1 | push |
| size==k | offer better than root | size==k | replace root |
| size==k | offer worse or equal | size==k | drop |

Ordering: hit A better than B iff A.score > B.score or (equal and A.doc < B.doc).

| Id | Invariant |
| --- | --- |
| I1 | idf > 0 for 0 <= df <= N |
| I2 | score(tf) is concave increasing in tf |
| I3 | heap size never exceeds k |
| I4 | no NaN/Inf in any score (avgdl = 0 treated as length ratio 1) |

## Assumptions / risks
- Scores compared with equals only for exact ties; tests use identical inputs (TEST-RANK-006).
