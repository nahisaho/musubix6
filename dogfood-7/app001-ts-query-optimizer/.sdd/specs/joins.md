---
feature: joins
tier: T2
approval: auto
---
# Join ordering
Goal: Minimum-cost bushy inner join trees under the defined cost model. Non-goals: physical algorithm selection.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-JOIN-001 | If a join graph is empty, the system shall reject it. | TEST-JOIN-001 |
| REQ-JOIN-002 | When the graph has one relation, the system shall return that relation. | TEST-JOIN-002 |
| REQ-JOIN-003 | When reordering a graph, the system shall retain each supplied equijoin predicate exactly once. | TEST-JOIN-003 |
| REQ-JOIN-004 | When enumerating subsets, the system shall return a minimum-cost bushy tree under the statistics cost model. | TEST-JOIN-004 |
| REQ-JOIN-005 | When candidates tie, the system shall use canonical fingerprints independent of input relation order. | TEST-JOIN-005 |
| REQ-JOIN-006 | If a graph exceeds 12 relations or its configured limit, the system shall reject exponential search. | TEST-JOIN-006 |
| REQ-JOIN-007 | When graph components are disconnected, the system shall represent cross joins by true predicates. | TEST-JOIN-007 |
| REQ-JOIN-008 | If an edge is not a two-relation column equality or references an unknown endpoint, the system shall reject it. | TEST-JOIN-008 |
## Design
Sort aliases; bitmask DP enumerates unordered disjoint subset partitions and both child orientations.
Edges are attached at the unique lowest partition separating endpoints; subset row estimates use all internal edges, independent of tree shape.
## Assumptions / risks
Twelve-bit masks are safe in Node; DP saturation can create ties, resolved canonically (spikes/runtime.ts).
Projected or filtered subtrees are optimized recursively but never flattened into this scan-only public graph API.
