---
feature: mailbox
tier: T2
approval: auto
---
# Mailboxes
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MAILBOX-001 | When messages arrive, the mailbox shall receive them in first-in-first-out order. | TEST-MAILBOX-001 |
| REQ-MAILBOX-002 | When capacity is reached, send shall fail without dropping queued messages. | TEST-MAILBOX-001 |
| REQ-MAILBOX-003 | When empty, receive shall return None. | TEST-MAILBOX-001 |
| REQ-MAILBOX-004 | When closed, send shall fail. | TEST-MAILBOX-001 |
| REQ-MAILBOX-005 | When closed, queued messages shall remain drainable. | TEST-MAILBOX-001 |
| REQ-MAILBOX-006 | If capacity is nonpositive, construction shall reject it. | TEST-MAILBOX-001 |
| REQ-MAILBOX-007 | When observed, size shall equal queued count. | TEST-MAILBOX-001 |
| REQ-MAILBOX-008 | When sending mutable payloads, the mailbox shall isolate them by deep copy. | TEST-MAILBOX-001 |
| REQ-MAILBOX-009 | When valid payloads exceed recursion depth, snapshots shall still accept and isolate them. | TEST-REMOTING-002 |
## Design
Bounded deque owns payload snapshots; send returns an acceptance boolean.
Closed is terminal, but receive can drain; None is reserved for empty and cannot be sent.
Payloads are acyclic JSON-like builtins (dict string keys, list, str, bool, int, float, nested None); unsupported objects raise TypeError before enqueue. Traversal is iterative.
## Assumptions / risks
Single-threaded simulation, not a thread-safe API. Spike validates deque and deepcopy semantics.
