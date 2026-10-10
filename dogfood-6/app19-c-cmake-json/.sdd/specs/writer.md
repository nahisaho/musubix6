---
feature: writer
tier: T2
---
# writer
Goal: JSON serializer: tree and event-stream writers with compact/pretty output, exact numbers, escaping, optional ASCII-only and canonical key order, and a validated state machine. Non-goals: comments, NaN/Infinity extensions, locale.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WRITE-001 | When json_write is called with indent 0, the system shall emit the tree without any whitespace. | TEST-WRITE-001 |
| REQ-WRITE-002 | When indent n>0 is set, the system shall emit one item per line indented by n spaces per level, write ": " after keys, and print empty arrays and objects as [] and {}. | TEST-WRITE-002 |
| REQ-WRITE-003 | When a string is written, the system shall escape quote, backslash, \b \f \n \r \t, other bytes below 0x20 as \u00xx, and leave "/" , DEL and valid UTF-8 unescaped. | TEST-WRITE-003 |
| REQ-WRITE-004 | Where ascii_only is set, the system shall write every non-ASCII code point as lowercase \uxxxx, using a surrogate pair above U+FFFF. | TEST-WRITE-004 |
| REQ-WRITE-005 | When numbers are written, the system shall print int64 exactly (including INT64_MIN), print doubles with the shortest %.15g/%.16g/%.17g form that round-trips, append ".0" to integral doubles without exponent, and fail with JW_ERR_NONFINITE for NaN or infinity. | TEST-WRITE-005 |
| REQ-WRITE-006 | When json_write_buf is called, the system shall return the full length needed, copy at most cap-1 bytes and always NUL-terminate when cap>0 (snprintf semantics). | TEST-WRITE-006 |
| REQ-WRITE-007 | Where sort_keys is set, the system shall emit object members in ascending bytewise key order without modifying the tree. | TEST-WRITE-007 |
| REQ-WRITE-008 | When the event writer receives an illegal event (key outside an object, value without key in an object, key twice, mismatched end, second top-level value, finish with open containers), the system shall return JW_ERR_STATE and keep failing afterwards. | TEST-WRITE-008 |
| REQ-WRITE-009 | When any document is written and parsed again, the system shall yield a tree json_equal to the original, for compact, pretty, ascii_only and sorted output, with doubles bit-exact. | TEST-WRITE-009 |
| REQ-WRITE-010 | If the sink returns non-zero, then the writer shall return JW_ERR_SINK and call the sink no more. | TEST-WRITE-010 |

## Design
Components: `json_writer` (event state machine: stack of container kinds + per-level "first item" flag + pending-key flag, sticky error) and a tree walker `json_write` that turns a json_value into events (optionally sorting members via an index permutation). Output is pushed in small pieces to a sink; json_write_buf is a sink that counts and copies.

| Context | Event | Legal | Output |
| --- | --- | --- | --- |
| top, empty | value/begin | yes | value |
| top, done | any value | no (JW_ERR_STATE) | — |
| array | value/begin | yes | `,` unless first; newline+indent when pretty |
| array | key | no | JW_ERR_STATE |
| object, no pending key | key | yes | `,` unless first; newline+indent; key; `:` (+space pretty) |
| object, no pending key | value/begin | no | JW_ERR_STATE |
| object, key pending | value/begin | yes | value |
| object, key pending | key / end | no | JW_ERR_STATE |
| array / object | matching end | yes | newline+indent only if non-empty |
| array / object | mismatched end, or end at top | no | JW_ERR_STATE |
| finish | containers open or no value | no | JW_ERR_STATE |

Invariants: depth == stack size; first-flag is true exactly until the first item; once an error is set no further bytes are emitted; sorted output uses a permutation array, never mutating members.

## Assumptions / risks
- Shortest round-trip via %.15g..%.17g loop is correct for all finite doubles (checked by TEST-WRITE-005/009 on tricky values such as 0.1, 5e-324, 1.7976931348623157e308).
