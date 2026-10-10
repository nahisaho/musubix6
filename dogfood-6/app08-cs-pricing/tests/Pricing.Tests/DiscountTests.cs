using Pricing.Discounts;
using Pricing.Monetary;
using Pricing.Orders;

namespace Pricing.Tests;

public class DiscountTests
{
    private static Money Usd(decimal a) => Money.Of(a, "USD");

    private static Order Hundred() => Order.Create("o-1", "US-CA").AddItem(OrderSupport.Item("A", 2, 50m));

    /** @id TEST-DISC-001 @verifies REQ-DISC-001 */
    [Fact]
    public void TEST_DISC_001_empty_pipeline_keeps_subtotal()
    {
        var r = new DiscountPipeline(Array.Empty<IDiscountRule>()).Run(Hundred());
        Assert.Equal(Usd(100m), r.Total);
        Assert.Empty(r.Lines);
    }

    /** @id TEST-DISC-002 @verifies REQ-DISC-002 */
    [Fact]
    public void TEST_DISC_002_percent_off()
    {
        var r = new DiscountPipeline(new IDiscountRule[] { new PercentOffRule("p", 10, 10m) }).Run(Hundred());
        Assert.Equal(Usd(90m), r.Total);
        var line = Assert.Single(r.Lines);
        Assert.Equal(("p", Usd(10m)), (line.RuleId, line.Amount));
    }

    /** @id TEST-DISC-003 @verifies REQ-DISC-003 */
    [Fact]
    public void TEST_DISC_003_priority_then_id_ordering_on_running_total()
    {
        var r = new DiscountPipeline(new IDiscountRule[]
        {
            new FixedAmountRule("f", 20, Usd(5m)),
            new PercentOffRule("p", 10, 10m),
        }).Run(Hundred());
        Assert.Equal(Usd(85m), r.Total);
        Assert.Equal(new[] { "p", "f" }, r.Lines.Select(l => l.RuleId).ToArray());

        var tie = new DiscountPipeline(new IDiscountRule[]
        {
            new PercentOffRule("b", 1, 10m),
            new FixedAmountRule("a", 1, Usd(5m)),
        }).Run(Hundred());
        Assert.Equal(new[] { "a", "b" }, tie.Lines.Select(l => l.RuleId).ToArray());
        Assert.Equal(Usd(85.50m), tie.Total);
    }

    /** @id TEST-DISC-004 @verifies REQ-DISC-004 */
    [Fact]
    public void TEST_DISC_004_fixed_amount_never_goes_negative()
    {
        var r = new DiscountPipeline(new IDiscountRule[] { new FixedAmountRule("f", 1, Usd(500m)) }).Run(Hundred());
        Assert.Equal(Usd(0m), r.Total);
        Assert.Equal(Usd(100m), Assert.Single(r.Lines).Amount);
    }

    /** @id TEST-DISC-005 @verifies REQ-DISC-005 */
    [Fact]
    public void TEST_DISC_005_buy_x_get_y()
    {
        var o = Order.Create("o-1", "US-CA").AddItem(OrderSupport.Item("A", 7, 10m));
        var r = new DiscountPipeline(new IDiscountRule[] { new BuyXGetYRule("bxgy", 1, "A", 2, 1) }).Run(o);
        Assert.Equal(Usd(20m), Assert.Single(r.Lines).Amount);
        Assert.Equal(Usd(50m), r.Total);
    }

    /** @id TEST-DISC-006 @verifies REQ-DISC-006 */
    [Fact]
    public void TEST_DISC_006_cap_limits_cumulative_discount()
    {
        var r = new DiscountPipeline(new IDiscountRule[]
        {
            new PercentOffRule("p1", 1, 20m),
            new PercentOffRule("p2", 2, 20m),
        }, maxPercent: 30m).Run(Hundred());
        Assert.Equal(Usd(70m), r.Total);
        Assert.Equal(new[] { 20m, 10m }, r.Lines.Select(l => l.Amount.Amount).ToArray());
    }

    /** @id TEST-DISC-007 @verifies REQ-DISC-007 */
    [Fact]
    public void TEST_DISC_007_percent_range_checked()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new PercentOffRule("p", 1, 100.01m));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PercentOffRule("p", 1, -1m));
    }
}
