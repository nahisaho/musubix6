---
feature: source
tier: T1
---
# source
Goal: map character offsets of a text to 1-based line/column positions. Non-goals: unicode grapheme columns.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SRC-001 | When PosAt(0) is called on any text, the system shall return line 1, column 1. | TEST-SRC-001 |
| REQ-SRC-002 | When an offset follows a '\n', the system shall report the next line with column 1 and count each other char (incl. tab) as one column. | TEST-SRC-002 |
| REQ-SRC-003 | While a line ends with "\r\n", the system shall treat the pair as one line break and report an offset on the '\n' of the pair as still on the previous line. | TEST-SRC-003 |
| REQ-SRC-004 | If the offset is negative or greater than the text length, then PosAt shall throw ArgumentOutOfRangeException; offset == Length is valid. | TEST-SRC-004 |
| REQ-SRC-005 | When LineText(n) is called, the system shall return line n without its terminator, and throw ArgumentOutOfRangeException for an unknown line. | TEST-SRC-005 |
| REQ-SRC-006 | For every offset, PosAt shall agree with a naive linear scan (binary search over precomputed line starts). | TEST-SRC-006 |

## Assumptions / risks: lone '\r' is not a line break (retired by TEST-SRC-003).
