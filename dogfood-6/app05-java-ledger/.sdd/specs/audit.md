---
feature: audit
tier: T2
approval: auto
---
# audit
Goal: tamper-evident append-only audit trail (hash chain).   Non-goals: external storage, signatures.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUDIT-001 | When append(actor, action, detail) is called, the system shall add an entry whose sequence starts at 1 and increments by 1 and whose timestamp comes from the injected clock. | TEST-AUDIT-001 |
| REQ-AUDIT-002 | The system shall compute each entry hash as SHA-256 hex of prevHash|seq|timestamp|actor|action|detail, with prevHash of the first entry being 64 zeros. | TEST-AUDIT-002 |
| REQ-AUDIT-003 | When verify() is called on an untampered log, the system shall return an empty Optional. | TEST-AUDIT-003 |
| REQ-AUDIT-004 | When verify() is called on a restored log whose entry was altered, the system shall return the sequence number of the first bad entry. | TEST-AUDIT-004 |
| REQ-AUDIT-005 | The system shall expose entries as an unmodifiable list. | TEST-AUDIT-005 |
| REQ-AUDIT-006 | If actor or action is blank, then append shall throw IllegalArgumentException and leave the log unchanged. | TEST-AUDIT-006 |

## Design
AuditLog holds an ArrayList<AuditEntry>; AuditEntry is a record (seq, timestamp, actor, action, detail, prevHash, hash). Clock injected (java.time.Clock) for determinism.
restore(List<AuditEntry>) builds a log without recomputation so verify() can detect altered/forged data; verify recomputes the chain from genesis.
## Assumptions / risks
- Fields are joined with '|' after escaping `\` and `|`, so detail containing '|' cannot forge a boundary (covered by TEST-AUDIT-002).
