---
feature: explanation
tier: T2
approval: auto
---
# Optimization and explanation
Goal: Usable JSON logical-query optimizer CLI. Non-goals: SQL grammar or database connection.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-001 | When optimizing a request, the system shall validate the logical plan first. | TEST-PLAN-001 |
| REQ-PLAN-002 | When optimizing a valid plan, the system shall normalize, reorder eligible joins and preserve result bags without raising estimated cost. | TEST-PLAN-002 |
| REQ-PLAN-003 | When printing text, the system shall include indented operator labels, estimated rows and cumulative costs. | TEST-PLAN-003 |
| REQ-PLAN-004 | When explaining JSON, the system shall return a serializable annotated operator tree and original cost. | TEST-PLAN-004 |
| REQ-PLAN-005 | If JSON or a logical request is malformed, the system shall reject it with a descriptive error. | TEST-PLAN-005 |
| REQ-PLAN-006 | When invoked with a file or stdin, the CLI shall emit text or --json output and exit 1 on errors. | TEST-PLAN-006 |
| REQ-PLAN-007 | If rewrite or search budgets are invalid or exhausted, the optimizer shall surface the error. | TEST-PLAN-007 |
| REQ-PLAN-008 | When optimizing repeatedly, the system shall return deterministic results without mutating the request. | TEST-PLAN-008 |
## Design
validate → rewrite → recursively flatten scan-only inner join regions → DP → cost comparison → annotated printer.
CLI uses JSON input with plan and stats; only stdin or explicitly supplied files are read; invalid arguments fail.
## Assumptions / risks
Cost fallback may choose the original plan when normalization increases estimated work; semantics always come first.
CLI subprocess execution, source exports and JSON roundtrip are exercised in spikes/runtime.ts and TEST-PLAN-006.
