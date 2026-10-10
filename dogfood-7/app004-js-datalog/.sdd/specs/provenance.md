---
feature: provenance
tier: T2
approval: auto
---
# provenance
Goal: A finite, typed Datalog engine with inspectable public contracts.
Non-goals: functions, aggregation, persistence, arithmetic generation, incremental retraction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PROVENANCE-001 | When a base tuple is explained, the explainer shall identify the ground fact as a base leaf. | TEST-PROVENANCE-001 |
| REQ-PROVENANCE-002 | When a derived tuple is explained, the explainer shall report rule IDs, variable bindings and supporting parent facts. | TEST-PROVENANCE-002 |
| REQ-PROVENANCE-003 | When multiple proofs derive a tuple, the explainer shall retain distinct proof alternatives. | TEST-PROVENANCE-003 |
| REQ-PROVENANCE-004 | When recursive proofs revisit a fact, the explainer shall emit a cycle reference rather than recurse indefinitely. | TEST-PROVENANCE-004 |
| REQ-PROVENANCE-005 | When a proof uses negation, the explainer shall report the tested absent tuple. | TEST-PROVENANCE-005 |
| REQ-PROVENANCE-006 | When an unknown tuple is explained, the explainer shall return null. | TEST-PROVENANCE-006 |
| REQ-PROVENANCE-007 | When explanation bounds are reached, the explainer shall emit truncation and reject invalid bounds. | TEST-PROVENANCE-007 |
| REQ-PROVENANCE-008 | When explanations are serialized or formatted, the explainer shall produce deterministic detached output without modifying evaluation state. | TEST-PROVENANCE-008 |
| REQ-PROVENANCE-009 | When acyclic proofs share parents, the explainer shall bound total expanded fact nodes by maxNodes (default 10000), emit truncation markers and reject invalid budgets. | TEST-PROVENANCE-009 |
## Design
Parser AST flows into the stratification planner, the fixed-point evaluator, demand rewriting, and proof traversal.
One request-local expansion counter bounds duplicated DAG traversal in addition to per-node alternatives and depth.
Strings and finite numbers are the constant domain; Maps use JSON tuple keys; negation runs only after lower strata stabilize.
Anonymous terms are fresh existential wildcards in positive bodies and queries; comparison order in source is immaterial.
Magic rewriting specializes positive IDB calls, retains negative dependency closures, and reserves generated names.
## Assumptions / risks
Finite relations terminate; maxIterations/maxFacts guard resource use; input AST is parser-produced.
Runtime spike confirms typed tuple keys and zero-arity Maps; recursive differential tests retire scheduling risks.
Rule IDs are stable source-order r1,r2; derivation IDs use rule plus parents plus bindings.
