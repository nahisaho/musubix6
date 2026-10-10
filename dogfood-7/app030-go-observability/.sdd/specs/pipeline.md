---
feature: pipeline
tier: T2
approval: auto
---
# Pipeline integration
Goal: concurrent end-to-end ingestion with explicit shutdown boundaries.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PIPE-001 | When a valid event is ingested, the pipeline shall aggregate its latency. | TEST-PIPE-001 |
| REQ-PIPE-002 | When a valid event is ingested, the pipeline shall submit its span to tail sampling. | TEST-PIPE-001 |
| REQ-PIPE-003 | When a valid event is ingested, its log shall correlate with the event trace. | TEST-PIPE-001 |
| REQ-PIPE-004 | If a context is canceled at the commit boundary after acquiring the mutex, then ingestion shall reject without side effects. | TEST-PIPE-001 |
| REQ-PIPE-005 | If a span has invalid identity or latency, then ingestion shall reject without side effects. | TEST-PIPE-001 |
| REQ-PIPE-006 | When Close is called, the pipeline shall atomically enter the closed state and reject later events. | TEST-PIPE-001 |
| REQ-PIPE-007 | When events arrive concurrently, the pipeline shall preserve all accepted event counts without races. | TEST-PIPE-001 |
| REQ-PIPE-008 | When a full queue rejects ingestion, the pipeline shall not record partial metrics or logs. | TEST-PIPE-001 |
| REQ-PIPE-009 (deferred) | The pipeline shall expose an OTLP network exporter. | — |
## Design
Pipeline mutex serializes validation, capacity preflight and sampler/metrics/logger calls.
Cancellation is checked once under the mutex; cancellation after that linearization point does not undo an accepted event.
Duration max 1e12 ns and capacity at most 1e6 bound all pipeline sums below MaxInt64.
The log queue is never drained: capacity bounds lifetime accepted events, even after sampler Flush.
State table: open→open on valid Add; open→closed on Close; closed Add→error; Close is idempotent.
## Assumptions
Components are owned privately so capacity preflight cannot race external callers.
Caller-supplied timestamps permit deterministic tail-flush tests; no background goroutine is required.
