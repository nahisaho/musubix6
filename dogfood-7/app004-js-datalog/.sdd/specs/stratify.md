---
feature: stratify
tier: T2
approval: auto
---
# stratify
Goal: A finite, typed Datalog engine with inspectable public contracts.
Non-goals: functions, aggregation, persistence, arithmetic generation, incremental retraction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-STRATIFY-001 | When dependencies contain only positive recursion, the planner shall put the recursive component in one stratum. | TEST-STRATIFY-001 |
| REQ-STRATIFY-002 | When negation depends on another predicate, the planner shall assign its head a strictly higher stratum. | TEST-STRATIFY-002 |
| REQ-STRATIFY-003 | If a dependency cycle contains a negative edge, the planner shall reject it. | TEST-STRATIFY-003 |
| REQ-STRATIFY-004 | If a head variable lacks a positive body binding, the planner shall reject the unsafe rule. | TEST-STRATIFY-004 |
| REQ-STRATIFY-005 | If negated or compared variables lack positive bindings, the planner shall reject the unsafe rule. | TEST-STRATIFY-005 |
| REQ-STRATIFY-006 | If the same predicate occurs at different arities, the planner shall reject the program including queries. | TEST-STRATIFY-006 |
| REQ-STRATIFY-007 | When independent or disconnected predicates occur, the planner shall retain each predicate and sorted rule group. | TEST-STRATIFY-007 |
| REQ-STRATIFY-008 | If anonymous terms occur in rule heads, comparisons or negative literals, the planner shall reject them while allowing positive wildcards. | TEST-STRATIFY-008 |
## Design
Parser AST flows into the stratification planner, the fixed-point evaluator, demand rewriting, and proof traversal.
Strings and finite numbers are the constant domain; Maps use JSON tuple keys; negation runs only after lower strata stabilize.
Anonymous terms are fresh existential wildcards in positive bodies and queries; comparison order in source is immaterial.
Magic rewriting specializes positive IDB calls, retains negative dependency closures, and reserves generated names.
## Assumptions / risks
Finite relations terminate; maxIterations/maxFacts guard resource use; input AST is parser-produced.
Runtime spike confirms typed tuple keys and zero-arity Maps; recursive differential tests retire scheduling risks.
Rule IDs are stable source-order r1,r2; derivation IDs use rule plus parents plus bindings.
