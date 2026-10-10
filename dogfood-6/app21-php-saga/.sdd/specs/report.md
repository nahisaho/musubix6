---
feature: report
tier: T1
---
# report
Goal: Read-only timeline and summary of a persisted saga. Non-goals: persistence, notifications.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REPORT-001 | When a timeline is requested, the system shall list the instance events ordered by seq as `seq kind subject status@at` lines. | TEST-REPORT-001 |
| REQ-REPORT-002 | When a summary is requested, the system shall count steps per StepStatus including zero counts for unused statuses. | TEST-REPORT-002 |
| REQ-REPORT-003 | When the duration is requested, the system shall return last event time minus first event time, 0 if fewer than two events. | TEST-REPORT-003 |
| REQ-REPORT-004 | When failed steps are requested, the system shall return sorted names of steps FAILED or COMPENSATION_FAILED. | TEST-REPORT-004 |
| REQ-REPORT-005 | If the saga is FAILED or any step is COMPENSATION_FAILED, then needsAttention shall return true, otherwise false. | TEST-REPORT-005 |

## Assumptions / risks: depends on state SagaInstance accessors.
