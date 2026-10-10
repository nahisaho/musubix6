---
feature: parser
tier: T2
---
# parser
Goal: streaming JSON parser that builds an arena-allocated DOM from lexer tokens, with a nesting-depth limit, duplicate-key policy, JSON-Pointer error paths and rollback on failure. Non-goals: comments, big numbers, locale handling.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSE-001 | When a valid document is parsed, the system shall build a json_value tree with types null, bool, int, double, string, array and object holding the document's values. | TEST-PARSE-001 |
| REQ-PARSE-002 | When an object has duplicate keys, the system shall fail with JSON_ERR_DUPKEY at the second key by default, and with JSON_DUP_LAST shall keep the first position but the last value. | TEST-PARSE-002 |
| REQ-PARSE-003 | If nesting exceeds max_depth (default 64), then the parser shall fail with JSON_ERR_DEPTH at the offending opening bracket. | TEST-PARSE-003 |
| REQ-PARSE-004 | If a token is illegal for the current grammar state (trailing comma, missing colon, non-string key, missing comma, mismatched or unclosed bracket), then the parser shall fail with JSON_ERR_SYNTAX and a message naming the expected tokens. | TEST-PARSE-004 |
| REQ-PARSE-005 | If the document has no value, then the parser shall fail with JSON_ERR_EMPTY; if a second value or any token follows the top-level value, it shall fail with JSON_ERR_TRAILING. | TEST-PARSE-005 |
| REQ-PARSE-006 | When a number token is an integer fitting int64 the system shall store JSON_INT; when it overflows int64, has a fraction or exponent, or is -0, it shall store JSON_DOUBLE; if the double overflows to infinity, then the parser shall fail with JSON_ERR_RANGE. | TEST-PARSE-006 |
| REQ-PARSE-007 | When input is fed in chunks of any size, the parser shall produce a tree equal to the whole-input parse, or the same error. | TEST-PARSE-007 |
| REQ-PARSE-008 | When an error occurs, the system shall report line, column, offset and a JSON Pointer path of the slot being parsed, with ~ escaped as ~0 and / as ~1, truncated to 255 bytes. | TEST-PARSE-008 |
| REQ-PARSE-009 | If parsing fails, then the system shall rewind the arena to its state before the parse and return no value. | TEST-PARSE-009 |
| REQ-PARSE-010 | When json_obj_get is called, the system shall return the member value or NULL, using a sorted index (binary search) for objects with more than 8 members. | TEST-PARSE-010 |
| REQ-PARSE-011 | When json_equal compares two values, the system shall return true for deep structural equality where numbers compare by value (1 equals 1.0, -0 equals 0) and objects compare regardless of member order. | TEST-PARSE-011 |
| REQ-PARSE-012 | When a value is built, the system shall record the line, column and offset of its first byte in the value. | TEST-PARSE-012 |

## Design
Components: `json_parser` owns a lexer (feature lexer), a malloc'd frame stack, the arena pointer and a start mark (feature arena). Data flow: lex_feed → token callback → `consume(tok)` state machine → value built into arena → root stored. A failure discards frames, rewinds the arena to the start mark, and fills `json_error`.

| Parser state | Token | Next state | Action |
| --- | --- | --- | --- |
| TOP_VALUE | scalar | TOP_DONE | root = value |
| TOP_VALUE | `[` / `{` | ARR_FIRST / OBJ_FIRST | push frame, depth check |
| TOP_VALUE | EOF | — | JSON_ERR_EMPTY |
| TOP_DONE | EOF | done | finish |
| TOP_DONE | other | — | JSON_ERR_TRAILING |
| ARR_FIRST | `]` | pop | close array |
| ARR_FIRST / ARR_VALUE | value start | ARR_NEXT (after value) | append item |
| ARR_NEXT | `,` | ARR_VALUE | — |
| ARR_NEXT | `]` | pop | close |
| ARR_VALUE | `]` | — | syntax (trailing comma) |
| OBJ_FIRST | `}` / string | pop / OBJ_COLON | close / remember key |
| OBJ_COLON | `:` | OBJ_VALUE | else syntax |
| OBJ_VALUE | value start | OBJ_NEXT (after value) | add member, dup check |
| OBJ_NEXT | `,` / `}` | OBJ_KEY / pop | — |
| OBJ_KEY | string | OBJ_COLON | else syntax (non-string key, trailing comma) |
| any | EOF inside a container | — | JSON_ERR_SYNTAX "unexpected end" |

Invariants: depth == number of open frames <= max_depth; every frame's member index is sorted by (memcmp, length) with unique keys under the default policy; arena bytes after a failed parse equal bytes before; path always describes the slot where the error was detected (array: next index, object: the current key, or the object path when no key is pending).
Decisions: members are collected in malloc'd frame buffers and copied into the arena at close, so a failed parse leaves nothing to rewind except finished subtrees (rewind covers them); objects with count > 8 get an arena `size_t index[]` for binary search.
Error codes: JSON_OK, JSON_ERR_LEX (with lex code), JSON_ERR_SYNTAX, JSON_ERR_DEPTH, JSON_ERR_DUPKEY, JSON_ERR_TRAILING, JSON_ERR_EMPTY, JSON_ERR_RANGE, JSON_ERR_NOMEM.

## Assumptions / risks
- strtod of a token without NUL termination: copy into the lexer's NUL-terminated buffer (TEST-PARSE-006 covers 1e400 and 9223372036854775808).
- Sorted index must stay correct while members are inserted during parsing (TEST-PARSE-010 uses 1000 keys with shared prefixes).
