---
feature: engine
tier: T2
---
# engine
Goal: price an order end-to-end (rules, coupons, tax) and place it. Non-goals: payment.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENG-001 | When an order is priced, the system shall return Total = Subtotal - Discount + Tax for tax-exclusive pricing. | TEST-ENG-001 |
| REQ-ENG-002 | When coupons are supplied, the system shall select them via the coupon policy, apply accepted ones after the pipeline rules and report rejected ones in the quote. | TEST-ENG-002 |
| REQ-ENG-003 | When discount applies, the system shall allocate it across lines proportionally to line totals before computing tax. | TEST-ENG-003 |
| REQ-ENG-004 | If the order status is not Draft or Placed, then Price shall throw InvalidOrderOperationException. | TEST-ENG-004 |
| REQ-ENG-005 | When Place is called on a priced Draft order, the system shall return the order in Placed status together with its quote. | TEST-ENG-005 |
| REQ-ENG-006 | When every item of an order is free (subtotal zero), the system shall price it with zero discount, tax and total instead of failing. | TEST-ENG-006 |

## Design
Components: PricingEngine(DiscountPipeline, CouponPolicy, TaxCalculator).Price(order, coupons, today)->Quote(Subtotal, Discount, Tax, Total, AppliedCoupons, RejectedCoupons); Place(...)->(Order, Quote).
Flow: guard status -> subtotal -> CouponPolicy.Select -> pipeline.With(couponRules) -> discount -> Money.Allocate(discount weights = line totals) -> per-line net -> TaxCalculator -> Quote. Pure; never mutates the order.
Depends on money, orders, discounts, coupons, tax (cross-feature).
## Assumptions / risks: exclusive tax only in engine; inclusive handled by tax feature alone.
