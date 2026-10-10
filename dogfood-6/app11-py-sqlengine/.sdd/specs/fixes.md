---
feature: fixes
tier: T1
approval: auto
---
# fixes
Goal: regressions found by probing the planner/executor; literals of different types must never be conflated.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FIX-001 | When a query uses aggregates that differ only in literal type (SUM(1) and SUM(1.0)), the planner shall keep them as distinct aggregates so each result keeps its own type. | TEST-FIX-001 |
| REQ-FIX-002 | When a GROUP BY key is a literal (1) and the select list contains a literal of another type (TRUE), the planner shall not substitute the key for it. | TEST-FIX-002 |
