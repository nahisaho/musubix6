---
feature: terms
tier: T2
approval: auto
---
# Ground expression contract
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TERMS-001 | When ground terms are built, the system shall compare and hash them structurally. | TEST-TERMS-001 |
| REQ-TERMS-002 | If a symbol is empty or an argument is not a term, the system shall reject it. | TEST-TERMS-002 |
| REQ-TERMS-003 | When a linear expression is built, the system shall normalize exact rational coefficients and remove zero entries. | TEST-TERMS-003 |
| REQ-TERMS-004 | When linear expressions are added, the system shall combine coefficients and constants. | TEST-TERMS-004 |
| REQ-TERMS-005 | When an expression is scaled, the system shall use exact rational arithmetic. | TEST-TERMS-005 |
| REQ-TERMS-006 | When a relation is created, the system shall support le, ge, eq, lt and gt. | TEST-TERMS-006 |
| REQ-TERMS-007 | When expressions are used as dictionary keys, the system shall preserve immutability. | TEST-TERMS-007 |
| REQ-TERMS-008 | If a numeric coefficient is a float or malformed relation, the system shall reject it rather than silently approximate. | TEST-TERMS-008 |
| REQ-TERMS-009 (test-only) | When package metadata is inspected, the system shall declare Python >=3.10 and version 0.1.0. | TEST-TERMS-009 |
## Design
Frozen structural Term and Linear values; Relation stores expression op zero. Boolean propositions are nullary only; argument-bearing predicates are unsupported.
Rational values accept integers, Fraction and decimal/fraction strings, never binary floats. No parser or quantifiers.
## Assumptions
Runtime spike verifies Fraction normalization, immutable tuple keys, and pytest name filtering.
