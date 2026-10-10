---
feature: period
tier: T2
approval: auto
---
# Period
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PERIOD-001 | When closing a month, the system shall snapshot balances through its end. | TEST-PERIOD-001 |
| REQ-PERIOD-002 | While closed, the system shall reject new postings into the month. | TEST-PERIOD-002 |
| REQ-PERIOD-003 | When existing postings retry after close, the system shall return them. | TEST-PERIOD-003 |
| REQ-PERIOD-004 | If actor is unauthorized, the system shall reject close and reopen. | TEST-PERIOD-004 |
| REQ-PERIOD-005 | When reopened, the system shall permit backdated posts and retain history; if later months remain closed, it shall reject reopening. | TEST-PERIOD-005 |
| REQ-PERIOD-006 | When close repeats, the system shall return the existing snapshot. | TEST-PERIOD-006 |
| REQ-PERIOD-007 | If invariants fail, the system shall refuse close. | TEST-PERIOD-007 |
| REQ-PERIOD-008 | When closing February, the system shall handle leap years. | TEST-PERIOD-008 |
| REQ-PERIOD-009 | If a posting affects any later closed cumulative snapshot, the system shall reject it until affected periods reopen. | TEST-PERIOD-009 |
## Design
PeriodService shares ledger lock; OPEN/CLOSED transition table; versioned immutable snapshots.
Controller allowlist; audit before close; calendar month-end excludes future journals.
## Assumptions
Reopen is reversible and retains audit history; no deletion or credentials.
