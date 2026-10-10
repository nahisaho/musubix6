---
feature: wire
tier: T2
approval: auto
---
# wire
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WIRE-001 | When encoding a question, the codec shall preserve ID, flags, name, class and type. | TEST-WIRE-001 |
| REQ-WIRE-002 | When decoding answers, the codec shall preserve TTL and opaque RDATA. | TEST-WIRE-001 |
| REQ-WIRE-003 | When names share suffixes, the encoder shall emit compression pointers. | TEST-WIRE-002 |
| REQ-WIRE-004 | When decoding NS and CNAME RDATA, the codec shall expand compressed names. | TEST-WIRE-002 |
| REQ-WIRE-005 | If pointers cycle or point outside the packet, decoding shall return an error. | TEST-WIRE-003 |
| REQ-WIRE-006 | If a packet is truncated, decoding shall return an error without panic. | TEST-WIRE-003 |
| REQ-WIRE-007 | If a label exceeds 63 bytes or a name exceeds 255 wire bytes, encoding shall fail. | TEST-WIRE-004 |
| REQ-WIRE-008 | When a mixed-case domain is supplied, the codec shall normalise it to lower-case FQDN. | TEST-WIRE-004 |
## Design
The codec owns bounded cursor operations, DNS headers and resource records. Compression is packet-relative.
Opaque A/AAAA/TXT data are copied; name-bearing NS/CNAME and SOA are parsed structurally.
## Assumptions
Names use ASCII DNS labels. SOA is exposed as typed data; unknown RR types remain opaque.
Spike: standard-library binary operations and pointer round trips run locally without external services.
