---
feature: money
tier: T2
approval: auto
---
# Money
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MONEY-001 | When USD is rounded, the system shall retain two decimals. | TEST-MONEY-001 |
| REQ-MONEY-002 | When JPY is rounded, the system shall retain zero decimals. | TEST-MONEY-002 |
| REQ-MONEY-003 | When KWD is rounded, the system shall retain three decimals. | TEST-MONEY-003 |
| REQ-MONEY-004 | When rounding ties, the system shall use half-even. | TEST-MONEY-004 |
| REQ-MONEY-005 | If currency is unknown, the system shall reject it. | TEST-MONEY-005 |
| REQ-MONEY-006 | If amount is float or nonfinite, the system shall reject it. | TEST-MONEY-006 |
| REQ-MONEY-007 | When allocating positive amounts, the system shall preserve total with deterministic remainders. | TEST-MONEY-007 |
| REQ-MONEY-008 | If weights are invalid, the system shall reject them. | TEST-MONEY-008 |
| REQ-MONEY-009 | When allocating large amounts under any Decimal context, the system shall retain all minor units. | TEST-MONEY-009 |
| REQ-MONEY-010 (test-only) | When inspecting supported currencies, the system shall expose the documented exponent table. | TEST-MONEY-010 |
## Design
Decimal string/int ingress; currency exponent table is the precision source.
Allocation uses integer minor units and largest remainder, ties prefer earliest bucket.
## Assumptions
Runtime spike confirms signed half-even and finite checks; no float ingress.
