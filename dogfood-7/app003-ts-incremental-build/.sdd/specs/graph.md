---
feature: graph
tier: T2
approval: auto
---
# Validated DAG
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GRAPH-001 | When nodes are supplied, the graph shall produce deterministic dependency-first lexical topology. | TEST-GRAPH-001 |
| REQ-GRAPH-002 | If node IDs are duplicated or empty, then construction shall reject them. | TEST-GRAPH-002 |
| REQ-GRAPH-003 | If a dependency is unknown, then construction shall reject it. | TEST-GRAPH-003 |
| REQ-GRAPH-004 | If a dependency cycle exists, then validation shall reject it with a cycle path. | TEST-GRAPH-004 |
| REQ-GRAPH-005 | When target closure is queried, the graph shall return only targets and their ancestors. | TEST-GRAPH-005 |
| REQ-GRAPH-006 | When dependencies are replaced, the graph shall validate atomically and leave the prior graph on failure. | TEST-GRAPH-006 |
| REQ-GRAPH-007 | When reverse closure is queried, the graph shall return all transitive dependents exactly once. | TEST-GRAPH-007 |
| REQ-GRAPH-008 | When input or returned dependency arrays are mutated, the graph shall preserve its private state. | TEST-GRAPH-008 |
## Design
Graph owns ID-to-dependency sets; edges point from task to prerequisite; ready ties are lexical.
Construction and replacement validate in a candidate map, then publish; invalid operations never mutate.
## Assumptions
Node v24 runs stripped TypeScript and node:test; the spike exercises hashing, timers and workspace imports.
IDs are opaque strings; duplicate dependency edges are deduplicated; empty target lists yield an empty closure.
