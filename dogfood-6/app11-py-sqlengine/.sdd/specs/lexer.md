---
feature: lexer
tier: T1
approval: auto
---
# lexer
Goal: turn SQL text into positioned tokens. Non-goals: dialect extensions, unicode identifiers.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEX-001 | When a word matches a reserved keyword (any case), the tokenizer shall emit a KEYWORD token with the upper-cased value. | TEST-LEX-001 |
| REQ-LEX-002 | When a word is not reserved, the tokenizer shall emit an IDENT token keeping its case; a double-quoted identifier (with `""` escape) shall be an IDENT even if reserved. | TEST-LEX-002 |
| REQ-LEX-003 | When digits appear, the tokenizer shall emit NUMBER with an int value, or a float value if it has a fraction or exponent. | TEST-LEX-003 |
| REQ-LEX-004 | When a single-quoted string appears, the tokenizer shall emit STRING with `''` unescaped to one quote. | TEST-LEX-004 |
| REQ-LEX-005 | The tokenizer shall emit OP for `= <> != < <= > >= + - * / % \|\|` using longest match, normalising `!=` to `<>`. | TEST-LEX-005 |
| REQ-LEX-006 | The tokenizer shall skip whitespace, `-- line` comments and `/* block */` comments. | TEST-LEX-006 |
| REQ-LEX-007 | If a string, quoted identifier or block comment is unterminated, then the tokenizer shall raise LexError carrying the start offset. | TEST-LEX-007 |
| REQ-LEX-008 | If a character is not part of any token, then the tokenizer shall raise LexError carrying its offset. | TEST-LEX-008 |
| REQ-LEX-009 | The tokenizer shall give every token its 0-based start offset and end the list with exactly one EOF token. | TEST-LEX-009 |
