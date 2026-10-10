---
feature: rules
tier: T2
approval: auto
---
# Rewrite engine
Goal: Semantics-preserving logical normalization. Non-goals: arbitrary plugin semantic verification.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RULE-001 | When simplifying boolean expressions, the system shall flatten conjunctions and fold boolean constants. | TEST-RULE-001 |
| REQ-RULE-002 | When a filter predicate is true, the system shall remove that filter. | TEST-RULE-002 |
| REQ-RULE-003 | When filters are adjacent, the system shall merge their predicates. | TEST-RULE-003 |
| REQ-RULE-004 | When a filter references one join side, the system shall push it into that side. | TEST-RULE-004 |
| REQ-RULE-005 | When a filter references both inner-join sides, the system shall retain it as a join predicate. | TEST-RULE-005 |
| REQ-RULE-006 | When projection exactly matches input schema order, the system shall remove it. | TEST-RULE-006 |
| REQ-RULE-007 | When rewriting a plan, the system shall preserve input ownership, reach a fixed point and report applied rule names. | TEST-RULE-007 |
| REQ-RULE-008 | If a rewrite repeats a nonconsecutive plan or exhausts its pass budget, the system shall terminate with a descriptive error. | TEST-RULE-008 |
| REQ-RULE-009 | When a singleton boolean expression contains a scalar operand, the system shall preserve its UNKNOWN normalization and result bags. | TEST-RULE-009 |
## Design
Builtin normalization traverses postorder; named plugins transform the root once per pass. Fingerprint sets detect oscillation; default pass budget is 32. An unchanged pass succeeds before cycle checking, including the last allowed pass.
Only inner joins exist; side membership is determined by output schema, not table-name substring matching.
## Assumptions / risks
Plugins are trusted in-process code; validation rejects invalid plugin outputs; arbitrary plugin side effects are out of scope.
Boolean normalization must not coerce scalar literals; reference interpreter compares row bags.
