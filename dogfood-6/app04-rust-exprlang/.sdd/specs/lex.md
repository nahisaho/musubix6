---
feature: lex
tier: T1
---
# lex
Goal: turn source text into spanned tokens. Non-goals: floats, strings.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEX-001 | When the source has a decimal integer literal, the lexer shall emit Int(n) with the byte span of the literal. | TEST-LEX-001 |
| REQ-LEX-002 | When the source has an identifier, the lexer shall emit Ident, except let/in/fn/if/then/else/true/false which become keyword tokens. | TEST-LEX-002 |
| REQ-LEX-003 | When operators appear, the lexer shall emit the longest match among == != <= >= && \|\| => -> and the single-char operators. | TEST-LEX-003 |
| REQ-LEX-004 | While scanning, the lexer shall skip whitespace and # line comments while keeping byte-offset spans. | TEST-LEX-004 |
| REQ-LEX-005 | If an unknown character occurs, then the lexer shall return a LexError whose span is that character. | TEST-LEX-005 |
| REQ-LEX-006 | If an integer literal exceeds i64, then the lexer shall return a LexError spanning the literal. | TEST-LEX-006 |
| REQ-LEX-007 | The lexer shall end every successful token stream with an Eof token whose span is the empty span at the source end. | TEST-LEX-007 |
