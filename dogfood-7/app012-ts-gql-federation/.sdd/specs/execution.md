---
feature: execution
tier: T2
approval: auto
---
# DAG execution
Goal: Execute a federation plan with request-local entity batching and partial errors.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXEC-001 | When independent roots execute, the executor shall preserve their responses. | TEST-EXEC-001 |
| REQ-EXEC-002 | When entity fields are requested, the executor shall merge entity results into roots. | TEST-EXEC-002 |
| REQ-EXEC-003 | When representations repeat in a list, the executor shall batch and deduplicate them. | TEST-EXEC-003 |
| REQ-EXEC-004 | When requires fields are available, the executor shall include them in representations. | TEST-EXEC-004 |
| REQ-EXEC-005 | When projecting a response, the executor shall omit hidden key and prerequisite fields. | TEST-EXEC-005 |
| REQ-EXEC-006 | If one root service fails, the executor shall return partial data and a path error. | TEST-EXEC-006 |
| REQ-EXEC-007 | When a parent is null, the executor shall skip its entity fetch. | TEST-EXEC-007 |
| REQ-EXEC-008 | If an entity result is positional null or its batch fails, the executor shall return null selected fields and path errors for failures. | TEST-EXEC-008 |
| REQ-EXEC-009 | If an entity key is incomplete or null, the executor shall report its path error without sending that representation. | TEST-EXEC-009 |
## Design
Ready DAG nodes run concurrently; entity nodes traverse parent objects, build representations and batch per node.
Responses are projected from client selections after fetches complete; errors retain stable response paths.
## Assumptions
Spike: nested arrays must flatten only for fetch traversal, not response projection.
Adapters return exactly one object-or-null per representation in order; shorter arrays are batch failures.
Adapters are trusted local functions; transport authorization, subscriptions and GraphQL nonnull bubbling are out of scope.
