---
feature: seq
tier: T2
approval: auto
---
# Replicated growable array
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SEQ-001 | When inserts form a parent chain, the sequence shall render its Unicode code points in chain order. | TEST-SEQ-001 |
| REQ-SEQ-002 | When siblings are concurrent, every sequence shall order them by descending Lamport time then descending ASCII actor then counter. | TEST-SEQ-002 |
| REQ-SEQ-003 | When identical operations repeat, apply shall return false without changing state. | TEST-SEQ-003 |
| REQ-SEQ-004 | When a hide targets a node, the node shall disappear while its descendants remain visible. | TEST-SEQ-004 |
| REQ-SEQ-005 | When show removes one hide tag, other actors' hide tags shall remain effective. | TEST-SEQ-005 |
| REQ-SEQ-006 | When operations arrive arbitrarily, including show before hide or child before parent, valid operations shall converge. | TEST-SEQ-006 |
| REQ-SEQ-007 | If IDs, clocks, code points, tags, parents or duplicate payloads are invalid, apply shall reject atomically. | TEST-SEQ-007 |
| REQ-SEQ-008 | When state is exported and replayed, it shall preserve canonical operations and isolate caller mutations. | TEST-SEQ-008 |
## Design
RGA keeps immutable insert nodes, hide-tag sets and permanently removed tags; IDs are actor:counter, HEAD is the root.
Visible traversal is depth-first with descending siblings using a separate Lamport time; absent parents defer visibility. Iterative traversal avoids recursion overflow.
Operation validation precedes commit, including parent-cycle detection and same-ID payload collision detection.
Wire table: actor matches /^[A-Za-z0-9_-]+$/ and is not __proto__/constructor/prototype; seq/time are positive safe integers; clock values are nonnegative safe integers.
Variants are insert(after=HEAD or ID,value=one code point), hide(target=ID,tag=own ID), show(target=ID,tag=hide ID); unknown fields reject.
## Assumptions
Actors are ASCII identifiers and one code point is one editor index. Transport is untrusted and validated; memory is unbounded (no GC).
The runtime spike checks native TypeScript, UTF-16/code-point distinction and deterministic comparator permutations.
