using Pricing.Coupons;
using Pricing.Discounts;
using Pricing.Engine;
using Pricing.Monetary;
using Pricing.Orders;
using Pricing.Tax;

namespace Pricing.Tests;

public class EngineTests
{
    private static readonly DateOnly Today = new(2026, 1, 10);
    private static Money Usd(decimal a) => Money.Of(a, "USD");

    private static PricingEngine Engine(params IDiscountRule[] rules) => new(
        new DiscountPipeline(rules),
        new CouponPolicy(3),
        new TaxCalculator(TaxTable.Empty.With("US-CA", 0.0825m, "grocery"), RoundingMode.HalfUp, TaxScope.PerLine));

    private static Order Plain() => Order.Create("o-1", "US-CA").AddItem(OrderSupport.Item("A", 2, 50m));

    /** @id TEST-ENG-001 @verifies REQ-ENG-001 */
    [Fact]
    public void TEST_ENG_001_total_is_subtotal_minus_discount_plus_tax()
    {
        var q = Engine().Price(Plain(), Array.Empty<Coupon>(), Today);
        Assert.Equal(Usd(100m), q.Subtotal);
        Assert.Equal(Usd(0m), q.Discount);
        Assert.Equal(Usd(8.25m), q.Tax);
        Assert.Equal(Usd(108.25m), q.Total);
    }

    /** @id TEST-ENG-002 @verifies REQ-ENG-002 */
    [Fact]
    public void TEST_ENG_002_coupons_apply_after_rules_and_rejections_reported()
    {
        var coupons = new[]
        {
            new Coupon("A", CouponKind.Percent, 10m, Today.AddDays(5)),
            new Coupon("OLD", CouponKind.Percent, 50m, Today.AddDays(-1)),
        };
        var q = Engine(new PercentOffRule("base", 1, 10m)).Price(Plain(), coupons, Today);
        Assert.Equal(Usd(19m), q.Discount);
        Assert.Equal(new[] { "A" }, q.AppliedCoupons.Select(c => c.Code).ToArray());
        Assert.Equal(("OLD", "expired"), (q.RejectedCoupons[0].Code, q.RejectedCoupons[0].Reason));
        Assert.Equal(Usd(6.68m), q.Tax);
        Assert.Equal(Usd(87.68m), q.Total);
    }

    /** @id TEST-ENG-003 @verifies REQ-ENG-003 */
    [Fact]
    public void TEST_ENG_003_discount_allocated_before_tax()
    {
        var order = Order.Create("o-1", "US-CA")
            .AddItem(OrderSupport.Item("G", 1, 60m, "grocery"))
            .AddItem(OrderSupport.Item("X", 1, 40m, "general"));
        var q = Engine(new PercentOffRule("base", 1, 10m)).Price(order, Array.Empty<Coupon>(), Today);
        Assert.Equal(Usd(2.97m), q.Tax);
        Assert.Equal(Usd(92.97m), q.Total);
    }

    /** @id TEST-ENG-004 @verifies REQ-ENG-004 */
    [Fact]
    public void TEST_ENG_004_only_draft_or_placed_are_priced()
    {
        var engine = Engine();
        Assert.Equal(Usd(10m), engine.Price(OrderSupport.Reach(OrderStatus.Placed), Array.Empty<Coupon>(), Today).Subtotal);
        Assert.Equal(Usd(10m), engine.Price(OrderSupport.Reach(OrderStatus.Draft), Array.Empty<Coupon>(), Today).Subtotal);
        foreach (var s in new[] { OrderStatus.Paid, OrderStatus.Shipped, OrderStatus.Delivered, OrderStatus.Cancelled, OrderStatus.Refunded })
            Assert.Throws<InvalidOrderOperationException>(() => engine.Price(OrderSupport.Reach(s), Array.Empty<Coupon>(), Today));
    }

    /** @id TEST-ENG-005 @verifies REQ-ENG-005 */
    [Fact]
    public void TEST_ENG_005_place_returns_placed_order_and_quote()
    {
        var draft = Plain();
        var (placed, quote) = Engine().Place(draft, Array.Empty<Coupon>(), Today);
        Assert.Equal(OrderStatus.Placed, placed.Status);
        Assert.Equal(OrderStatus.Draft, draft.Status);
        Assert.Equal(Usd(108.25m), quote.Total);
    }

    /** @id TEST-ENG-006 @verifies REQ-ENG-006 */
    [Fact]
    public void TEST_ENG_006_all_free_order_prices_to_zero()
    {
        var free = Order.Create("o-1", "US-CA").AddItem(OrderSupport.Item("FREE", 3, 0m));
        var q = Engine(new PercentOffRule("base", 1, 10m)).Price(free, Array.Empty<Coupon>(), Today);
        Assert.Equal(Usd(0m), q.Subtotal);
        Assert.Equal(Usd(0m), q.Discount);
        Assert.Equal(Usd(0m), q.Tax);
        Assert.Equal(Usd(0m), q.Total);
    }
}
