---
feature: window
tier: T2
approval: auto
---
# window
Goal: deterministic event-time window. Non-goals: distributed execution, untrusted pickle.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WINDOW-001 | When the API is invoked, the system shall satisfy: Tumbling windows shall use half-open size-aligned intervals including negative time. | TEST-WINDOW-001 |
| REQ-WINDOW-002 | When the API is invoked, the system shall satisfy: Sliding windows shall assign every overlapping half-open interval. | TEST-WINDOW-002 |
| REQ-WINDOW-003 | When the API is invoked, the system shall satisfy: Invalid window size or slide shall raise ValueError. | TEST-WINDOW-003 |
| REQ-WINDOW-004 | When the API is invoked, the system shall satisfy: Session arrivals within a gap shall merge with existing sessions. | TEST-WINDOW-004 |
| REQ-WINDOW-005 | When the API is invoked, the system shall satisfy: An out-of-order bridging arrival shall merge all connected sessions. | TEST-WINDOW-005 |
| REQ-WINDOW-006 | When the API is invoked, the system shall satisfy: Session windows shall isolate independent keys. | TEST-WINDOW-006 |
| REQ-WINDOW-007 | When the API is invoked, the system shall satisfy: Sessions whose end is at or below the watermark shall close. | TEST-WINDOW-007 |
| REQ-WINDOW-008 | When the API is invoked, the system shall satisfy: Session gap shall be positive and repeated closure shall be idempotent. | TEST-WINDOW-008 |
| REQ-WINDOW-009 | When the API is invoked, the system shall satisfy: Overflowing window or session arithmetic shall raise ValueError without mutating sessions. | TEST-WINDOW-009 |
## Design
| REQ-WINDOW-010 | When fractional timestamps fall on represented boundaries, assignment shall return only and all half-open containing intervals. | TEST-WINDOW-010 |
Single-process synchronous modules; float timestamps, string keys, finite numeric values.
Event -> keyed half-open windows -> deterministic results; session end = last timestamp + gap.
Fractional alignment uses decimal-string representations of caller-provided floats.
Checkpoint JSON version 1 uses canonical encoding and SHA256 integrity (not authenticity).
## Assumptions / risks
Runtime spike verifies negative floor alignment, finite validation and canonical JSON.
Watermark defaults to negative infinity; encode it as null. Unknown input is rejected.
Explicit engine watermarks reject nonfinite values and regressions; Clock computes partition minima.
Overflowing derived bounds/sums raise ValueError before mutation; final watermark must be finite.
