---
feature: index
tier: T2
---
# index
Goal: positional inverted index with block-compressed, skippable postings and tombstone deletes.
Non-goals: persistence to disk, segment merging.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INDEX-001 | When a document is added, the system shall expose per term a posting with docId, tf and strictly increasing positions through a cursor. | TEST-INDEX-001 |
| REQ-INDEX-002 | If a docId is not greater than the last added docId, then add shall throw IllegalArgumentException. | TEST-INDEX-002 |
| REQ-INDEX-003 | The system shall report docCount, docLength, docFreq, collectionFreq and avgDocLength over live documents. | TEST-INDEX-003 |
| REQ-INDEX-004 | If a term is unknown, then its cursor shall be empty. | TEST-INDEX-004 |
| REQ-INDEX-005 | When the index is frozen, subsequent add shall throw IllegalStateException and a second freeze shall be a no-op. | TEST-INDEX-005 |
| REQ-INDEX-006 | When the index is frozen, every cursor shall yield exactly the postings it yielded before freezing, including lists spanning several 128-posting blocks. | TEST-INDEX-006 |
| REQ-INDEX-007 | When advance(target) is called, the cursor shall move to the first live doc >= target, never move backwards and return false past the end. | TEST-INDEX-007 |
| REQ-INDEX-008 | When the index is frozen, compressedBytes shall be smaller than rawBytes for a dense postings list. | TEST-INDEX-008 |
| REQ-INDEX-009 | When a document is deleted, cursors, docFreq, docCount and avgDocLength shall ignore it, before and after freeze; deleting an unknown or already deleted doc shall return false. | TEST-INDEX-009 |
| REQ-INDEX-010 | If a Posting has a negative docId, no positions, or positions not strictly increasing, then construction shall throw IllegalArgumentException. | TEST-INDEX-010 |

## Design
State machine:

| State | Event | Next | Note |
| --- | --- | --- | --- |
| OPEN | add(doc>last) | OPEN | append in-memory posting |
| OPEN | add(doc<=last) | OPEN | IllegalArgumentException |
| OPEN | freeze | FROZEN | encode blocks of 128 postings |
| FROZEN | freeze | FROZEN | no-op |
| FROZEN | add | FROZEN | IllegalStateException |
| any | delete(live doc) | same | tombstone set, returns true |

Invariants:

| Id | Invariant |
| --- | --- |
| I1 | postings of a term are ordered by docId, positions strictly increasing |
| I2 | block k covers postings [128k,128k+127]; skip table holds each block's first docId |
| I3 | advance decodes at most the one block located by binary search over the skip table |
| I4 | docFreq = live postings only; avgDocLength = sum(live lengths)/docCount (0 when empty) |
| I5 | block bytes = GapCodec(docIds), VByte(tfs), VByte(per-doc gap-coded positions) |

## Assumptions / risks
- Delete never rewrites blocks; cursors filter tombstones (TEST-INDEX-009).
