---
feature: state
tier: T2
---
# state
Goal: Persisted saga and step state machines with optimistic concurrency. Non-goals: execution logic.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STATE-001 | When a saga status transition listed in the transition table is requested, the system shall move the instance to the new status and record it. | TEST-STATE-001 |
| REQ-STATE-002 | If a saga transition is not in the table, then the system shall throw IllegalTransition (a LogicException) and leave the instance unchanged. | TEST-STATE-002 |
| REQ-STATE-003 | While a saga is COMPLETED, COMPENSATED or FAILED, the system shall reject every outgoing transition. | TEST-STATE-003 |
| REQ-STATE-004 | When a step transition is requested, the system shall apply the step transition table and reject illegal ones with IllegalTransition. | TEST-STATE-004 |
| REQ-STATE-005 | When a SagaInstance is created, the system shall start it PENDING, version 0, every step PENDING, with no events and no results. | TEST-STATE-005 |
| REQ-STATE-006 | When a transition succeeds, the system shall append an event with strictly increasing seq starting at 1, the kind, subject, target status and timestamp. | TEST-STATE-006 |
| REQ-STATE-007 | When an instance is serialized and restored, the system shall reproduce an equal instance; if the data has an unknown status or missing field it shall throw InvalidArgumentException. | TEST-STATE-007 |
| REQ-STATE-008 | When InMemoryStore saves with the expected version, the system shall persist an independent copy with version+1; if the expected version is stale it shall throw ConcurrencyException. | TEST-STATE-008 |
| REQ-STATE-009 | When FileStore saves, the system shall write atomically (no temp file left) so that a second FileStore on the same directory loads the same instance, applying the same version check. | TEST-STATE-009 |
| REQ-STATE-010 | If a FileStore id contains characters outside [A-Za-z0-9_.-] or starts with a dot, then the system shall throw InvalidArgumentException; if the stored JSON is corrupt it shall throw CorruptState. | TEST-STATE-010 |

## Design
Saga transition table (row=from, cols=to; Y legal):
| from \ to | RUNNING | COMPENSATING | COMPLETED | COMPENSATED | FAILED |
| --- | --- | --- | --- | --- | --- |
| PENDING | Y | - | Y | - | - |
| RUNNING | - | Y | Y | - | - |
| COMPENSATING | - | - | - | Y | Y |
| COMPLETED / COMPENSATED / FAILED | - | - | - | - | - |

Step table: PENDING→RUNNING; RUNNING→DONE|FAILED|PENDING(crash reset); DONE→COMPENSATING; FAILED→(none, terminal); COMPENSATING→COMPENSATED|COMPENSATION_FAILED; COMPENSATED, COMPENSATION_FAILED terminal.
Invariants: version only changes in a store save; events seq == count after append; a failed transition mutates nothing; serialization is lossless.
FileStore: `<dir>/<id>.json`, write `<id>.json.tmp` then rename; the read path decodes with JSON_THROW_ON_ERROR.
## Assumptions / risks: rename atomicity on one filesystem (TEST-STATE-009); path traversal retired by TEST-STATE-010.
