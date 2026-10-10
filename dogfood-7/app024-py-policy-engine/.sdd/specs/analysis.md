---
feature: analysis
tier: T2
approval: auto
---
# Static conflict analysis
Goal: sound diagnostics on a restricted constraint fragment. Non-goals: complete SMT reasoning.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ANALYSIS-001 | When opposite effects have identical provably satisfiable conditions, the system shall report a definite conflict; unsatisfiable conditions shall not overlap. | TEST-ANALYSIS-001 |
| REQ-ANALYSIS-002 | If equality constraints disagree on a shared path, the system shall report no overlap. | TEST-ANALYSIS-002 |
| REQ-ANALYSIS-003 | When equality conjunctions are compatible, the system shall report a definite conflict. | TEST-ANALYSIS-003 |
| REQ-ANALYSIS-004 | If overlap cannot be proved for opposite effects, the system shall report a possible conflict. | TEST-ANALYSIS-004 |
| REQ-ANALYSIS-005 | When an earlier unconditional rule uses first-applicable, the system shall report later rules shadowed. | TEST-ANALYSIS-005 |
| REQ-ANALYSIS-006 | When same-effect conditions repeat, the system shall report duplicate behavior. | TEST-ANALYSIS-006 |
| REQ-ANALYSIS-007 | When producing diagnostics, the system shall retain deterministic pair order. | TEST-ANALYSIS-007 |
| REQ-ANALYSIS-008 | If static policy conditions are invalid, the system shall reject them before analysis. | TEST-ANALYSIS-008 |
| REQ-ANALYSIS-009 | If a scalar-equality constraint is an ancestor of a required nested path, the system shall prove the conjunction unsatisfiable and report no overlap. | TEST-ANALYSIS-009 |
## Design
Extract literal-equality conjunctions; contradictions prove disjointness, compatibility proves overlap.
Ancestor-path scalar equalities are incompatible with dictionary-only nested attribute resolution.
Other expressions are conservatively possible; role-restricted overlaps are downgraded to possible.
## Assumptions
Spike: symbolic constraints never execute request code; validated by spikes.py.
