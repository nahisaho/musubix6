---
feature: diagnostics
tier: T2
approval: auto
---
# Diagnostics and quick fixes
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAG-001 | When syntax is incomplete, diagnostics shall report code, severity and precise range. | TEST-DIAG-001 |
| REQ-DIAG-002 | If an identifier is unresolved, diagnostics shall report undefined-name. | TEST-DIAG-002 |
| REQ-DIAG-003 | If a declaration is duplicated, diagnostics shall report duplicate-name at the second name. | TEST-DIAG-003 |
| REQ-DIAG-004 | If scopes are unbalanced, diagnostics shall report scope errors. | TEST-DIAG-004 |
| REQ-DIAG-005 | When fixing a missing semicolon, the action shall insert it before trailing comments. | TEST-DIAG-005 |
| REQ-DIAG-006 | If an undefined identifier has one close visible candidate, its action shall replace only that identifier. | TEST-DIAG-006 |
| REQ-DIAG-007 | If a fix version or document generation is stale, applying it shall reject without changing text. | TEST-DIAG-007 |
| REQ-DIAG-008 | When a newer document version is diagnosed, the server shall discard previous diagnostics. | TEST-DIAG-008 |
| REQ-DIAG-009 | When any public close path removes a document, its diagnostic cache shall become collectible. | TEST-DIAG-009 |
| REQ-DIAG-010 (test-only) | When exercising the workspace server facade, its existing definition, rename and quick-fix contracts shall remain stable. | TEST-DIAG-010 |
## Design
Merge parser and symbol issues in deterministic offset/code order; actions include URI, generation and snapshot version.
Typo candidates must be visible preceding declarations and unique at edit distance one.
## Assumptions
Diagnostics are synchronous core operations, with no JSON-RPC transport.
Quick fixes never delete declarations or invent bindings.
