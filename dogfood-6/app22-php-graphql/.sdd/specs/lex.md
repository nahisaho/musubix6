---
feature: lex
tier: T1
approval: auto
---
# lex
Goal: GraphQL tokenizer shared by the SDL and query parsers.   Non-goals: BOM handling.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEX-001 | When the source holds punctuators (`! $ & ( ) ... : = @ [ ] { | }`), the lexer shall emit one token per punctuator, `...` as one token. | TEST-LEX-001 |
| REQ-LEX-002 | When the source holds names, the lexer shall emit Name tokens matching `[_A-Za-z][_0-9A-Za-z]*`. | TEST-LEX-002 |
| REQ-LEX-003 | When the source holds numbers, the lexer shall emit Int for integers and Float for fraction/exponent forms, with optional leading minus. | TEST-LEX-003 |
| REQ-LEX-004 | If a number has a leading zero followed by a digit, or a dangling `.` or exponent, then the lexer shall throw SyntaxError. | TEST-LEX-004 |
| REQ-LEX-005 | When a string contains escapes (`\n \t \" \\ \/ \uXXXX`), the lexer shall emit the decoded value. | TEST-LEX-005 |
| REQ-LEX-006 | When a block string is lexed, the lexer shall remove the common indentation and leading/trailing blank lines and decode `\"""`. | TEST-LEX-006 |
| REQ-LEX-007 | While lexing, the lexer shall ignore whitespace, commas, line terminators and `#` comments. | TEST-LEX-007 |
| REQ-LEX-008 | The lexer shall record 1-based line and column on every token, and end the stream with one EOF token. | TEST-LEX-008 |
| REQ-LEX-009 | If a string is unterminated, has a bad escape or an unknown character appears, then the lexer shall throw SyntaxError carrying line and column. | TEST-LEX-009 |
| REQ-LEX-010 | When a string holds a `\uD83D\uDE00`-style surrogate pair escape, the lexer shall decode it to one supplementary code point, and if a surrogate is lone or mispaired then the lexer shall throw SyntaxError. | TEST-LEX-010 |
