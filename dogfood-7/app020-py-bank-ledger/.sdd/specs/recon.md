---
feature: recon
tier: T2
approval: auto
---
# Reconciliation
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RECON-001 | When reference/date/amount agree, the system shall match one-to-one. | TEST-RECON-001 |
| REQ-RECON-002 | When bank entries lack matches, the system shall report unmatched. | TEST-RECON-002 |
| REQ-RECON-003 | When ledger entries lack matches, the system shall report outstanding. | TEST-RECON-003 |
| REQ-RECON-004 | When reconciling periods, the system shall exclude entries outside range. | TEST-RECON-004 |
| REQ-RECON-005 | If bank currency mismatches account, the system shall reject. | TEST-RECON-005 |
| REQ-RECON-006 | If bank IDs repeat, the system shall reject ambiguous input. | TEST-RECON-006 |
| REQ-RECON-007 | When reconciling, the system shall preserve ledger state. | TEST-RECON-007 |
| REQ-RECON-008 | When finished, the system shall report bank-minus-ledger signed difference. | TEST-RECON-008 |
| REQ-RECON-009 | When string/int bank amounts arrive, the system shall normalize them before matching and exact difference calculation. | TEST-RECON-009 |
## Design
Read locked snapshot; exact tuple matches with one-to-one consumption; frozen results.
Bank amounts use money validation; no write-back; inclusive date range.
## Assumptions
Bank sign uses debit-positive convention; caller normalizes external feed.
