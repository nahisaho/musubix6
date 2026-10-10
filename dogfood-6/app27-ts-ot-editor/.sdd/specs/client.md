---
feature: client
tier: T2
approval: auto
---
# client
Goal: Jupiter-style OT client with a three-state sync machine.  Non-goals: transport, reconnect (see offline).  Depends: ops, server.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CLIENT-001 | While synchronized, when local(op) is called, the system shall apply it, send {clientId, seq, baseRev: rev, op} and enter state awaiting. | TEST-CLIENT-001 |
| REQ-CLIENT-002 | While awaiting, when local(op) is called, the system shall apply it, send nothing and enter state buffering. | TEST-CLIENT-002 |
| REQ-CLIENT-003 | While buffering, when local(op) is called, the system shall compose it into the buffer without sending. | TEST-CLIENT-003 |
| REQ-CLIENT-004 | While awaiting, when ack() is called, the system shall increment rev and return to synchronized. | TEST-CLIENT-004 |
| REQ-CLIENT-005 | While buffering, when ack() is called, the system shall increment rev, send the buffer with baseRev = rev and enter awaiting. | TEST-CLIENT-005 |
| REQ-CLIENT-006 | While synchronized, when serverOp(op) is called, the system shall apply it and increment rev. | TEST-CLIENT-006 |
| REQ-CLIENT-007 | While awaiting, when serverOp(op) is called, the system shall transform the outstanding op against it (server op wins ties) and apply the transformed server op. | TEST-CLIENT-007 |
| REQ-CLIENT-008 | While buffering, when serverOp(op) is called, the system shall transform outstanding and buffer in turn and apply the doubly transformed server op. | TEST-CLIENT-008 |
| REQ-CLIENT-009 | If ack() is called while synchronized, then the system shall throw ProtocolError. | TEST-CLIENT-009 |
| REQ-CLIENT-010 | The seq of successive sent messages shall increase by one starting at 1. | TEST-CLIENT-010 |
| REQ-CLIENT-011 | If a local or server op has the wrong baseLength, then the system shall throw OpError and leave doc, rev and state unchanged. | TEST-CLIENT-011 |
| REQ-CLIENT-012 | When all messages are delivered to a Server and all acks and broadcasts are delivered back, every client document shall equal the server document. | TEST-CLIENT-012 |

## Design
State machine (single source):
| State | local | ack | serverOp |
| --- | --- | --- | --- |
| sync | send -> await | ProtocolError | apply |
| await(o) | -> buffer(o,b=op) | -> sync | [s2,o2]=transform(s,o); apply s2 |
| buffer(o,b) | b=compose(b,op) | send b -> await(b) | [s2,o2]=transform(s,o); [s3,b2]=transform(s2,b); apply s3 |
Invariant: doc == apply(serverDoc@rev, o, b) ; baseLength of every pending op == length of the doc it is applied to. Validation happens before any mutation.
## Assumptions / risks
Convergence under random interleavings is retired by the seeded simulation TEST-CLIENT-012.
