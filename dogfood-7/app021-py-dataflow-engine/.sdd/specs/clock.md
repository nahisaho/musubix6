---
feature: clock
tier: T2
approval: auto
---
# clock
Goal: deterministic event-time clock. Non-goals: distributed execution, untrusted pickle.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CLOCK-001 | When the API is invoked, the system shall satisfy: Event records shall retain timestamp, key, value and partition. | TEST-CLOCK-001 |
| REQ-CLOCK-002 | When the API is invoked, the system shall satisfy: Invalid nonfinite event timestamps shall raise ValueError. | TEST-CLOCK-002 |
| REQ-CLOCK-003 | When the API is invoked, the system shall satisfy: Observed partition maxima shall produce the minimum active watermark minus bounded lag. | TEST-CLOCK-003 |
| REQ-CLOCK-004 | When the API is invoked, the system shall satisfy: Watermarks shall never regress when earlier events arrive. | TEST-CLOCK-004 |
| REQ-CLOCK-005 | When the API is invoked, the system shall satisfy: Idle partitions shall not hold back the active watermark. | TEST-CLOCK-005 |
| REQ-CLOCK-006 | When the API is invoked, the system shall satisfy: An explicit watermark regression shall raise ValueError. | TEST-CLOCK-006 |
| REQ-CLOCK-007 | When the API is invoked, the system shall satisfy: Lateness shall use timestamp strictly less than the watermark. | TEST-CLOCK-007 |
| REQ-CLOCK-008 | When the API is invoked, the system shall satisfy: Negative lag and unknown partitions shall raise ValueError. | TEST-CLOCK-008 |
## Design
Single-process synchronous modules; float timestamps, string keys, finite numeric values.
Event -> keyed half-open windows -> deterministic results; session end = last timestamp + gap.
Checkpoint JSON version 1 uses canonical encoding and SHA256 integrity (not authenticity).
## Assumptions / risks
Runtime spike verifies negative floor alignment, finite validation and canonical JSON.
Watermark defaults to negative infinity; encode it as null. Unknown input is rejected.
Explicit engine watermarks reject nonfinite values and regressions; Clock computes partition minima.
Overflowing derived bounds/sums raise ValueError before mutation; final watermark must be finite.
