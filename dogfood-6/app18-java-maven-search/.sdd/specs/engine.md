---
feature: engine
tier: T2
---
# engine
Goal: evaluate parsed queries on the index (sorted merges, positional phrases) and return BM25-ranked top-k.
Non-goals: caching, concurrency.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENGINE-001 | When a Term query is evaluated, the system shall return the ascending live docIds containing it. | TEST-ENGINE-001 |
| REQ-ENGINE-002 | When AND is evaluated, the system shall intersect two ascending arrays by linear merge (empty, disjoint, identical inputs included). | TEST-ENGINE-002 |
| REQ-ENGINE-003 | When OR is evaluated, the system shall union two ascending arrays without duplicates. | TEST-ENGINE-003 |
| REQ-ENGINE-004 | When NOT is evaluated, the system shall subtract the operand from the universe of live docs, excluding deleted docs. | TEST-ENGINE-004 |
| REQ-ENGINE-005 | When a Phrase is evaluated, the system shall match docs where token i occurs at p + offset_i for one p. | TEST-ENGINE-005 |
| REQ-ENGINE-006 | When a phrase was parsed across a stopword, the system shall only match text with exactly that gap. | TEST-ENGINE-006 |
| REQ-ENGINE-007 | When a phrase repeats a term, the system shall require distinct adjacent occurrences. | TEST-ENGINE-007 |
| REQ-ENGINE-008 | When searching, the system shall rank matches by BM25 over the positive terms, return the top k and break ties by docId. | TEST-ENGINE-008 |
| REQ-ENGINE-009 | When docs are deleted or the index is frozen, search results shall exclude deleted docs and otherwise be identical. | TEST-ENGINE-009 |
| REQ-ENGINE-010 | If the query has a syntax error, then search shall propagate QuerySyntaxException; if k <= 0 it shall throw IllegalArgumentException. | TEST-ENGINE-010 |

## Design
Evaluation is a post-order walk over the Query tree.

| Node | Result | Cost |
| --- | --- | --- |
| Term | docs of cursor (live only) | O(df) |
| Phrase | docs of AND of its terms filtered by position check | O(sum df + positions) |
| And | merge-intersect | O(a+b) |
| Or | merge-union | O(a+b) |
| Not | universe minus operand | O(U+a) |

| Id | Invariant |
| --- | --- |
| I1 | all intermediate arrays are strictly ascending |
| I2 | results never contain a deleted doc |
| I3 | search(q,k) is a prefix of the full ranking |
| I4 | positive terms for scoring exclude anything under a Not |

## Assumptions / risks
- Frozen and open indexes must give identical results (TEST-ENGINE-009).
