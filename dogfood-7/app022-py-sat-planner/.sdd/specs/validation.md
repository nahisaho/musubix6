---
feature: validation
tier: T2
approval: auto
---
# validation
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VAL-001 | When replaying a valid plan, validation shall return its final state and cost. | TEST-VAL-001 |
| REQ-VAL-002 | If a plan names an unknown action, validation shall report the failing step. | TEST-VAL-001 |
| REQ-VAL-003 | If a plan uses an inapplicable action, validation shall report the failing step. | TEST-VAL-001 |
| REQ-VAL-004 | If the final state misses a goal, validation shall reject the plan. | TEST-VAL-001 |
| REQ-VAL-005 | When invoking the CLI on a solvable task, it shall print JSON with a validated plan. | TEST-VAL-002 |
| REQ-VAL-006 | When invoking the CLI, it shall exit 1 for unsolvable and 3 for an expansion-limit status. | TEST-VAL-002 |
| REQ-VAL-007 | If CLI input is malformed, the CLI shall emit JSON error and exit with code 2. | TEST-VAL-002 |
| REQ-VAL-008 | When replaying an empty plan with satisfied goals, validation shall return zero cost. | TEST-VAL-002 |
| REQ-VAL-009 | If a task has duplicate action labels, validation shall reject ambiguity; the CLI shall never exit successfully for an invalid solved plan. | TEST-VAL-003 |
## Design
Resolve exact ground-action labels, replay transitions, then verify goal inclusion.
CLI reads domain/problem files and emits machine-readable status; validation is independent of search.
Options --algorithm astar|gbfs and --limit N; JSON contains status, plan, cost, expanded, generated, valid or error.
## Assumptions
No file writes or subprocess execution; CLI input files are local and UTF-8.
