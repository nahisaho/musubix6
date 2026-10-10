---
feature: trace
tier: T2
approval: auto
---
# Trace propagation
Goal: immutable W3C trace identity over context and HTTP boundaries. Non-goals: tracestate vendors.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TRACE-001 | When a valid v00 traceparent arrives, the system shall parse its trace, span and flags. | TEST-TRACE-001 |
| REQ-TRACE-002 | If length, separators, hex, version or all-zero IDs are invalid, then parsing shall fail. | TEST-TRACE-001 |
| REQ-TRACE-003 | When a parsed identity is formatted, the system shall preserve its canonical header. | TEST-TRACE-001 |
| REQ-TRACE-004 | When identity is attached, the system shall preserve cancellation and parent values. | TEST-TRACE-001 |
| REQ-TRACE-005 | When no identity exists, the system shall return absent without fabricating IDs. | TEST-TRACE-001 |
| REQ-TRACE-006 | When headers are injected, the system shall set one canonical traceparent. | TEST-TRACE-001 |
| REQ-TRACE-007 | If extraction fails, then the system shall leave its parent context unchanged. | TEST-TRACE-001 |
| REQ-TRACE-008 | When a child is created, the system shall keep trace and flags and replace only its span ID. | TEST-TRACE-001 |
| REQ-TRACE-009 (test-only) | When the contract build tag is enabled, the public identity shall retain fixed 16-byte trace and 8-byte span fields. | TEST-TRACE-002 |
## Design
Fixed-size byte arrays are value types; private context key prevents collisions.
Strict v00 lowercase grammar; NewChild validates nonzero span bytes.
## Assumptions
No credentials or destructive operations; trace IDs are synthetic test identifiers.
Runtime spike verifies cancellation survives context.WithValue and parallel tests under -race.
