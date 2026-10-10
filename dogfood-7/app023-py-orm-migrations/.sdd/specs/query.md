---
feature: query
tier: T2
approval: auto
---
# Query contract
Goal: Immutable, injection-safe SELECT construction.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUERY-001 | When a query is compiled, the system shall select declared columns in order. | TEST-QUERY-001 |
| REQ-QUERY-002 | When filters contain strings, the system shall bind values using placeholders rather than SQL interpolation. | TEST-QUERY-002 |
| REQ-QUERY-003 | When an unknown field or operator is requested, the system shall reject it. | TEST-QUERY-003 |
| REQ-QUERY-004 | When ordering and pagination are requested, the system shall validate and bind the limit. | TEST-QUERY-004 |
| REQ-QUERY-005 | When filtering None, the system shall generate IS NULL or IS NOT NULL. | TEST-QUERY-005 |
| REQ-QUERY-006 | When filtering an empty IN set, the system shall select zero rows. | TEST-QUERY-006 |
| REQ-QUERY-007 | When chaining a query, the system shall leave the previous query unchanged. | TEST-QUERY-007 |
| REQ-QUERY-008 | When multiple filters are present, the system shall join them with AND in insertion order. | TEST-QUERY-008 |
## Design
Query is immutable: each fluent method copies tuple state.
Identifiers are model-validated; values and limits use SQLite question-mark parameters.
## Assumptions / risks
No raw SQL escape hatch; unsupported operators fail closed.
The runtime spike proves SQLite parameter binding, including LIMIT.
