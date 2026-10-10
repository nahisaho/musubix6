---
feature: fx
tier: T2
approval: auto
---
# FX
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FX-001 | When exchanging currencies, the system shall balance each via bridge accounts. | TEST-FX-001 |
| REQ-FX-002 | When computing targets, the system shall round to target precision. | TEST-FX-002 |
| REQ-FX-003 | If rate is float, nonfinite or nonpositive, the system shall reject atomically. | TEST-FX-003 |
| REQ-FX-004 | If currencies are equal, the system shall reject. | TEST-FX-004 |
| REQ-FX-005 | If source is nonpositive or beyond precision, the system shall reject. | TEST-FX-005 |
| REQ-FX-006 | When FX requests repeat, the system shall return the same journal. | TEST-FX-006 |
| REQ-FX-007 | If target rounds to zero, the system shall reject atomically. | TEST-FX-007 |
| REQ-FX-008 | If bridges are missing or mismatched, the system shall reject atomically. | TEST-FX-008 |
| REQ-FX-009 | When rates exceed ambient precision, the system shall round the exact product once. | TEST-FX-009 |
## Design
FXService builds four signed lines and delegates atomicity to Ledger.
Decimal rates embedded canonically into description prevent key reuse with changed rates.
## Assumptions
Explicit bridge accounts, no live feeds; spike confirms JPY/KWD rounding.
