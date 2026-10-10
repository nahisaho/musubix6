---
feature: posting
tier: T2
approval: auto
---
# Posting
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-POSTING-001 | When balanced journals post, the system shall update balances. | TEST-POSTING-001 |
| REQ-POSTING-002 | If per-currency totals are nonzero, the system shall reject atomically. | TEST-POSTING-002 |
| REQ-POSTING-003 | When identical requests repeat, the system shall return the existing journal. | TEST-POSTING-003 |
| REQ-POSTING-004 | If keys have conflicting payloads, the system shall reject atomically. | TEST-POSTING-004 |
| REQ-POSTING-005 | If accounts are unknown or currency mismatched, the system shall reject. | TEST-POSTING-005 |
| REQ-POSTING-006 | If journals have fewer than two lines or lines are zero/non-minor-unit, the system shall reject. | TEST-POSTING-006 |
| REQ-POSTING-007 | When concurrent identical requests arrive, the system shall commit once. | TEST-POSTING-007 |
| REQ-POSTING-008 | When auditing journals, the system shall verify account and currency balance invariants. | TEST-POSTING-008 |
| REQ-POSTING-009 | When large values are posted, the system shall detect exact imbalance independently of Decimal context. | TEST-POSTING-009 |
| REQ-POSTING-010 | When string or int amounts are posted, the system shall normalize immutable journal lines to Decimal. | TEST-POSTING-010 |
## Design
Immutable signed debit-positive Line/Journal; atomic validation/commit under RLock.
Fingerprint includes date, description, ordered lines; snapshots prevent external mutation.
## Assumptions
In-memory durability only; runtime lock serialization spike passes.
