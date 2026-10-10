---
feature: euf
tier: T2
approval: auto
---
# Ground uninterpreted equality
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EUF-001 | When reflexive equalities exist, the system shall accept them. | TEST-EUF-001 |
| REQ-EUF-002 | When equality is reversed, the system shall preserve symmetry. | TEST-EUF-002 |
| REQ-EUF-003 | When equality chains exist, the system shall close them transitively. | TEST-EUF-003 |
| REQ-EUF-004 | When arguments are equal, the system shall merge matching function applications. | TEST-EUF-004 |
| REQ-EUF-005 | If disequalities contradict closure, the system shall return infeasible. | TEST-EUF-005 |
| REQ-EUF-006 | When function symbols or arities differ, the system shall not merge them without explicit equality. | TEST-EUF-006 |
| REQ-EUF-007 | When nested function applications exist, the system shall iterate congruence to a fixed point. | TEST-EUF-007 |
| REQ-EUF-008 | When closure succeeds, the system shall extract class and finite function interpretations. | TEST-EUF-008 |
## Design
Union-find plus repeated structural signature indexing over all subterms. Disequalities checked after closure.
Ground single uninterpreted sort is disjoint from the real sort; no quantifiers, shared real/EUF variables, or injectivity.
## Assumptions
Spike checks noninjectivity and nested closure; class IDs are internal and not stable across calls.
