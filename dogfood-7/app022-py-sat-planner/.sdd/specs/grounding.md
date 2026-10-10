---
feature: grounding
tier: T2
approval: auto
---
# grounding
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GRD-001 | When grounding, the system shall enumerate each typed parameter assignment. | TEST-GRD-001 |
| REQ-GRD-002 | When grounding, the system shall substitute parameters in preconditions and effects. | TEST-GRD-001 |
| REQ-GRD-003 | When grounding parameterless actions, the system shall emit one action. | TEST-GRD-001 |
| REQ-GRD-004 | If no object matches a parameter type, the system shall emit no assignment. | TEST-GRD-001 |
| REQ-GRD-005 | If the problem names another domain, the system shall reject grounding. | TEST-GRD-002 |
| REQ-GRD-006 | If an atom has an unknown predicate or wrong arity, the system shall reject it. | TEST-GRD-002 |
| REQ-GRD-007 | If an atom refers to an unbound variable or unknown object, the system shall reject it. | TEST-GRD-002 |
| REQ-GRD-008 | When applying an action, the system shall require preconditions and apply deletes before adds. | TEST-GRD-002 |
## Design
Validate lifted atoms and all problem atoms before Cartesian enumeration, even for empty type pools.
Ground tasks own immutable action tuples, initial state and goal; transition is pure.
## Assumptions
Objects may bind to multiple parameters; typed predicate argument compatibility is validated.
