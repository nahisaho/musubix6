---
feature: symbols
tier: T2
approval: auto
---
# Lexical symbols
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SYMBOLS-001 | When analyzing a declaration, the table shall index its exact name range. | TEST-SYMBOLS-001 |
| REQ-SYMBOLS-002 | When analyzing a reference, the table shall bind the nearest preceding declaration. | TEST-SYMBOLS-002 |
| REQ-SYMBOLS-003 | If a nested block shadows a name, references shall bind the inner declaration. | TEST-SYMBOLS-003 |
| REQ-SYMBOLS-004 | When a scope closes, later references shall bind the outer declaration. | TEST-SYMBOLS-004 |
| REQ-SYMBOLS-005 | If a name is duplicated in one scope, the table shall report the second declaration. | TEST-SYMBOLS-005 |
| REQ-SYMBOLS-006 | If a reference has no visible preceding declaration, the table shall retain it unresolved. | TEST-SYMBOLS-006 |
| REQ-SYMBOLS-007 | When resolving an initializer, the new declaration shall not yet be visible. | TEST-SYMBOLS-007 |
| REQ-SYMBOLS-008 | If braces are unmatched, the table shall report scope issues without crashing. | TEST-SYMBOLS-008 |
## Design
Scope stack with parent IDs; immutable declaration IDs are name offsets.
Resolve initializer before inserting declaration, and keep per-reference declaration identity.
## Assumptions
Bindings are document-local; forward references are undefined. A duplicate retains the original binding.
Analysis is rebuilt from incremental AST nodes, never mutates cached parser output.
