---
feature: state
tier: T2
approval: auto
---
# state
Goal: deterministic event-time state. Non-goals: distributed execution, untrusted pickle.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STATE-001 | When the API is invoked, the system shall satisfy: Keyed aggregates shall maintain count, sum, minimum and maximum. | TEST-STATE-001 |
| REQ-STATE-002 | When the API is invoked, the system shall satisfy: Independent keys shall maintain independent aggregates. | TEST-STATE-002 |
| REQ-STATE-003 | When the API is invoked, the system shall satisfy: Missing state queries shall return no value. | TEST-STATE-003 |
| REQ-STATE-004 | When the API is invoked, the system shall satisfy: Predicate filters shall preserve matching events and reject others. | TEST-STATE-004 |
| REQ-STATE-005 | When the API is invoked, the system shall satisfy: Mapping shall replace value while preserving event metadata. | TEST-STATE-005 |
| REQ-STATE-006 | When the API is invoked, the system shall satisfy: Nonfinite values shall be rejected without changing state. | TEST-STATE-006 |
| REQ-STATE-007 | When the API is invoked, the system shall satisfy: Deleting a key shall remove only its aggregate. | TEST-STATE-007 |
| REQ-STATE-008 | When the API is invoked, the system shall satisfy: Exported aggregates shall be defensive copies. | TEST-STATE-008 |
| REQ-STATE-009 | When the API is invoked, the system shall satisfy: An overflowing aggregate sum shall raise ValueError before mutation. | TEST-STATE-009 |
## Design
Single-process synchronous modules; float timestamps, string keys, finite numeric values.
Event -> keyed half-open windows -> deterministic results; session end = last timestamp + gap.
Checkpoint JSON version 1 uses canonical encoding and SHA256 integrity (not authenticity).
## Assumptions / risks
Runtime spike verifies negative floor alignment, finite validation and canonical JSON.
Watermark defaults to negative infinity; encode it as null. Unknown input is rejected.
Explicit engine watermarks reject nonfinite values and regressions; Clock computes partition minima.
Overflowing derived bounds/sums raise ValueError before mutation; final watermark must be finite.
