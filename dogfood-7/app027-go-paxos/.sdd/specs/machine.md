---
feature: machine
tier: T2
approval: auto
---
# Replicated register state machine
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MACHINE-001 | When applying a put, the machine shall update the key and return its new value. | TEST-MACHINE-001 |
| REQ-MACHINE-002 | When applying a get of an absent key, the machine shall return the empty value. | TEST-MACHINE-001 |
| REQ-MACHINE-003 | When CAS expects the current value, the machine shall replace it atomically. | TEST-MACHINE-001 |
| REQ-MACHINE-004 | If CAS has the wrong expected value, it shall retain the current value and return false. | TEST-MACHINE-001 |
| REQ-MACHINE-005 | When the latest client sequence retries, the machine shall return the original result without reapplying. | TEST-MACHINE-001 |
| REQ-MACHINE-006 | When a sequence is lower than that client's last sequence, the machine shall reject it. | TEST-MACHINE-001 |
| REQ-MACHINE-007 | When a command is submitted, the service shall encode it and apply only chosen entries in slot order. | TEST-MACHINE-001 |
| REQ-MACHINE-008 | If the cluster loses quorum, the service shall leave its register unchanged. | TEST-MACHINE-001 |
## Design
JSON command log is applied to a deterministic map; per-client last sequence and result suppress duplicates.
Service submits reads through consensus too, preserving linearizable read order; reserved config entries are ignored.
## Assumptions
Service is single-threaded; clients have monotonically increasing positive sequences.
JSON roundtrip spike validates strings and omitted empty fields; all unknown kinds are errors.
Client sequence identifies a logical operation and retries retain the same payload.
