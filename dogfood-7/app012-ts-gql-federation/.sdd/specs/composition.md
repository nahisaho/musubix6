---
feature: composition
tier: T2
approval: auto
---
# Composition
Goal: Compose a validated, immutable-by-convention federated SDL contract.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMP-001 | When subgraphs define disjoint root fields, the composer shall retain their owners. | TEST-COMP-001 |
| REQ-COMP-002 | When entity fields are external, the composer shall retain the nonexternal owner. | TEST-COMP-002 |
| REQ-COMP-003 | When a key is compound or nested, the composer shall preserve its field tree. | TEST-COMP-003 |
| REQ-COMP-004 | If two nonshareable fields have owners, the composer shall reject the conflict. | TEST-COMP-004 |
| REQ-COMP-005 | If field types disagree, the composer shall reject the composition. | TEST-COMP-005 |
| REQ-COMP-006 | If a key references an undeclared field or a cross-owner entity has no usable key, the composer shall reject it. | TEST-COMP-006 |
| REQ-COMP-007 | If requires dependencies form a cycle, the composer shall reject it. | TEST-COMP-007 |
| REQ-COMP-008 | When shareable fields agree, the composer shall choose the first owner deterministically. | TEST-COMP-008 |
## Design
Tokenizer and recursive SDL reader produce a common type/field/fieldset model.
Composition merges ownership before validating keys, requires and dependency cycles; failures are atomic.
## Assumptions
Spike: Node 24 strips native TypeScript; package-relative imports work without compilation.
Only object/scalar SDL, directives, queries and fragments are supported; no introspection or mutations.
Nested fieldsets use object types; malformed syntax is rejected, never silently truncated.
