---
feature: accounts
tier: T2
approval: auto
---
# accounts
Goal: chart of accounts with typed accounts and normal-balance side.   Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ACCT-001 | When an Account is created, the system shall require a non-blank code, a name, an AccountType and a Currency, and shall throw IllegalArgumentException otherwise. | TEST-ACCT-001 |
| REQ-ACCT-002 | The system shall report the normal side of an AccountType as DEBIT for ASSET and EXPENSE and CREDIT for LIABILITY, EQUITY and REVENUE. | TEST-ACCT-002 |
| REQ-ACCT-003 | When an account with an already registered code is added to the Chart, the system shall throw DuplicateAccountException. | TEST-ACCT-003 |
| REQ-ACCT-004 | When find(code) is called for an unregistered code, the system shall throw AccountNotFoundException. | TEST-ACCT-004 |
| REQ-ACCT-005 | When an account is deactivated, the system shall report it as inactive, and find(code) shall still return it. | TEST-ACCT-005 |
| REQ-ACCT-006 | When an account is added with a parent code, the system shall require the parent to exist and to have the same AccountType. | TEST-ACCT-006 |

## Design
Account is an immutable record with an `active` flag; Chart is an insertion-ordered map code -> Account. Deactivation replaces the entry with a copy (accounts are never deleted: audit requirement).
Policy table: type -> normal side {ASSET:D, EXPENSE:D, LIABILITY:C, EQUITY:C, REVENUE:C}; single source in AccountType.
## Assumptions / risks
- Hierarchy depth is unbounded; cycles impossible because parent must pre-exist (TEST-ACCT-006).
