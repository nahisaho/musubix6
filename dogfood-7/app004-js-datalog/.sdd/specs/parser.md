---
feature: parser
tier: T2
approval: auto
---
# parser
Goal: A finite, typed Datalog engine with inspectable public contracts.
Non-goals: functions, aggregation, persistence, arithmetic generation, incremental retraction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSER-001 | When ground facts are parsed, the parser shall preserve predicate names and typed constant terms. | TEST-PARSER-001 |
| REQ-PARSER-002 | When rules are parsed, the parser shall assign stable IDs and preserve head and body variables. | TEST-PARSER-002 |
| REQ-PARSER-003 | When negation and comparisons are parsed, the parser shall represent their polarity and operators. | TEST-PARSER-003 |
| REQ-PARSER-004 | When comments and quoted escapes occur, the parser shall preserve string content and ignore comments. | TEST-PARSER-004 |
| REQ-PARSER-005 | When a query is parsed, the parser shall preserve constants, repeated variables and anonymous terms. | TEST-PARSER-005 |
| REQ-PARSER-006 | If syntax is invalid, the parser shall throw SyntaxError with line and column. | TEST-PARSER-006 |
| REQ-PARSER-007 | If a fact contains a variable or anonymous term, the parser shall reject the non-ground fact. | TEST-PARSER-007 |
| REQ-PARSER-008 | When zero-arity predicates and signed decimal numbers occur, the parser shall parse them without coercion and reject non-finite numeric literals. | TEST-PARSER-008 |
## Design
Parser AST flows into the stratification planner, the fixed-point evaluator, demand rewriting, and proof traversal.
Strings and finite numbers are the constant domain; Maps use JSON tuple keys; negation runs only after lower strata stabilize.
Anonymous terms are fresh existential wildcards in positive bodies and queries; comparison order in source is immaterial.
Magic rewriting specializes positive IDB calls, retains negative dependency closures, and reserves generated names.
## Assumptions / risks
Finite relations terminate; maxIterations/maxFacts guard resource use; input AST is parser-produced.
Runtime spike confirms typed tuple keys and zero-arity Maps; recursive differential tests retire scheduling risks.
Rule IDs are stable source-order r1,r2; derivation IDs use rule plus parents plus bindings.
