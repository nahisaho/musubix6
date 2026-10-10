---
feature: planning
tier: T2
approval: auto
---
# Entity query planning
Goal: Translate supported GraphQL queries into deterministic dependent fetch steps.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-001 | When root fields have different owners, the planner shall emit separate root fetches. | TEST-PLAN-001 |
| REQ-PLAN-002 | When nested fields change owners, the planner shall emit dependent entity fetches. | TEST-PLAN-002 |
| REQ-PLAN-003 | When an entity fetch needs a key, the planner shall inject hidden key fields upstream. | TEST-PLAN-003 |
| REQ-PLAN-004 | When a field declares requires, the planner shall fetch its prerequisites before that field. | TEST-PLAN-004 |
| REQ-PLAN-005 | When fields use aliases, the planner shall preserve response paths separately from field names. | TEST-PLAN-005 |
| REQ-PLAN-006 | When queries contain named or inline fragments, the planner shall expand matching selections. | TEST-PLAN-006 |
| REQ-PLAN-007 | When arguments contain variables or literals, the planner shall resolve them into fetch arguments. | TEST-PLAN-007 |
| REQ-PLAN-008 | If queries are malformed, select unknown fields, conflict on aliases, or have invalid scalar/object subselections, the planner shall reject them. | TEST-PLAN-008 |
| REQ-PLAN-009 | When injected keys collide with client aliases, the planner shall use collision-free hidden aliases. | TEST-PLAN-009 |
| REQ-PLAN-010 | When requires dependencies revisit a service, the planner shall split dependency stages without introducing cycles. | TEST-PLAN-010 |
| REQ-PLAN-011 | When a nested requires field is remote, the planner shall await every descendant prerequisite fetch. | TEST-PLAN-011 |
## Design
The shared lexer parses a query AST; schema-guided traversal splits selections by owner.
Fetch nodes carry dependency IDs, response paths and entity keys; hidden fields are excluded from final projection.
## Assumptions
Spike: arrays are represented by one static response path, traversed dynamically by the executor.
One query operation is supported; fragment cycles and unsupported operation forms are rejected.
