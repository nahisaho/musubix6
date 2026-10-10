---
feature: assertions
tier: T2
approval: auto
---
# Assertions
Goal: Zero-width lookaround with correct capture and anchor boundaries.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ASSERTIONS-001 | When positive lookahead succeeds, the outer cursor shall not advance. | TEST-ASSERTIONS-001 |
| REQ-ASSERTIONS-002 | When positive lookahead captures, the outer state shall receive successful captures. | TEST-ASSERTIONS-001 |
| REQ-ASSERTIONS-003 | When negative lookahead finds a match, the outer path shall fail. | TEST-ASSERTIONS-002 |
| REQ-ASSERTIONS-004 | When negative lookahead succeeds, its tentative captures shall not leak. | TEST-ASSERTIONS-002 |
| REQ-ASSERTIONS-005 | When fixed-width positive lookbehind succeeds, the outer cursor shall not advance. | TEST-ASSERTIONS-003 |
| REQ-ASSERTIONS-006 | When fixed-width negative lookbehind runs at a boundary, absence of enough prefix shall count as success. | TEST-ASSERTIONS-003 |
| REQ-ASSERTIONS-007 | If lookbehind has variable width or a backreference, compilation shall fail. | TEST-ASSERTIONS-004 |
| REQ-ASSERTIONS-008 | When equal-width alternatives occur in lookbehind, compilation shall accept them. | TEST-ASSERTIONS-004 |
| REQ-ASSERTIONS-009 | When anchors and word boundaries run, they shall inspect absolute input boundaries. | TEST-ASSERTIONS-005 |
| REQ-ASSERTIONS-010 | When nested lookaround runs, it shall share the outer evaluation budget. | TEST-ASSERTIONS-005 |
## Design
Lookahead is an atomic zero-width VM subquery; positive exports captures and negative discards them.
Lookbehind computes static width then requires the subquery to end exactly at the outer cursor.
## Assumptions
Dollar means strict end, not before a trailing newline; no multiline mode.
Spike: equal-width alternatives have statically known lookbehind width.
