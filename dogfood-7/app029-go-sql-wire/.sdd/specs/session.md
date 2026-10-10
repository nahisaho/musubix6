---
feature: session
tier: T2
approval: auto
---
# Connection service
Goal: real simple/extended protocol on net.Conn. Non-goals: full PostgreSQL compatibility.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SESSION-001 | When an authorized connection starts, it shall receive AuthenticationOk and ReadyForQuery I. | TEST-SESSION-001 |
| REQ-SESSION-002 | When SSL is requested, the connection shall decline then accept plaintext startup. | TEST-SESSION-001 |
| REQ-SESSION-003 | When a simple SELECT succeeds, it shall emit RowDescription, DataRow, CommandComplete and ReadyForQuery. | TEST-SESSION-002 |
| REQ-SESSION-004 | When BEGIN and ROLLBACK execute, ReadyForQuery shall advertise T and I. | TEST-SESSION-002 |
| REQ-SESSION-005 | When Parse/Bind/Execute/Sync execute, the server shall emit completion frames in order. | TEST-SESSION-003 |
| REQ-SESSION-006 | When a limited portal suspends, the server shall emit PortalSuspended. | TEST-SESSION-003 |
| REQ-SESSION-007 | If extended handling fails, messages other than Terminate shall be ignored until Sync. | TEST-SESSION-004 |
| REQ-SESSION-008 | When a query fails inside a transaction, Sync shall advertise E until rollback. | TEST-SESSION-004 |
| REQ-SESSION-009 | When Terminate arrives, the connection shall close without a response. | TEST-SESSION-005 |
| REQ-SESSION-010 | When multiple connections run, their prepared resources shall be isolated. | TEST-SESSION-005 |
| REQ-SESSION-011 (deferred) | When cancel requests arrive, running work shall be cancellable by backend key. | — |
| REQ-SESSION-012 | If a Parse parameter-type count is invalid, the server shall reject it without registering or replacing a statement. | TEST-SESSION-006 |
| REQ-SESSION-013 | If transaction state is E, Parse and Bind shall reject SELECT work with 25P02 before mutating resources. | TEST-SESSION-007 |
| REQ-SESSION-014 | If an encoded DataRow inclusive length would exceed 1 MiB, execution shall emit a 54000 error before allocating or sending that row. | TEST-SESSION-008 |
| REQ-SESSION-015 | If Parse supplies a nonzero parameter OID other than text 25, the server shall reject it with 0A000. | TEST-SESSION-009 |
## Design
Serve owns a connection, auth identity, tx machine and query engine. Decoder rejects malformed bodies.
Extended error latch set until Sync; Terminate always closes. Sync releases latch but not transaction E.
Trust is explicitly local and allowlisted. Serve closes connection on termination/framing failure.
## Assumptions
Spike: net.Pipe drives genuine duplex handshake with read deadlines; -race covers parallel connections.
Initial implementation supports text formats only; binary formats rejected, never silently interpreted.
Only unspecified/text parameter OIDs accepted; Describe reports text. Outgoing rows bounded before encoding.
