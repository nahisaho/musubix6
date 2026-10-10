---
feature: scoring
tier: T1
---
# scoring
Goal: run DSL rules over a transaction with velocity functions and produce a clamped, explainable score and band.   Non-goals: rule hot reload.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SCO-001 | When a transaction is scored, the Pipeline shall sum the weights of all matching rules. | TEST-SCO-001 |
| REQ-SCO-002 | The Pipeline shall clamp the final score to the range 0..100. | TEST-SCO-002 |
| REQ-SCO-003 | When a rule has a negative weight and matches, the Pipeline shall subtract it (allow-list effect) before clamping. | TEST-SCO-003 |
| REQ-SCO-004 | The Pipeline shall list matched rules ordered by descending absolute weight, then by name. | TEST-SCO-004 |
| REQ-SCO-005 | If a rule throws EvalException, then the Pipeline shall count it as 0, record it in Errors and continue with the other rules. | TEST-SCO-005 |
| REQ-SCO-006 | The Pipeline shall expose count(window), sum(window) and distinct(field, window) functions to rules, scoped to the account of the scored transaction. | TEST-SCO-006 |
| REQ-SCO-007 | The Pipeline shall record a transaction in the velocity store only after its rules were evaluated. | TEST-SCO-007 |
| REQ-SCO-008 | When mapping a score to a band, the Bands shall return Low below the medium threshold, Medium below the high threshold, else High; thresholds that are not strictly ascending shall throw ArgumentException. | TEST-SCO-008 |
| REQ-SCO-009 | When the same transaction id is scored twice, the Pipeline shall return the first result and shall not record velocity again. | TEST-SCO-009 |
| REQ-SCO-010 | The result shall carry an explanation string `score=N; matched=A(+30),B(-10)`. | TEST-SCO-010 |

## Assumptions / risks: depends on dsl (rules/evaluator) and velocity (store).
