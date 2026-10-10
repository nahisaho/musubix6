---
feature: money
tier: T1
---
# money
Goal: currency-safe decimal money with explicit rounding and lossless allocation. Non-goals: FX conversion.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MONEY-001 | When two Money values of the same currency are added, the system shall return their summed amount in that currency. | TEST-MONEY-001 |
| REQ-MONEY-002 | If two Money values of different currencies are added or subtracted, then the system shall throw CurrencyMismatchException. | TEST-MONEY-002 |
| REQ-MONEY-003 | When Round is called with HalfUp, the system shall round midpoints away from zero. | TEST-MONEY-003 |
| REQ-MONEY-004 | When Round is called with HalfEven, the system shall round midpoints to the nearest even last digit (banker's rounding). | TEST-MONEY-004 |
| REQ-MONEY-005 | When Allocate is called with non-negative weights, the system shall return parts that sum exactly to the original and distribute leftover minor units to the earliest parts. | TEST-MONEY-005 |
| REQ-MONEY-006 | If Allocate receives no weights, a negative weight or all-zero weights, then the system shall throw ArgumentException. | TEST-MONEY-006 |

## Assumptions / risks: decimal (28 digits) is sufficient; minor-unit exponent fixed at 2 (USD/EUR) -- covered by TEST-MONEY-005.
