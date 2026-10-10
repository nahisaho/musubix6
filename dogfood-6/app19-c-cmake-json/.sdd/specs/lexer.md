---
feature: lexer
tier: T2
---
# lexer
Goal: push-style (chunk-fed) JSON tokenizer with exact positions and strict RFC 8259 lexing. Non-goals: building values, comments, NaN/Infinity.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LEX-001 | When input is fed in arbitrary chunk splits (down to 1 byte), the lexer shall emit exactly the same tokens and error as when fed whole. | TEST-LEX-001 |
| REQ-LEX-002 | When structural characters { } [ ] : , or literals true false null occur, the lexer shall emit the matching token and skip space, tab, LF, CR between tokens. | TEST-LEX-002 |
| REQ-LEX-003 | When a string contains the escapes \" \\ \/ \b \f \n \r \t or \uXXXX (including a high+low surrogate pair), the lexer shall emit the decoded UTF-8 text. | TEST-LEX-003 |
| REQ-LEX-004 | If a string has an unknown escape, a malformed \u, or a lone high/low surrogate, then the lexer shall fail with LEX_ERR_ESCAPE or LEX_ERR_SURROGATE respectively. | TEST-LEX-004 |
| REQ-LEX-005 | If a raw byte below 0x20 appears inside a string, then the lexer shall fail with LEX_ERR_CTRL at that byte. | TEST-LEX-005 |
| REQ-LEX-006 | If a string contains invalid UTF-8 (stray continuation, overlong, surrogate code point, above U+10FFFF, truncated), then the lexer shall fail with LEX_ERR_UTF8. | TEST-LEX-006 |
| REQ-LEX-007 | When a number matches -?(0\|[1-9][0-9]*)(.[0-9]+)?([eE][+-]?[0-9]+)?, the lexer shall emit TOK_NUMBER with is_int set only when it has no fraction or exponent; otherwise it shall fail with LEX_ERR_NUMBER. | TEST-LEX-007 |
| REQ-LEX-008 | When a token is emitted or an error occurs, the lexer shall report offset (0-based), line and column (1-based, in bytes, LF increments line) of the token start or offending byte. | TEST-LEX-008 |
| REQ-LEX-009 | If input ends inside a string, escape, or partial literal, then lex_finish shall fail with LEX_ERR_EOF; a number in a terminal state shall be emitted by lex_finish before TOK_EOF. | TEST-LEX-009 |
| REQ-LEX-010 | If a decoded string or number text exceeds the configured max_token bytes, then the lexer shall fail with LEX_ERR_TOOLONG; a bad literal such as tru or nulL shall fail with LEX_ERR_LITERAL. | TEST-LEX-010 |

## Design
Components: `json_lexer` holds a byte-at-a-time DFA, a growable token buffer, a position cursor, and a sticky error. Data flow: lex_feed(chunk) → for each byte `step()` → on token completion call `cb(ctx, &tok)` → nonzero return aborts with LEX_ERR_CALLBACK. State never depends on chunk boundaries (all context is in the DFA state), which gives chunk invariance.

| State | Byte | Next | Action |
| --- | --- | --- | --- |
| VALUE | ws | VALUE | skip |
| VALUE | `{}[]:,` | VALUE | emit structural |
| VALUE | `"` | STR | start buffer |
| VALUE | `-` | NUM_MINUS | buffer |
| VALUE | `0` | NUM_ZERO | buffer |
| VALUE | `1-9` | NUM_INT | buffer |
| VALUE | `t f n` | LIT | expect rest of word |
| VALUE | other | — | LEX_ERR_CHAR |
| STR | `"` | VALUE | emit string |
| STR | `\` | ESC | — |
| STR | <0x20 | — | LEX_ERR_CTRL |
| STR | >=0x80 | UTF8 | validate lead byte, remaining count, 2nd-byte range |
| ESC | `"\/bfnrt` | STR | append |
| ESC | `u` | U(4 hex) | collect |
| U | hex x4 | STR / SURR_WAIT | high surrogate → expect `\u` low |
| SURR_WAIT | `\` `u` | U(low) | else LEX_ERR_SURROGATE |
| NUM_MINUS | digit | NUM_ZERO/NUM_INT | else LEX_ERR_NUMBER |
| NUM_ZERO | `.` / e E | FRAC0 / EXP0 | digit → LEX_ERR_NUMBER; other → emit and reprocess byte |
| NUM_INT | digit / `.` / e E | same / FRAC0 / EXP0 | other → emit and reprocess |
| FRAC0 | digit | FRAC | else LEX_ERR_NUMBER |
| EXP0 | `+-` / digit | EXPSIGN / EXP | else LEX_ERR_NUMBER |

Surrogate errors are reported at the last hex digit of the offending `\uXXXX` (lone low, bad low after a high) or at the byte following a high surrogate that is not `\u`. Invariants: error is sticky (feed after error returns the same error); feed after lex_finish → LEX_ERR_STATE; line/col of an error are those of the offending byte; token buffer length never exceeds max_token.
UTF-8 second-byte ranges: E0→A0..BF, ED→80..9F, F0→90..BF, F4→80..8F; lead C0,C1,F5..FF invalid.

## Assumptions / risks
- Reprocessing a number terminator must not double-advance the cursor (TEST-LEX-008 checks column after `12,`).
- Position of a token split across chunks is its first byte (TEST-LEX-001 compares positions under 1-byte chunks).
