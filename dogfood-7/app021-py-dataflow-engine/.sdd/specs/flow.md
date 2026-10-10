---
feature: flow
tier: T2
approval: auto
---
# flow
Goal: deterministic event-time flow. Non-goals: distributed execution, untrusted pickle.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FLOW-001 | When the API is invoked, the system shall satisfy: Processing shall update keyed window aggregates. | TEST-FLOW-001 |
| REQ-FLOW-002 | When the API is invoked, the system shall satisfy: Watermark advancement shall emit and remove closed windows in deterministic order. | TEST-FLOW-002 |
| REQ-FLOW-003 | When the API is invoked, the system shall satisfy: Drop policy shall discard late events and count dropped records. | TEST-FLOW-003 |
| REQ-FLOW-004 | When the API is invoked, the system shall satisfy: Side-output policy shall preserve late records without updating aggregates. | TEST-FLOW-004 |
| REQ-FLOW-005 | When the API is invoked, the system shall satisfy: Error policy shall reject late records before mutation. | TEST-FLOW-005 |
| REQ-FLOW-006 | When the API is invoked, the system shall satisfy: Sliding execution shall aggregate every overlapping window. | TEST-FLOW-006 |
| REQ-FLOW-007 | When the API is invoked, the system shall satisfy: Session execution shall merge aggregate counts and sums across bridges. | TEST-FLOW-007 |
| REQ-FLOW-008 | When the API is invoked, the system shall satisfy: Invalid policies and window modes shall be rejected. | TEST-FLOW-008 |
| REQ-FLOW-009 | When the API is invoked, the system shall satisfy: Regressing or nonfinite engine watermarks shall raise ValueError before mutation. | TEST-FLOW-009 |
## Design
| REQ-FLOW-010 | When a nonfinite value arrives under any late policy, the engine shall reject it before changing counters or late output. | TEST-FLOW-010 |
Single-process synchronous modules; float timestamps, string keys, finite numeric values.
Event -> keyed half-open windows -> deterministic results; session end = last timestamp + gap.
Checkpoint JSON version 1 uses canonical encoding and SHA256 integrity (not authenticity).
## Assumptions / risks
Runtime spike verifies negative floor alignment, finite validation and canonical JSON.
Watermark defaults to negative infinity; encode it as null. Unknown input is rejected.
Explicit engine watermarks reject nonfinite values and regressions; Clock computes partition minima.
Overflowing derived bounds/sums raise ValueError before mutation; final watermark must be finite.
