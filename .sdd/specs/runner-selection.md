---
feature: runner-selection
tier: T2
---
## Requirements
| REQ-RUNNER-SELECTION-001 | When a baseline test-runner command changes its selection or arguments, the gate shall report possible narrowing and fail under baseline strict policy unless --allow-config-weaken acknowledges it. | TEST-RUNNER-SELECTION-001 |
## Design
Extend cfgRunLoosening for root/project testCmd, changedCmd and named checks.
Compare normalized command vectors for recognized test runners, conservatively treating argument changes as possible narrowing.
Preserve removal/no-op diagnostics, unchanged commands and arbitrary non-runner edits.
Use the existing full HEAD and changed baseline comparisons and acknowledgement policy.
## Assumptions
Widening and operational runner argument changes also require review; test counts are not evidence of equivalent selection.
Validation is limited to targeted script tests and node --check as requested.
