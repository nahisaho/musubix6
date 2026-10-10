---
feature: query
tier: T2
approval: auto
---
# Prepared queries and portals
Goal: parameterized SELECT literals and generate_series. Non-goals: tables, SQL generality.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUERY-001 | When SELECT literals are prepared, the engine shall preserve integer and quoted text columns. | TEST-QUERY-001 |
| REQ-QUERY-002 | If SQL is unsupported, the engine shall reject it with 42601. | TEST-QUERY-001 |
| REQ-QUERY-003 | When parameters are bound, each $n shall use the corresponding value. | TEST-QUERY-002 |
| REQ-QUERY-004 | If the parameter count differs from the maximum placeholder, binding shall fail. | TEST-QUERY-002 |
| REQ-QUERY-005 | When a named statement already exists, preparation shall fail without replacement. | TEST-QUERY-003 |
| REQ-QUERY-006 | When the unnamed statement is reparsed, it shall be replaced. | TEST-QUERY-003 |
| REQ-QUERY-007 | When a portal executes with a row limit, it shall suspend and retain its position. | TEST-QUERY-004 |
| REQ-QUERY-008 | When the remaining portal rows execute, completion shall be reported without repetition. | TEST-QUERY-004 |
| REQ-QUERY-009 | When closing a statement or portal, only that resource shall disappear. | TEST-QUERY-005 |
| REQ-QUERY-010 | If a missing resource is accessed, the engine shall return a structured error. | TEST-QUERY-005 |
| REQ-QUERY-011 | If adjacent quoted literals lack a supported operator, preparation shall reject them as invalid SQL. | TEST-QUERY-006 |
## Design
Engine owns named immutable Statements and mutable Portals; bind copies parameters.
Grammar SELECT expr[,expr...] and SELECT generate_series(integer,integer); NULL preserved via *string.
Portal states ready→suspended→complete→closed; close-statement does not delete bound portals.
Lite-specific lifetime: statements and portals survive COMMIT/ROLLBACK/Sync until Close or disconnect.
## Assumptions
Spike: regexp captures and quote-aware expression splitting handle escaped apostrophes.
Series cardinality bounded at 10000 and resources at 128 per connection; no mutable global engine.
