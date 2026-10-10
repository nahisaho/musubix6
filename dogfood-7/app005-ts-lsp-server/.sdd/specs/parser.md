---
feature: parser
tier: T2
approval: auto
---
# Incremental mini-language parser
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSER-001 | When parsing a declaration, the parser shall expose its name and initializer references. | TEST-PARSER-001 |
| REQ-PARSER-002 | When scanning comments, the parser shall ignore comment identifiers. | TEST-PARSER-002 |
| REQ-PARSER-003 | When scanning identifiers, tokens shall retain exact UTF-16 source offsets. | TEST-PARSER-003 |
| REQ-PARSER-004 | If a terminator is missing, the parser shall recover with an insertion issue. | TEST-PARSER-004 |
| REQ-PARSER-005 | If syntax is malformed, the parser shall recover and preserve following lines. | TEST-PARSER-005 |
| REQ-PARSER-006 | When an unchanged line retains its offset, incremental parse shall reuse its node identity. | TEST-PARSER-006 |
| REQ-PARSER-007 | When an earlier line grows, incremental parse shall recompute shifted offsets. | TEST-PARSER-007 |
| REQ-PARSER-008 | When parsing brace lines, the parser shall expose scope boundaries. | TEST-PARSER-008 |
## Design
One statement per physical line; let ID = expression; print expression; and brace-only block lines.
Expressions are integer/identifier terms joined with +. Cache by raw line and start offset; tokenize only changed checkpoints.
## Assumptions
ASCII identifiers; integer literals; comments use //. Empty lines preserve line checkpoints.
No multiline expressions or strings; malformed syntax yields issues rather than exceptions.
