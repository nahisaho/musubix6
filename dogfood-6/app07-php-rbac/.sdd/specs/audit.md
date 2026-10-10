---
feature: audit
tier: T2
approval: auto
---
# audit
Goal: Tamper-evident decision audit log wrapping the engine. Non-goals: external storage.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUD-001 | When a decision is made through the audited engine, the system shall append one entry with subject, action, resource, decision and matched ids. | TEST-AUD-001 |
| REQ-AUD-002 | When an entry is appended, the system shall chain it with sha256 of the previous hash and entry content. | TEST-AUD-002 |
| REQ-AUD-003 | When verify is called on an untampered log, the system shall return true. | TEST-AUD-003 |
| REQ-AUD-004 | If any entry was modified, then verify shall return false. | TEST-AUD-004 |
| REQ-AUD-005 | When the log is filtered by decision, the system shall return only entries with that decision. | TEST-AUD-005 |
| REQ-AUD-006 | If the engine throws while deciding, then the system shall log a deny entry with reason error and return that deny decision without propagating the exception (fail closed). | TEST-AUD-006 |
| REQ-AUD-007 | When an entry is exported, the system shall render it as one JSON line with sorted keys. | TEST-AUD-007 |

## Design
- `AuditLog` (append-only array, hash chain, verify, filter, export); `AuditedEngine` wraps `Engine`, injects a clock callable for determinism.
- Hash = sha256(prevHash . json(entry without hash)); genesis prev = 64 zeros.
- Errors in decision => deny + logged; never propagate allow.
## Assumptions / risks: serialization stability by sorted keys, TEST-AUD-007.
