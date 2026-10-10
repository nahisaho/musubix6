---
feature: sdk
tier: T2
approval: auto
---
# SDK
Goal: Offline flag evaluation with validated monotonic snapshot replacement.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SDK-001 | When an enabled flag has no matching rule or active rollout/variants, the system shall return its default value and revision. | TEST-SDK-001 |
| REQ-SDK-002 | If a flag is missing or disabled, the system shall return caller fallback with a diagnostic reason. | TEST-SDK-002 |
| REQ-SDK-003 | When multiple targeting rules match, the system shall select the first rule. | TEST-SDK-003 |
| REQ-SDK-004 | When a rule targets a segment, the system shall evaluate segment membership. | TEST-SDK-004 |
| REQ-SDK-005 | When percentage rollout applies, the system shall use stable user assignment. | TEST-SDK-005 |
| REQ-SDK-006 | When variants apply, the system shall return the assigned variant value. | TEST-SDK-006 |
| REQ-SDK-007 | If a snapshot revision is not newer or config is invalid, the system shall reject it without replacing active config. | TEST-SDK-007 |
| REQ-SDK-008 | If a snapshot exceeds maxAge or user key is empty, the system shall return fallback without targeting. | TEST-SDK-008 |
| REQ-SDK-009 | When callers mutate snapshots or returned values, the system shall preserve internal evaluator state. | TEST-SDK-009 |
| REQ-SDK-010 | If the injected clock throws or returns a non-finite timestamp during update, the system shall reject without changing config or installation age. | TEST-SDK-010 |
## Design
Construct compiled rules and SegmentGraph from validated cloned snapshot, swap only after full validation.
Precedence: missing/disabled, first matching rule, rollout/variant, default; return value/reason/revision.
## Assumptions / risks
Explicit injected clock makes staleness testable; maxAge measures local snapshot installation age.
No network or credentials; invalid context fails closed and targeting never executes user code.
