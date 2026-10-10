---
feature: ingest
tier: T2
---
# ingest
Goal: Go line-protocol parser (`name{k=v,k2=v2} value ts`), canonical series keys, batch parsing, skew check and bounded dedupe.   Non-goals: network transport, float values.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INGEST-001 | When ParseLine reads `name{b=2,a=1} 42 1700000000`, the system shall return name, labels sorted by key, uint64 value and int64 timestamp. | TEST-INGEST-001 |
| REQ-INGEST-002 | When a line has no braces (`name 5 100`), ParseLine shall return a point with no labels. | TEST-INGEST-002 |
| REQ-INGEST-003 | If the name does not match [a-zA-Z_][a-zA-Z0-9_.]* or exceeds maxNameLen, then ParseLine shall return ErrName. | TEST-INGEST-003 |
| REQ-INGEST-004 | If a label key is invalid, a key is duplicated, the label count exceeds maxLabels, or an unescaped value exceeds maxLabelValueLen, then ParseLine shall return ErrLabels. | TEST-INGEST-004 |
| REQ-INGEST-005 | If the value is not a plain decimal uint64 (sign, fraction, hex, empty, overflow), then ParseLine shall return ErrValue. | TEST-INGEST-005 |
| REQ-INGEST-006 | If the timestamp is not a decimal int64 or is negative, then ParseLine shall return ErrTimestamp. | TEST-INGEST-006 |
| REQ-INGEST-007 | The system shall accept the escapes `\\`, `\,`, `\}` and `\=` in label values and return ErrFormat for any other escape, unterminated brace or wrong field count. | TEST-INGEST-007 |
| REQ-INGEST-008 | The SeriesKey shall be identical for permuted labels and different for different label sets, escaping separators so that no two distinct label sets collide. | TEST-INGEST-008 |
| REQ-INGEST-009 | When ParseBatch reads text, the system shall skip blank and `#` lines, report each bad line with its 1-based number, reject lines longer than maxLineLen with ErrTooLong and keep parsing. | TEST-INGEST-009 |
| REQ-INGEST-010 | If a timestamp is more than maxSkewSeconds after now, then CheckSkew shall return ErrSkew; older timestamps shall be accepted. | TEST-INGEST-010 |
| REQ-INGEST-011 | When the Deduper sees an identical (series, ts, value) triple within its FIFO capacity it shall report a duplicate; once the entry is evicted it shall report new; capacity <= 0 shall return ErrCapacity. | TEST-INGEST-011 |

## Design
Components: `ingest.ParseLine/ParseBatch/CheckSkew/SeriesKey/Deduper` on top of `contract.Limits`.

| Step | Input | Failure |
| --- | --- | --- |
| split | name `{labels}`? value ts | ErrFormat |
| name | charset, len | ErrName |
| labels | key charset, dup, count, value len | ErrLabels |
| value/ts | decimal | ErrValue / ErrTimestamp |

Series key: `name{k1="v1",k2="v2"}` with `\`, `"`, `,`, `}` escaped by `\` in values, labels sorted by key. Dedupe: ring of capacity N plus a set; eviction is FIFO, so re-seeing a still-resident triple does not refresh it.
Invariants: SeriesKey injective on (name, label set); ParseBatch never panics and processes all lines; limits come only from the contract.
## Assumptions / risks: label value containing `,`/`}` could collide without escaping (TEST-INGEST-008).
