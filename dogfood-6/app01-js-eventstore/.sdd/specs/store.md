---
feature: store
tier: T2
approval: auto
---
# store
Goal: append-only in-memory event store with optimistic concurrency. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STORE-001 | When append(stream, 0, events) targets a new stream, the system shall assign versions 1..n and return the stored events. | TEST-STORE-001 |
| REQ-STORE-002 | If expectedVersion differs from the stream's current version, then the system shall throw ConcurrencyError and store nothing. | TEST-STORE-002 |
| REQ-STORE-003 | When expectedVersion is 'any', the system shall append without a version check. | TEST-STORE-003 |
| REQ-STORE-004 | When events are appended to any stream, the system shall assign strictly increasing globalSeq values across streams. | TEST-STORE-004 |
| REQ-STORE-005 | When read(stream, from) is called, the system shall return events with version >= from in order, and [] for an unknown stream. | TEST-STORE-005 |
| REQ-STORE-006 | If append receives an empty events array, then the system shall throw RangeError. | TEST-STORE-006 |
| REQ-STORE-007 | When events are stored, the system shall freeze them and shall not mutate the caller's input objects. | TEST-STORE-007 |
| REQ-STORE-008 | When findByCommandId(id) is called, the system shall return stored events whose meta.commandId equals id, in globalSeq order. | TEST-STORE-008 |
| REQ-STORE-009 | When readAll(fromSeq) is called, the system shall return all events with globalSeq > fromSeq in order. | TEST-STORE-009 |

## Design
Single class EventStore holds Map<streamId, Event[]> plus a global Event[] log and a Map<commandId, Event[]> index.
append() is synchronous, so check-and-write is atomic in one tick; version = stream length. Stored event = frozen {streamId, version, globalSeq, type, data, meta}.
Decision: expectedVersion is a non-negative integer or 'any'; any other value throws TypeError.
## Assumptions / risks
Single-threaded JS makes synchronous append atomic (TEST-STORE-002 covers conflict path).
