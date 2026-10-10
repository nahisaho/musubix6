---
feature: money
tier: T2
approval: auto
---
# money
Goal: exact currency-aware monetary arithmetic with BigDecimal.   Non-goals: FX rate sourcing, formatting.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MONEY-001 | When Currency.of(code) is called, the system shall return the currency with its ISO minor-unit digits (USD 2, JPY 0, KWD 3) and shall throw IllegalArgumentException for an unknown code. | TEST-MONEY-001 |
| REQ-MONEY-002 | When Money.of(amount, currency) is called, the system shall round the amount to the currency scale using HALF_EVEN. | TEST-MONEY-002 |
| REQ-MONEY-003 | When two Money values of the same currency are added or subtracted, the system shall return the exact result; if currencies differ, then the system shall throw CurrencyMismatchException. | TEST-MONEY-003 |
| REQ-MONEY-004 | When allocate(ratios) is called, the system shall split the amount into parts proportional to the ratios whose sum equals the original amount exactly, distributing leftover minor units to the earliest parts. | TEST-MONEY-004 |
| REQ-MONEY-005 | When convert(rate, target) is called with rate > 0, the system shall return the amount times rate rounded HALF_EVEN to the target scale; if rate <= 0, then the system shall throw IllegalArgumentException. | TEST-MONEY-005 |
| REQ-MONEY-006 | Money equality shall depend on numeric amount and currency only, and negate() and isZero() shall behave consistently with it. | TEST-MONEY-006 |

## Design
Money is an immutable value object (BigDecimal amount + Currency). Currency is a small registry (code -> digits). All construction funnels through Money.of which applies setScale(digits, HALF_EVEN); arithmetic never loses precision, convert/allocate re-round once.
Allocation uses the largest-remainder-free "floor then distribute remainder minor units front to back" rule so sum is invariant.
## Assumptions / risks
- Rounding mode HALF_EVEN (banker's) is the policy default; retired by TEST-MONEY-002 (2.345 -> 2.34, 2.355 -> 2.36).
- Ratios are non-negative integers with positive sum; invalid ratios throw IllegalArgumentException (covered in TEST-MONEY-004).
