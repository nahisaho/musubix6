---
feature: recovery
tier: T2
---
# recovery
Goal: parse a `;`-separated program of expressions, collecting several diagnostics instead of stopping at the first. Non-goals: statements other than expressions, incremental parsing.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REC-001 | When every statement of a program is valid, the system shall return all statements parsed and zero diagnostics. | TEST-REC-001 |
| REQ-REC-002 | When a statement is invalid, the system shall add a diagnostic positioned at the failure offset in the whole program, put an ErrorStmt in its place and continue with the next statement. | TEST-REC-002 |
| REQ-REC-003 | When synchronizing after an error, the system shall skip to the next `;` at paren depth 0, ignoring `;` inside string literals, `#` comments and parentheses. | TEST-REC-003 |
| REQ-REC-004 | When the number of diagnostics reaches MaxDiagnostics, the system shall stop parsing and add one final "too many errors" diagnostic. | TEST-REC-004 |
| REQ-REC-005 | When the final statement lacks a trailing `;`, the system shall still parse it; empty statements (`;;`) shall be ignored. | TEST-REC-005 |
| REQ-REC-006 | When Render is called for a diagnostic, the system shall output `line L, col C: message`, the source line and a caret line aligned under the column. | TEST-REC-006 |
| REQ-REC-007 | When a statement slice contains only whitespace and comments, the system shall ignore it like an empty statement (bug fix: it was reported as an error). | TEST-REC-007 |

## Design
Components: `Recovery.ParseProgram(text, maxDiagnostics)` -> `ProgramResult(Statements, Diagnostics)`; statement slices are parsed with `Grammar.Parse` on a space-padded copy so offsets stay global.
State table (scanner while synchronizing):

| State | Sees | Next state | Action |
| --- | --- | --- | --- |
| Code | `"` | InString | - |
| Code | `#` | Comment | - |
| Code | `(` / `)` | Code | depth +1 / -1 (not below 0) |
| Code | `;` and depth 0 | statement end | emit slice |
| InString | `\` | InString | skip next char |
| InString | `"` | Code | - |
| Comment | newline | Code | - |

Invariants: (I1) every statement slice ends at a depth-0 `;` or EOF, so scanning always makes progress; (I2) diagnostics are sorted by offset and offsets are unique; (I3) diagnostics count <= maxDiagnostics + 1 (the note); (I4) statements + empty slices cover the whole text exactly once.
Decision: scan first, parse slices second, so a lexical oddity in one statement never changes the boundaries of the next.
## Assumptions / risks: an unterminated string swallows the rest of the program into one statement (documented, one diagnostic).
