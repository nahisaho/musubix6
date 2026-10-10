---
feature: journal
tier: T2
approval: auto
---
# journal
Goal: double-entry posting with invariants, reversal and trial balance, writing to the audit trail.   Non-goals: periods (see period).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-JRNL-001 | When a Line is created, the system shall require a non-blank account code, a side and a strictly positive Money amount, and shall throw IllegalArgumentException otherwise. | TEST-JRNL-001 |
| REQ-JRNL-002 | If a journal entry has fewer than two lines, then post shall throw InvalidEntryException. | TEST-JRNL-002 |
| REQ-JRNL-003 | If per currency the sum of debits differs from the sum of credits, then post shall throw UnbalancedEntryException and change nothing. | TEST-JRNL-003 |
| REQ-JRNL-004 | If a line currency differs from its account currency, then post shall throw CurrencyMismatchException. | TEST-JRNL-004 |
| REQ-JRNL-005 | If a line references an unknown or inactive account, then post shall throw an exception (AccountNotFoundException for unknown, InvalidEntryException for inactive). | TEST-JRNL-005 |
| REQ-JRNL-006 | When a valid entry is posted, the system shall assign ids 1,2,3.. in order, store it, and append an audit entry with action POST and the id. | TEST-JRNL-006 |
| REQ-JRNL-007 | When balance(code) is called, the system shall return debits minus credits for debit-normal accounts and credits minus debits for credit-normal accounts. | TEST-JRNL-007 |
| REQ-JRNL-008 | When reverse(id) is called, the system shall post an entry with swapped sides referencing the original, and append an audit action REVERSE. | TEST-JRNL-008 |
| REQ-JRNL-009 | If an entry is already reversed, or is itself a reversal, then reverse shall throw InvalidEntryException. | TEST-JRNL-009 |
| REQ-JRNL-010 | The system shall provide a trial balance whose total debits equal total credits per currency after any sequence of valid postings. | TEST-JRNL-010 |
| REQ-JRNL-011 | The system shall expose posted entries as unmodifiable and independent of the caller's line list. | TEST-JRNL-011 |
| REQ-JRNL-012 | When reverse(id, date) is called, the system shall post the reversal dated `date` instead of the original date (bug fix: reversals were always dated into the original, possibly closed, period). | TEST-JRNL-012 |

## Design
Ledger(Chart, AuditLog) owns List<JournalEntry>. post validates in order: >=2 lines, accounts exist+active, currency match, balance per currency; only then mutates (all-or-nothing) and audits.
Invariant: sum over all posted lines of D == sum of C per currency; reversal preserves it. Cross-feature: depends on money (Money), accounts (Chart/Account), audit (AuditLog).
Entries carry a LocalDate used by period.
## Assumptions / risks
- Reversal of a reversal is forbidden to keep the chain acyclic (TEST-JRNL-009).
- Defensive copy of lines prevents post-hoc mutation (TEST-JRNL-011).
