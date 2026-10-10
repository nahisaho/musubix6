---
feature: transport
tier: T2
approval: auto
---
# transport
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TRANSPORT-001 | When exchanging a question, transport shall send a valid DNS datagram and decode its response. | TEST-TRANSPORT-001 |
| REQ-TRANSPORT-002 | When sending to a loopback peer, transport shall preserve the query ID and question. | TEST-TRANSPORT-001 |
| REQ-TRANSPORT-003 | If a response ID differs, transport shall return an error. | TEST-TRANSPORT-002 |
| REQ-TRANSPORT-004 | If a response lacks QR or has a different question, transport shall return an error. | TEST-TRANSPORT-002 |
| REQ-TRANSPORT-005 | If the context is cancelled or times out, transport shall stop waiting. | TEST-TRANSPORT-003 |
| REQ-TRANSPORT-006 | If the peer sends malformed bytes, transport shall return an error. | TEST-TRANSPORT-003 |
| REQ-TRANSPORT-007 | If the response has TC, transport shall report truncation rather than accept partial answers. | TEST-TRANSPORT-004 |
| REQ-TRANSPORT-008 | When using concurrent exchanges, transport shall isolate query IDs and sockets. | TEST-TRANSPORT-004 |
## Design
Each exchange owns a connected UDP socket. Context cancellation closes the socket; a bounded deadline applies.
The transaction authenticates peer, ID, QR and the echoed question before returning data.
## Assumptions
UDP only: truncation is an explicit error, not silent data loss; TCP fallback is out of scope.
Spike: a loopback UDP echo server proves sockets, cancellation and datagram codec integration.
