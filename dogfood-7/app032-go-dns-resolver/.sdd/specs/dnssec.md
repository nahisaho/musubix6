---
feature: dnssec
tier: T2
approval: auto
---
# dnssec-lite
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DNSSEC-001 | When a trusted Ed25519 key signs canonical records, verification shall succeed. | TEST-DNSSEC-001 |
| REQ-DNSSEC-002 | When record order differs, the canonical signed bytes shall remain identical. | TEST-DNSSEC-001 |
| REQ-DNSSEC-003 | If RDATA is altered, verification shall reject the proof. | TEST-DNSSEC-002 |
| REQ-DNSSEC-004 | If the key identifier is unknown, verification shall reject the proof. | TEST-DNSSEC-002 |
| REQ-DNSSEC-005 | If now is outside the inclusive inception and exclusive expiry interval, verification shall fail. | TEST-DNSSEC-003 |
| REQ-DNSSEC-006 | When TTLs age after caching, verification shall use the proof's original TTL and reject received TTLs exceeding it. | TEST-DNSSEC-003, TEST-DNSSEC-005 |
| REQ-DNSSEC-007 | If a signed owner is outside its declared zone or the key is not bound to that zone, verification shall reject it. | TEST-DNSSEC-004 |
| REQ-DNSSEC-008 | If records are empty or the signature is malformed, verification shall fail without panic. | TEST-DNSSEC-004 |
## Design
An explicit key-to-zone trust map validates Ed25519 signatures over sorted length-delimited wire records plus proof metadata.
This is DNSSEC-lite, not RFC DNSSEC: no DS chain, NSEC, DNSKEY wire interoperability or authenticated denial.
## Assumptions
Trust anchors are provisioned by the caller. Transport proofs are supplied out of band.
Spike: Ed25519 key generation, signing, tampering and boundary validation use only Go's standard library.
