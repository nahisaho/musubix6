---
feature: report
tier: T1
---
# report
Goal: render parse/type errors with source context and provide a check()/CLI front end.
Non-goals: colours, multiple files.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REPORT-001 | When check(src) succeeds, the system shall return the shown principal scheme. | TEST-REPORT-001 |
| REQ-REPORT-002 | If a parse error occurs, then check(src) shall return `line:col: parse error: msg` followed by the source line and a caret line under the column. | TEST-REPORT-002 |
| REQ-REPORT-003 | If a type mismatch occurs, then the report shall show expected and actual types sharing one naming scope. | TEST-REPORT-003 |
| REQ-REPORT-004 | If an occurs-check error occurs, then the report shall say `infinite type` with the variable and type. | TEST-REPORT-004 |
| REQ-REPORT-005 | If an unbound variable occurs, then the report shall name it and point at it. | TEST-REPORT-005 |
| REQ-REPORT-006 | While rendering a caret, the system shall preserve tabs in the prefix and pick the correct line of multi-line sources. | TEST-REPORT-006 |
| REQ-REPORT-007 | When main(argv, stdin) runs, the system shall exit 0 on success, 1 on type error, 2 on parse error. | TEST-REPORT-007 |
| REQ-REPORT-008 | If inference exceeds the interpreter recursion limit on a very large but parseable expression, then check shall return `error: expression too deeply nested` and main shall exit 2, never a traceback. | TEST-REPORT-008 |
