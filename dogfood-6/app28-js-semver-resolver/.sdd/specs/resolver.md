---
feature: resolver
tier: T2
---
# resolver
Goal: backtracking dependency resolver (one version per package) with conflict explanation. Non-goals: nested duplicate versions, network.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RSLV-001 | When resolving, the system shall pick the highest satisfying version per package by default. | TEST-RSLV-001 |
| REQ-RSLV-002 | When packages have transitive deps, the system shall include every reachable package exactly once. | TEST-RSLV-002 |
| REQ-RSLV-003 | When a package is required by several dependents, the chosen version shall satisfy the intersection of all ranges. | TEST-RSLV-003 |
| REQ-RSLV-004 | If the highest candidate leads to a conflict, then the system shall backtrack and try lower candidates. | TEST-RSLV-004 |
| REQ-RSLV-005 | If a required package is absent from the registry, then resolve shall fail with reason `missing` naming package and requirer. | TEST-RSLV-005 |
| REQ-RSLV-006 | If no version satisfies the accumulated ranges, then resolve shall fail with reason `no-candidate` listing each (range, requirer). | TEST-RSLV-006 |
| REQ-RSLV-007 | When a failure occurs, explain(failure) shall render one line per requirer (`pkg@range required by by`) and a final `=>` verdict line. | TEST-RSLV-007 |
| REQ-RSLV-008 | When dependencies are cyclic, the system shall terminate and resolve. | TEST-RSLV-008 |
| REQ-RSLV-009 | While a range does not name a prerelease, the system shall not select prerelease versions. | TEST-RSLV-009 |
| REQ-RSLV-010 | The result shall be independent of registry key insertion order. | TEST-RSLV-010 |
| REQ-RSLV-011 | Where opts.prefer is `lowest`, the system shall pick the lowest satisfying version. | TEST-RSLV-011 |
| REQ-RSLV-012 | If the number of resolution steps exceeds opts.maxSteps, then resolve shall fail with reason `limit`. | TEST-RSLV-012 |
| REQ-RSLV-013 | When a package has required peers, the system shall treat them as dependencies; optional peers shall constrain only if the peer package is otherwise selected. | TEST-RSLV-013 |

## Design
Components: resolver.js (search), uses range.intersect/satisfies, semver.compare, peer.peerRequirements.
Data flow: roots → queue of (pkg, range, requirer) → constraint store → MRV pick → try candidates → propagate → recurse; undo via immutable state copies.

| State | Meaning |
| --- | --- |
| constraints: Map pkg → [{range, by}] | every requirement seen on chosen path |
| chosen: Map pkg → version | decided packages |
| pending: set of undecided pkgs | packages with constraints but no choice |
| steps | counter of candidate trials |

| Invariant | Rule |
| --- | --- |
| I1 | chosen[p] satisfies every constraint on p |
| I2 | every dep of a chosen version is in chosen or pending |
| I3 | pick order: fewest candidates, tie by name (determinism) |
| I4 | failure carries the constraint list of the deepest conflicting package |

## Assumptions / risks
Chronological backtracking only; exponential worst case bounded by maxSteps (TEST-RSLV-012).
