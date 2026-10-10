---
feature: remoting
tier: T2
approval: auto
---
# Remoting simulation
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-REMOTING-001 | When latency elapses, network shall enqueue the remote message. | TEST-REMOTING-001 |
| REQ-REMOTING-002 | When sends share a deadline, network shall preserve send order. | TEST-REMOTING-001 |
| REQ-REMOTING-003 | When links are partitioned at delivery, messages shall enter dead letters. | TEST-REMOTING-001 |
| REQ-REMOTING-004 | When a link heals, subsequent sends shall deliver. | TEST-REMOTING-001 |
| REQ-REMOTING-005 | When destination actor is missing or full, delivery shall enter dead letters. | TEST-REMOTING-001 |
| REQ-REMOTING-006 | When send accepts mutable payloads, network shall own a deep snapshot. | TEST-REMOTING-001 |
| REQ-REMOTING-007 | If latency or advance is negative, network shall reject it without changing time. | TEST-REMOTING-001 |
| REQ-REMOTING-008 | When node IDs duplicate or source is unknown, network shall reject registration/send. | TEST-REMOTING-001 |
| REQ-REMOTING-009 | When valid deeply nested payloads target an available destination on a healthy link, delivery shall succeed without recursion failure. | TEST-REMOTING-002 |
## Design
Heap entries contain deadline, sequence, source, destination, actor, snapshot; virtual clock never sleeps.
Partitions are undirected links evaluated on delivery. Delivery is at-most-once with inspectable dead letters.
Payloads use the mailbox JSON-like builtin boundary; invalid payloads fail before enqueue.
## Assumptions / risks
In-memory simulation only, no sockets, credentials, retries, or wire compatibility. Spike confirms heap FIFO ties.
