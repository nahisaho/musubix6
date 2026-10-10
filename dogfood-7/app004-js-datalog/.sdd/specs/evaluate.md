---
feature: evaluate
tier: T2
approval: auto
---
# evaluate
Goal: A finite, typed Datalog engine with inspectable public contracts.
Non-goals: functions, aggregation, persistence, arithmetic generation, incremental retraction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EVALUATE-001 | When recursive reachability is evaluated, the engine shall compute its least fixed point. | TEST-EVALUATE-001 |
| REQ-EVALUATE-002 | When joins contain repeated variables, the engine shall enforce equality with typed constants. | TEST-EVALUATE-002 |
| REQ-EVALUATE-003 | When a stratified negative literal is evaluated, the engine shall subtract the complete lower-stratum relation. | TEST-EVALUATE-003 |
| REQ-EVALUATE-004 | When comparison operators occur, the engine shall filter bound values with strict typed equality and ordered same-type comparison. | TEST-EVALUATE-004 |
| REQ-EVALUATE-005 | When duplicate facts or derivations occur, the engine shall store each tuple only once. | TEST-EVALUATE-005 |
| REQ-EVALUATE-006 | When a query includes constants, repeated variables or wildcards, the engine shall return exactly matching tuples. | TEST-EVALUATE-006 |
| REQ-EVALUATE-007 | When semi-naive and naive strategies run, the engine shall return equal relations and reduce candidates on a recursive chain. | TEST-EVALUATE-007 |
| REQ-EVALUATE-008 | If iteration or fact limits are exceeded or options are invalid, the engine shall fail explicitly without returning a partial result. | TEST-EVALUATE-008 |
| REQ-EVALUATE-009 | If a standalone query string contains extra statements or a known predicate has the wrong arity, the engine shall reject it rather than silently discard input. | TEST-EVALUATE-009 |
| REQ-EVALUATE-010 | When joins or duplicate-heavy proofs exceed maxWork (default 1000000) or maxProofs (default 250000), the engine shall reject the evaluation during generation and validate both budgets as positive integers. | TEST-EVALUATE-010 |
## Design
Parser AST flows into the stratification planner, the fixed-point evaluator, demand rewriting, and proof traversal.
Budget counters guard join attempts, generated candidates and unique proofs even when tuple counts remain small.
Strings and finite numbers are the constant domain; Maps use JSON tuple keys; negation runs only after lower strata stabilize.
Anonymous terms are fresh existential wildcards in positive bodies and queries; comparison order in source is immaterial.
Magic rewriting specializes positive IDB calls, retains negative dependency closures, and reserves generated names.
## Assumptions / risks
Finite relations terminate; maxIterations/maxFacts guard resource use; input AST is parser-produced.
Runtime spike confirms typed tuple keys and zero-arity Maps; recursive differential tests retire scheduling risks.
Rule IDs are stable source-order r1,r2; derivation IDs use rule plus parents plus bindings.
