# Independent review ledger
| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| SPEC-001 | high | specs/decisions.md:12 | Fixed |
| SPEC-002 | medium | specs/analysis.md:10 | Fixed |

Specification review: policy-spec-review identified two ambiguities.
Delta review: policy-spec-delta confirmed both fixes; implementation was still stubbed.
Implementation reviews are recorded below after machine checks.

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| IMPL-001 | high | policy/roles.py:35 | Fixed |
| IMPL-002 | medium | policy/roles.py:20 | Fixed |
| IMPL-003 | medium | policy/analysis.py:41 | Fixed |

Parallel reviewers: policy-correctness and policy-contract.
Bug-fix cycle 1: role-shape validation, malformed subject handling, iterative deep hierarchy.
Bug-fix cycle 2: ancestor-path unsatisfiability in conjunction and cross-rule overlaps.
Refactor: extract ordered obligation deduplication without changing tests.

Clean round 1: policy-final-role and policy-final-static passed all app fix regions.
Clean round 2: policy-final-round-two passed; zero Open app findings; eight targeted checks passed.
Final verification: README example and spikes passed; pytest 44 passed; full gate exit 0.
Ledger: 90 hash-chained entries, 44/44 tests with Red→Green evidence.
Separate tool finding: multiline Python signature hash exclusion, recorded in ../findings/app024.md.
