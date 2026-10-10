---
feature: work
tier: T2
approval: auto
---
# Unit of work
Goal: Atomic SQLite persistence and a per-session identity map.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WORK-001 | When get repeats a key, the system shall return the same object without another SELECT. | TEST-WORK-001 |
| REQ-WORK-002 | When a new object is committed, the system shall assign its generated primary key. | TEST-WORK-002 |
| REQ-WORK-003 | When a tracked object is changed, the system shall persist its changes at commit. | TEST-WORK-003 |
| REQ-WORK-004 | When an object is deleted, the system shall evict it from the identity map. | TEST-WORK-004 |
| REQ-WORK-005 | When commit fails, the system shall roll back every write and restore generated keys. | TEST-WORK-005 |
| REQ-WORK-006 | When separate sessions read a row, the system shall keep identities isolated. | TEST-WORK-006 |
| REQ-WORK-007 | When a transaction body raises, the system shall restore tracked values. | TEST-WORK-007 |
| REQ-WORK-008 | When a transaction is nested, the system shall reject it without committing the outer unit. | TEST-WORK-008 |
| REQ-WORK-009 | When explicit commit is called inside a transaction context, the system shall raise RuntimeError without writing. | TEST-WORK-009 |
| REQ-WORK-010 | When add is repeated for a pending or persistent object, the system shall register it only once. | TEST-WORK-010 |
| REQ-WORK-011 | When a connection uses autocommit mode, the system shall still commit and roll back explicit transactions atomically. | TEST-WORK-011 |
## Design
State: transient → pending → persistent → deleted; rollback restores database and snapshots.
Session owns identity and snapshot dictionaries; its connection must not contain external transactions.
## Assumptions / risks
No concurrent shared Session usage or optimistic locking; each Session owns its Python objects.
Only disposable in-memory databases are used by tests and spikes.
