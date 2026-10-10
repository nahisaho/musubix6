---
feature: wire
tier: T2
approval: auto
---
# Bounded PostgreSQL framing
Goal: transport protocol-v3 frames safely. Non-goals: COPY, replication, SSL termination.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WIRE-001 | When a tagged frame is read, the codec shall return its tag and exact payload. | TEST-WIRE-001 |
| REQ-WIRE-002 | When transport splits reads, the codec shall reconstruct the frame. | TEST-WIRE-001 |
| REQ-WIRE-003 | If a length is below four, the codec shall reject it. | TEST-WIRE-002 |
| REQ-WIRE-004 | If a length exceeds the configured limit, the codec shall reject before allocating. | TEST-WIRE-002 |
| REQ-WIRE-005 | When writing a frame, the codec shall encode a big-endian inclusive length. | TEST-WIRE-003 |
| REQ-WIRE-006 | When writes are short, the codec shall complete them or return an error. | TEST-WIRE-003 |
| REQ-WIRE-007 | When reading a startup packet, the codec shall return the protocol and body. | TEST-WIRE-004 |
| REQ-WIRE-008 | If startup data is truncated, the codec shall propagate EOF. | TEST-WIRE-004 |
| REQ-WIRE-009 | When a payload cursor reads typed values, it shall advance in big-endian order. | TEST-WIRE-005 |
| REQ-WIRE-010 | If a string terminator or value is missing, the cursor shall return an error. | TEST-WIRE-005 |
## Design
io.Reader/io.Writer boundaries, maximum 1 MiB default, no packet allocation before length validation.
Cursor requires explicit Done checks at handler boundaries; empty successful writes become io.ErrShortWrite.
## Assumptions
Spike: Go io.ReadFull reconstructs one-byte reads; net.Pipe supports duplex framing and deadlines.
Tests cover network fragmentation, truncation and exact bytes. No external packages or database required.
