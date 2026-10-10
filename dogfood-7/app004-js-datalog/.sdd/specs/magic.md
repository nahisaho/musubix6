---
feature: magic
tier: T2
approval: auto
---
# magic
Goal: A finite, typed Datalog engine with inspectable public contracts.
Non-goals: functions, aggregation, persistence, arithmetic generation, incremental retraction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MAGIC-001 | When a bound intensional query is rewritten, the rewriter shall seed its magic predicate with query constants. | TEST-MAGIC-001 |
| REQ-MAGIC-002 | When a free query is rewritten, the rewriter shall support a zero-arity demand predicate. | TEST-MAGIC-002 |
| REQ-MAGIC-003 | When a recursive rule is rewritten, the rewriter shall propagate binding demands through its positive body. | TEST-MAGIC-003 |
| REQ-MAGIC-004 | When a bound query is evaluated after rewriting, the rewriter shall preserve its answers and prune irrelevant derived rows. | TEST-MAGIC-004 |
| REQ-MAGIC-005 | When a partially bound query is rewritten, the rewriter shall specialize predicates by their binding adornments. | TEST-MAGIC-005 |
| REQ-MAGIC-006 | When a rewritten program contains negation, the rewriter shall retain the complete dependency closure of negative predicates. | TEST-MAGIC-006 |
| REQ-MAGIC-007 | When an extensional query is rewritten, the rewriter shall preserve the original program semantics. | TEST-MAGIC-007 |
| REQ-MAGIC-008 | When rewriting occurs, the rewriter shall leave the source AST unchanged and emit a safe stratifiable program; if an input predicate starts with magic_ or contains __, it shall reject the reserved name before rewriting. | TEST-MAGIC-008 |
| REQ-MAGIC-009 | When a predicate has both ground facts and defining rules, the rewriter shall demand-filter and retain its ground facts in every reachable adornment. | TEST-MAGIC-009 |
| REQ-MAGIC-010 | When 1000 base tuples share an intensional predicate, the rewriter shall emit one base bridge per adornment and preserve unbound answers within default evaluation budgets. | TEST-MAGIC-010 |
## Design
Parser AST flows into the stratification planner, the fixed-point evaluator, demand rewriting, and proof traversal.
Strings and finite numbers are the constant domain; Maps use JSON tuple keys; negation runs only after lower strata stabilize.
Anonymous terms are fresh existential wildcards in positive bodies and queries; comparison order in source is immaterial.
Magic rewriting specializes positive IDB calls, retains negative dependency closures, and reserves generated names.
## Assumptions / risks
Finite relations terminate; maxIterations/maxFacts guard resource use; input AST is parser-produced.
Runtime spike confirms typed tuple keys and zero-arity Maps; recursive differential tests retire scheduling risks.
Rule IDs are stable source-order r1,r2; derivation IDs use rule plus parents plus bindings.
