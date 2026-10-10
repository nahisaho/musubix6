spec: sha256:992a769f623ae1f8d330a00a6b62305fa1364008cfc0e7986f87b19451803beb
verdict: pass
open: 0

## Findings
| ID | Severity | Where | Status |
|----|----------|-------|--------|
| P1 | med | planner.md: INNER-join ON conjunct placement was unspecified; now pooled with WHERE | Closed |
| P2 | med | planner.md: nullable-side conjunct merged into later INNER join is valid (filter after LJ); table added | Closed |
| P3 | low | error ordering under pushdown documented as accepted risk | Closed |
