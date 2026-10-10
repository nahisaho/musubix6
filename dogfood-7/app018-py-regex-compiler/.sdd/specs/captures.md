---
feature: captures
tier: T2
approval: auto
---
# Captures
Goal: Transactional capture state and numeric/named backreferences.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CAPTURES-001 | When capturing groups match, group shall expose their text and span. | TEST-CAPTURES-001 |
| REQ-CAPTURES-002 | When groups nest, numbering shall follow opening parentheses. | TEST-CAPTURES-001 |
| REQ-CAPTURES-003 | When numeric backreferences run, they shall match the captured exact text. | TEST-CAPTURES-002 |
| REQ-CAPTURES-004 | If a numeric reference is forward, undefined or unmatched, compilation or matching shall fail appropriately. | TEST-CAPTURES-002 |
| REQ-CAPTURES-005 | When named captures and references run, names shall resolve to capture slots. | TEST-CAPTURES-003 |
| REQ-CAPTURES-006 | If capture names are duplicated or invalid, the compiler shall reject them. | TEST-CAPTURES-003 |
| REQ-CAPTURES-007 | When a branch fails, capture changes shall not leak to the next branch. | TEST-CAPTURES-004 |
| REQ-CAPTURES-008 | When a capture repeats, the last successful iteration shall be exposed. | TEST-CAPTURES-004 |
| REQ-CAPTURES-009 | When a group is unmatched, group shall return None and span shall return (-1,-1). | TEST-CAPTURES-005 |
| REQ-CAPTURES-010 | If a caller requests an unknown capture index/name, the match shall raise IndexError. | TEST-CAPTURES-005 |
## Design
VM states are (position, immutable capture tuple); branching copies only changed tuples.
Backreference transitions read completed captures; group zero is supplied by the match wrapper.
## Assumptions
Forward references and references to open groups rejected; captures inside positive lookaround are observable.
Spike: failed alternatives in Python re do not expose failed captures.
