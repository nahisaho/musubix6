---
feature: cron
tier: T2
approval: auto
---
# Cron engine
Goal: five-field cron with explicit timezone and fold semantics. Non-goals: seconds and named months.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CRON-001 | When parsing five fields, the engine shall expand wildcards, lists, ranges, and positive steps. | TEST-CRON-001 |
| REQ-CRON-002 | If arity, field bounds, range order, or steps are invalid, the parser shall raise ValueError. | TEST-CRON-002 |
| REQ-CRON-003 | When matching, the engine shall enforce minute, hour, month, and Sunday-zero weekdays. | TEST-CRON-003 |
| REQ-CRON-004 | When both day fields are restricted, the engine shall use OR; otherwise it shall use AND. | TEST-CRON-004 |
| REQ-CRON-005 | When searching, the engine shall return the first matching UTC minute strictly after the aware input. | TEST-CRON-005 |
| REQ-CRON-006 | When a local minute is nonexistent during DST, the engine shall skip it. | TEST-CRON-006 |
| REQ-CRON-007 | When local minutes repeat, the engine shall obey first, second, or both fold policies. | TEST-CRON-007 |
| REQ-CRON-008 | If timezone, awareness, fold policy, or bounded search are invalid, the engine shall fail explicitly. | TEST-CRON-008 |
| REQ-CRON-009 | When a day field begins with a wildcard step, day combination shall retain wildcard AND semantics. | TEST-CRON-009 |
## Design
Immutable parsed fields; UTC-minute iteration converts through zoneinfo before matching.
Fold filtering applies only to genuinely ambiguous local times; no imaginary wall times are synthesized.
## Assumptions / risks
Runtime spike verifies New York spring gap and autumn fold; search defaults to 366 days.
Only standard library timezone data is required; search returns aware UTC values.
