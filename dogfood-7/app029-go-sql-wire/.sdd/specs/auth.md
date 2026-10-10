---
feature: auth
tier: T2
approval: auto
---
# Local trust handshake
Goal: explicitly allowlisted demo users, not password authentication. Non-goals: credentials and TLS.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUTH-001 | When a protocol-v3 startup is valid, authentication shall parse user and database. | TEST-AUTH-001 |
| REQ-AUTH-002 | If database is absent, it shall default to the user. | TEST-AUTH-001 |
| REQ-AUTH-003 | If user is not allowlisted, startup shall fail with 28000. | TEST-AUTH-002 |
| REQ-AUTH-004 | If user is absent, startup shall fail with 28000. | TEST-AUTH-002 |
| REQ-AUTH-005 | If startup keys duplicate, authentication shall reject ambiguity. | TEST-AUTH-003 |
| REQ-AUTH-006 | If startup strings are unterminated, authentication shall reject the payload. | TEST-AUTH-003 |
| REQ-AUTH-007 | When an SSL request arrives, the server shall reply N without authenticating. | TEST-AUTH-004 |
| REQ-AUTH-008 | If protocol version is unsupported, authentication shall fail with 0A000. | TEST-AUTH-004 |
| REQ-AUTH-009 | When role policy is constructed, it shall copy the allowlist. | TEST-AUTH-005 |
| REQ-AUTH-010 | If startup contains data after its final terminator, authentication shall reject it. | TEST-AUTH-005 |
## Design
Authenticate delegates role decisions to Policy.Allows in policy.go; role allowlist copied.
Policy must be supplied by caller; empty list denies all. SSL request separate from protocol-v3 parsing.
## Assumptions
Spike: startup packet has uint32 version plus NUL-terminated key/value pairs and final NUL.
Demo command binds loopback only. No secrets handled; policy tightening needs no human approval.
