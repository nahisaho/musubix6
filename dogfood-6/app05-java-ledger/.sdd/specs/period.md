---
feature: period
tier: T2
approval: auto
---
# period
Goal: accounting period control over the journal: close, closing entry, reopen.   Non-goals: multi-entity consolidation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PERIOD-001 | The system shall treat every period (YearMonth) as open until closed. | TEST-PERIOD-001 |
| REQ-PERIOD-002 | If an entry is dated within a closed period, then PeriodLedger.post shall throw PeriodClosedException and change nothing. | TEST-PERIOD-002 |
| REQ-PERIOD-003 | If close(period) is called while an earlier period that has postings is still open, then the system shall throw PeriodException. | TEST-PERIOD-003 |
| REQ-PERIOD-004 | When a period is closed, the system shall return a snapshot of account balances for entries dated up to and including that period. | TEST-PERIOD-004 |
| REQ-PERIOD-005 | When a period is closed, the system shall post a closing entry that zeroes all REVENUE and EXPENSE balances of that period into the retained earnings account. | TEST-PERIOD-005 |
| REQ-PERIOD-006 | When reopen(period, reason) is called with a non-blank reason on the latest closed period, the system shall reopen it and append an audit action REOPEN with the reason; otherwise it shall throw PeriodException. | TEST-PERIOD-006 |
| REQ-PERIOD-007 | When a period is closed, the system shall append an audit action CLOSE with the period. | TEST-PERIOD-007 |
| REQ-PERIOD-008 | When PeriodLedger.reverse(id, date) is called with a date within a closed period, the system shall throw PeriodClosedException and change nothing; otherwise it shall post the reversal dated `date`. | TEST-PERIOD-008 |
| REQ-PERIOD-009 | Bug fix: If close(period) is called while a later period is already closed, then the system shall throw PeriodException (a period may not be closed out of order). | TEST-PERIOD-009 |

## Design
PeriodLedger wraps Ledger (journal) + AuditLog (audit) + Chart; holds a TreeSet<YearMonth> closed. post(entry) checks entry.date's YearMonth against closed set then delegates to Ledger.
close(p): sequential check, compute P&L per currency for entries dated in p only, post closing entry dated at p.atEndOfMonth() directly via ledger (bypassing the closed check since it is part of closing), then add p to closed, audit CLOSE.
State table: Open --close--> Closed; Closed --reopen(reason)--> Open (only latest closed); Closed --close--> PeriodException; Open --reopen--> PeriodException.
Cross-feature: depends on journal, accounts, money, audit.
## Assumptions / risks
- Reopen leaves the closing entry in place; the reopening user must reverse it (documented; retired by TEST-PERIOD-006 asserting only state+audit).
