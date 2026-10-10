---
feature: text
tier: T2
approval: auto
---
# Versioned documents
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TEXT-001 | When opening a URI, the store shall retain text and version. | TEST-TEXT-001 |
| REQ-TEXT-002 | If a URI is already open, the store shall reject replacement. | TEST-TEXT-002 |
| REQ-TEXT-003 | When a greater version arrives, the store shall apply ordered UTF-16 edits. | TEST-TEXT-003 |
| REQ-TEXT-004 | If a version is stale, the store shall leave the document unchanged. | TEST-TEXT-004 |
| REQ-TEXT-005 | If any edit range is invalid, the store shall roll back the whole batch. | TEST-TEXT-005 |
| REQ-TEXT-006 | When converting valid representable positions, the system shall round-trip UTF-16 offsets and reject CRLF interiors. | TEST-TEXT-006 |
| REQ-TEXT-007 | When closing a URI, the store shall remove it and reject later changes. | TEST-TEXT-007 |
| REQ-TEXT-008 | When a caller mutates a snapshot, the store shall remain unchanged. | TEST-TEXT-008 |
| REQ-TEXT-009 | If text ends with a lone CR, offset conversion shall retain it as line content. | TEST-TEXT-009 |
## Design
Pure range helpers and a Map-based store; snapshots copy immutable text/version records.
Open→change→close uses strictly increasing safe integer versions; edit batches stage before commit; each open gets a fresh generation.
## Assumptions
Node 24 executes erasable TypeScript directly; positions count UTF-16 code units, not scalar values.
Sequential edits address the text produced by preceding edits; offsetAt rejects positions inside CRLF.
