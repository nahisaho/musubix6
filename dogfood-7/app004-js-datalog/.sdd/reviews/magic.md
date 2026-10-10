spec: sha256:470196a9e063f0726aa0d712dd235da47125ecae53f546a9bfe698b2080ecf0c
verdict: pass
open: 0

## Findings
| ID | Severity | Where | Status |
|----|----------|-------|--------|
| reserved | high | src/magic.js | Closed |
| mixed-base | high | src/magic.js | Closed |
| quadratic-bridge | med | src/magic.js | Closed |

Independent reviewers: datalog-spec-review, datalog-correctness,
datalog-delta-review, and datalog-clean-review.
Reserved namespaces are rejected, mixed IDB facts are retained, and one bridge
per reachable adornment avoids quadratic base scans. True Reds and Greens are
recorded for mixed-base and performance regressions.
