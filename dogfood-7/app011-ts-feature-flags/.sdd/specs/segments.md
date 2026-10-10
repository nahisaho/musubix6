---
feature: segments
tier: T2
approval: auto
---
# Segments
Goal: Validate immutable targeting graphs and resolve membership.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SEG-001 | When a user is explicitly included, the system shall return membership true. | TEST-SEG-001 |
| REQ-SEG-002 | If a user is explicitly excluded, the system shall override every inclusion source. | TEST-SEG-002 |
| REQ-SEG-003 | When any segment rule matches, the system shall include the user. | TEST-SEG-003 |
| REQ-SEG-004 | When a referenced segment matches, the system shall inherit its membership. | TEST-SEG-004 |
| REQ-SEG-005 | If segment references form a cycle, the system shall reject the graph. | TEST-SEG-005 |
| REQ-SEG-006 | If a reference is unknown or IDs duplicate, the system shall reject the graph. | TEST-SEG-006 |
| REQ-SEG-007 | When caller-owned definitions change, the system shall preserve its original graph. | TEST-SEG-007 |
| REQ-SEG-008 | If a requested segment does not exist, the system shall return false. | TEST-SEG-008 |
| REQ-SEG-009 | When IDs are prototype-like strings, the system shall treat them as ordinary IDs. | TEST-SEG-009 |
## Design
Clone input, compile rules, validate all references with DFS before publication.
Membership: exclude first, then explicit include OR rules OR referenced membership.
## Assumptions / risks
Definition graph is at most 256 nodes; recursion depth bounded by node count.
Map avoids prototype-key hazards; spike exercises clone isolation.
