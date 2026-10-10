using Pricing.Coupons;
using Pricing.Discounts;
using Pricing.Monetary;
using Pricing.Orders;
using Pricing.Tax;

namespace Pricing.Engine;

public sealed record Quote(Money Subtotal, Money Discount, Money Tax, Money Total,
    IReadOnlyList<Coupon> AppliedCoupons, IReadOnlyList<RejectedCoupon> RejectedCoupons);

public sealed class PricingEngine
{
    private const int CouponPriorityBase = 1000;
    private readonly DiscountPipeline _pipeline;
    private readonly CouponPolicy _policy;
    private readonly TaxCalculator _tax;

    public PricingEngine(DiscountPipeline pipeline, CouponPolicy policy, TaxCalculator tax)
    {
        _pipeline = pipeline;
        _policy = policy;
        _tax = tax;
    }

    /** @id CODE-ENG-001 @implements REQ-ENG-001 REQ-ENG-002 REQ-ENG-003 REQ-ENG-004 REQ-ENG-006 */
    public Quote Price(Order order, IEnumerable<Coupon> coupons, DateOnly today)
    {
        if (order.Status is not (OrderStatus.Draft or OrderStatus.Placed))
            throw new InvalidOrderOperationException($"cannot price an order in {order.Status}");
        var selection = _policy.Select(coupons, today, order.Subtotal);
        var rules = selection.Accepted.Select((c, i) => c.ToRule(CouponPriorityBase + i));
        var result = _pipeline.With(rules).Run(order);
        var discount = result.Subtotal - result.Total;

        var weights = order.Items.Select(i => i.Total.Amount).ToArray();
        var shares = discount.Amount == 0m ? weights.Select(_ => Money.Of(0m, order.Currency)).ToArray() : discount.Allocate(weights);
        var taxable = order.Items
            .Select((item, i) => new TaxableLine(item.Category, item.Total - shares[i]))
            .ToList();
        var tax = _tax.Calculate(order.Jurisdiction, order.Currency, taxable);
        return new Quote(result.Subtotal, discount, tax.Tax, result.Total + tax.Tax, selection.Accepted, selection.Rejected);
    }

    /** @id CODE-ENG-002 @implements REQ-ENG-005 */
    public (Order Order, Quote Quote) Place(Order order, IEnumerable<Coupon> coupons, DateOnly today)
    {
        var quote = Price(order, coupons, today);
        return (order.TransitionTo(OrderStatus.Placed), quote);
    }
}
