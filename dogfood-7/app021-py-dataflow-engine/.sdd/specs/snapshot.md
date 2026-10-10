---
feature: snapshot
tier: T2
approval: auto
---
# snapshot
Goal: deterministic event-time snapshot. Non-goals: distributed execution, untrusted pickle.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SNAPSHOT-001 | When the API is invoked, the system shall satisfy: A checkpoint shall round-trip engine options, watermark and open aggregates. | TEST-SNAPSHOT-001 |
| REQ-SNAPSHOT-002 | When the API is invoked, the system shall satisfy: Restored execution shall produce the same result as uninterrupted execution. | TEST-SNAPSHOT-002 |
| REQ-SNAPSHOT-003 | When the API is invoked, the system shall satisfy: Checkpoint integrity shall detect a modified payload. | TEST-SNAPSHOT-003 |
| REQ-SNAPSHOT-004 | When the API is invoked, the system shall satisfy: An unknown checkpoint version shall raise ValueError. | TEST-SNAPSHOT-004 |
| REQ-SNAPSHOT-005 | When the API is invoked, the system shall satisfy: Checkpoint encoding shall be deterministic for equivalent state. | TEST-SNAPSHOT-005 |
| REQ-SNAPSHOT-006 | When the API is invoked, the system shall satisfy: Checkpoint payloads shall not alias live mutable engine state. | TEST-SNAPSHOT-006 |
| REQ-SNAPSHOT-007 | When the API is invoked, the system shall satisfy: Checkpoints shall preserve session connectivity and aggregate contents. | TEST-SNAPSHOT-007 |
| REQ-SNAPSHOT-008 | When the API is invoked, the system shall satisfy: Checkpoints shall preserve late-output events and drop counters. | TEST-SNAPSHOT-008 |
## Design
| REQ-SNAPSHOT-009 | When a digest-valid checkpoint contains malformed state, restoration shall reject it with ValueError. | TEST-SNAPSHOT-009 |
Single-process synchronous modules; float timestamps, string keys, finite numeric values.
Event -> keyed half-open windows -> deterministic results; session end = last timestamp + gap.
Checkpoint JSON version 1 uses canonical encoding and SHA256 integrity (not authenticity).
## Assumptions / risks
Runtime spike verifies negative floor alignment, finite validation and canonical JSON.
Watermark defaults to negative infinity; encode it as null. Unknown input is rejected.
Explicit engine watermarks reject nonfinite values and regressions; Clock computes partition minima.
Overflowing derived bounds/sums raise ValueError before mutation; final watermark must be finite.
