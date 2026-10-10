---
feature: contract
tier: T2
approval: auto
---
# contract
Goal: one shared job state machine (contract/states.json) behaves identically in TS and Python.   Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CON-001 | The system shall expose all states from contract/states.json and every transition target shall be a known state. | TEST-CON-001, TEST-CON-101 |
| REQ-CON-002 | When canTransition(from,to) is called for a transition listed in the table, the system shall return true. | TEST-CON-002, TEST-CON-102 |
| REQ-CON-003 | When canTransition is called for an unlisted pair (including self-transitions), the system shall return false. | TEST-CON-003, TEST-CON-103 |
| REQ-CON-004 | If a state name is unknown, then canTransition/isTerminal shall throw UnknownStateError. | TEST-CON-004, TEST-CON-104 |
| REQ-CON-005 | When isTerminal(s) is called, the system shall return true exactly for states listed in `terminal`. | TEST-CON-005, TEST-CON-105 |
| REQ-CON-006 | The system shall guarantee terminal states have no outgoing transitions (invariant check). | TEST-CON-006, TEST-CON-106 |
| REQ-CON-007 | When reachable(from) is called, the system shall return all states reachable by one or more transitions, sorted, excluding from unless on a cycle. | TEST-CON-007, TEST-CON-107 |
| REQ-CON-008 | When shortestPath(from,to) is called, the system shall return the minimal state list including both ends, [from] if equal, or null if unreachable. | TEST-CON-008, TEST-CON-108 |

## Design
Both runtimes load `contract/states.json` (single source; no copy of the table in code).

| State | Terminal | Out-edges |
| --- | --- | --- |
| queued | no | running, cancelled |
| running | no | succeeded, failed, cancelled |
| failed | no | retrying, dead |
| retrying | no | running, cancelled |
| succeeded/dead/cancelled | yes | none |

Invariants: I1 targets ⊆ states; I2 terminal ⇒ no out-edges; I3 no self loops; I4 reachable is a BFS closure.
## Assumptions / risks
Changing states.json must trigger both projects' gate (`dependsOn: contract`). Parity is tested by TS and Py suites on the same file.
