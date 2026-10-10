---
feature: relation
tier: T2
approval: auto
---
# Relationships
Goal: Explicit many-to-one and one-to-many loading without N+1 prefetch.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RELATION-001 | When a lazy parent is loaded twice, the system shall cache it without a second SELECT. | TEST-RELATION-001 |
| REQ-RELATION-002 | When a nullable foreign key is None, the system shall return None without querying. | TEST-RELATION-002 |
| REQ-RELATION-003 | When children are loaded, the system shall select rows by the declared foreign key. | TEST-RELATION-003 |
| REQ-RELATION-004 | When parents are prefetched, the system shall fetch all unique keys in one SELECT. | TEST-RELATION-004 |
| REQ-RELATION-005 | When a referenced row is missing, the system shall cache None. | TEST-RELATION-005 |
| REQ-RELATION-006 | When a relationship uses an unknown field, the system shall reject it. | TEST-RELATION-006 |
| REQ-RELATION-007 | When lazy loading reaches an existing identity, the system shall reuse the session object. | TEST-RELATION-007 |
| REQ-RELATION-008 | When children are prefetched, the system shall batch one SELECT and group empty collections. | TEST-RELATION-008 |
| REQ-RELATION-009 | When any loading API receives another session's object, the system shall raise ValueError. | TEST-RELATION-009 |
| REQ-RELATION-010 | When a child's foreign key changes, the system shall invalidate its cached parent, including cached None. | TEST-RELATION-010 |
| REQ-RELATION-011 | When prefetch encounters a dirty foreign key, the system shall group children by persisted query membership without overwriting dirty values. | TEST-RELATION-011 |
## Design
Relationship owns a Session; caches use object identity plus the current foreign-key value.
Prefetch uses Query IN filters and Session hydration to preserve identities.
## Assumptions / risks
Cross-session object relationships are rejected; caches are invalidated when an FK changes.
Collections are explicit snapshots; callers reload after inserting new children.
