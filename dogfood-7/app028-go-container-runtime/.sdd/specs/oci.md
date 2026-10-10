---
feature: oci
tier: T2
approval: auto
---
# OCI parsing
Goal: validate a simplified OCI document. Non-goals: kernel execution, complete OCI schema.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OCI-001 | When valid JSON is supplied, the parser shall preserve root, args and limits. | TEST-OCI-001 |
| REQ-OCI-002 | If JSON is malformed or followed by another value, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-003 | If the version is not 1.0.2, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-004 | If root is relative, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-005 | If args is empty or its first argument is blank, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-006 | If an environment entry lacks a key or equals sign or duplicates a key, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-007 | If any limit is negative, the parser shall reject it. | TEST-OCI-001 |
| REQ-OCI-008 | If unknown JSON fields occur, the parser shall reject them. | TEST-OCI-001 |
## Design
Use encoding/json with DisallowUnknownFields, then require EOF.
Limits are signed int64; zero is unlimited. Validation also protects checkpoint restores.
## Assumptions / risks
Simulator only; no host filesystem or process operations. Standard-library decoding spike covers trailing input.
