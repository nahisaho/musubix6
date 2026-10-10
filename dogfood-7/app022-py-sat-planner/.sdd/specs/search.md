---
feature: search
tier: T2
approval: auto
---
# search
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SRC-001 | When A* uses its default zero heuristic, the system shall find a minimum-cost plan. | TEST-SRC-001 |
| REQ-SRC-002 | When GBFS runs, the system shall prioritize hFF with deterministic ties. | TEST-SRC-001 |
| REQ-SRC-003 | When initial goals hold, search shall return an empty solved plan. | TEST-SRC-001 |
| REQ-SRC-004 | If the finite reachable state space is exhausted, search shall return unsolvable. | TEST-SRC-001 |
| REQ-SRC-005 | When a lower-cost path reaches a known state, search shall reopen it and discard stale queue entries. | TEST-SRC-002 |
| REQ-SRC-006 | If the expansion limit is reached before a solution, search shall return limit. | TEST-SRC-002 |
| REQ-SRC-007 | If the algorithm or expansion limit is invalid, search shall reject it. | TEST-SRC-002 |
| REQ-SRC-008 | When solving, search shall report expanded, generated and total plan cost. | TEST-SRC-002 |
## Design
Heap entries carry priority, monotonic tie counter, cost, state and path; best-cost map enables reopening.
Status distinguishes solved, unsolvable and resource limit; goal check precedes expansion-budget check.
## Assumptions
Custom A* heuristics may be inadmissible; optimality is promised only for admissible heuristics.
