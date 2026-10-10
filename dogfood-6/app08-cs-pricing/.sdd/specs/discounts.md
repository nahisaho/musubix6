---
feature: discounts
tier: T2
---
# discounts
Goal: ordered discount-rule pipeline over an order. Non-goals: coupons (see coupons), tax.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DISC-001 | When the pipeline has no rules, the system shall return total equal to the order subtotal and no discount lines. | TEST-DISC-001 |
| REQ-DISC-002 | When PercentOffRule applies, the system shall discount that percent of the running total. | TEST-DISC-002 |
| REQ-DISC-003 | While running, the system shall evaluate rules by ascending priority then id, each seeing the total after previous discounts. | TEST-DISC-003 |
| REQ-DISC-004 | When FixedAmountRule exceeds the running total, the system shall clamp the discount so the total is never negative. | TEST-DISC-004 |
| REQ-DISC-005 | When BuyXGetYRule applies to a sku, the system shall discount floor(qty/(buy+free))*free units at the unit price. | TEST-DISC-005 |
| REQ-DISC-006 | Where a max discount percent is configured, the system shall cap the cumulative discount at that percent of the subtotal. | TEST-DISC-006 |
| REQ-DISC-007 | If a percent is outside 0..100, then the system shall throw ArgumentOutOfRangeException. | TEST-DISC-007 |

## Design
Components: IDiscountRule(Id, Priority, Compute(order, running)->Money), PercentOffRule, FixedAmountRule, BuyXGetYRule, DiscountPipeline(rules, maxPercent?), PipelineResult(Subtotal, Lines, Total).
Data flow: sort rules (priority, id ordinal) -> running=subtotal -> each rule discount clamped to [0,running] -> cap applied to remaining cap budget -> lines record non-zero discounts only.
Pipeline is immutable; With(extraRules) returns a new pipeline (used by engine). Depends on orders (Subtotal REQ-ORD-005, items) and money.
## Assumptions / risks: percent math uses decimal then Round(HalfUp, 2) per rule (REQ-MONEY-003) -- TEST-DISC-002.
