---
feature: coupons
tier: T2
---
# coupons
Goal: coupon validation and stacking policy producing discount rules. Non-goals: redemption persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CPN-001 | If a coupon is past its expiry date, then the policy shall reject it with reason "expired". | TEST-CPN-001 |
| REQ-CPN-002 | If the order subtotal is below a coupon's minimum, then the policy shall reject it with reason "min-subtotal". | TEST-CPN-002 |
| REQ-CPN-003 | If a coupon code repeats (case-insensitive), then the policy shall reject the later one with reason "duplicate". | TEST-CPN-003 |
| REQ-CPN-004 | While a valid non-stackable coupon is present, the policy shall accept only the non-stackable coupon with the largest discount and reject all others with reason "exclusive". | TEST-CPN-004 |
| REQ-CPN-005 | When valid stackable coupons exceed MaxStack, the policy shall accept the first MaxStack in input order and reject the rest with reason "max-stack". | TEST-CPN-005 |
| REQ-CPN-006 | When an accepted coupon is converted with ToRule, the system shall yield a discount rule giving the coupon's percent or fixed discount. | TEST-CPN-006 |

## Design
Components: Coupon(Code, Kind, Value, ExpiresOn, MinSubtotal, Stackable), CouponPolicy(MaxStack).Select(coupons, today, subtotal)->CouponSelection(Accepted, Rejected(code, reason)).
Decision order per coupon: expired -> min-subtotal -> duplicate; then exclusivity (best non-stackable by discount on subtotal, ties by input order); then max-stack. Reasons are the only output strings (single table).
ToRule adapts a Coupon into discounts.IDiscountRule (PercentOffRule/FixedAmountRule) so engine pipelines treat them uniformly. Depends on discounts (REQ-DISC-002, REQ-DISC-004) and money.
## Assumptions / risks: Expiry inclusive on ExpiresOn day -- TEST-CPN-001 boundary assert.
