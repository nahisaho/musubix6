using Pricing.Coupons;
using Pricing.Monetary;

namespace Pricing.Tests;

public class CouponTests
{
    private static readonly DateOnly Today = new(2026, 1, 10);
    private static Money Usd(decimal a) => Money.Of(a, "USD");

    private static Coupon Pct(string code, decimal v, int expiresInDays = 30, decimal? min = null, bool stackable = true)
        => new(code, CouponKind.Percent, v, Today.AddDays(expiresInDays), min is null ? null : Usd(min.Value), stackable);

    private static Coupon Fix(string code, decimal v, bool stackable = true)
        => new(code, CouponKind.Fixed, v, Today.AddDays(30), null, stackable);

    /** @id TEST-CPN-001 @verifies REQ-CPN-001 */
    [Fact]
    public void TEST_CPN_001_expired_rejected()
    {
        var sel = new CouponPolicy(3).Select(new[] { Pct("OLD", 10, -1), Pct("TODAY", 10, 0) }, Today, Usd(100m));
        Assert.Equal(new[] { "TODAY" }, sel.Accepted.Select(c => c.Code).ToArray());
        var rej = Assert.Single(sel.Rejected);
        Assert.Equal(("OLD", "expired"), (rej.Code, rej.Reason));
    }

    /** @id TEST-CPN-002 @verifies REQ-CPN-002 */
    [Fact]
    public void TEST_CPN_002_min_subtotal()
    {
        var sel = new CouponPolicy(3).Select(new[] { Pct("BIG", 10, min: 50m) }, Today, Usd(40m));
        Assert.Empty(sel.Accepted);
        Assert.Equal("min-subtotal", Assert.Single(sel.Rejected).Reason);
        var ok = new CouponPolicy(3).Select(new[] { Pct("BIG", 10, min: 50m) }, Today, Usd(50m));
        Assert.Single(ok.Accepted);
    }

    /** @id TEST-CPN-003 @verifies REQ-CPN-003 */
    [Fact]
    public void TEST_CPN_003_duplicates_case_insensitive()
    {
        var sel = new CouponPolicy(3).Select(new[] { Pct("SAVE", 10), Pct("save", 15) }, Today, Usd(100m));
        Assert.Equal(new[] { "SAVE" }, sel.Accepted.Select(c => c.Code).ToArray());
        var rej = Assert.Single(sel.Rejected);
        Assert.Equal(("save", "duplicate"), (rej.Code, rej.Reason));
    }

    /** @id TEST-CPN-004 @verifies REQ-CPN-004 */
    [Fact]
    public void TEST_CPN_004_exclusive_picks_largest()
    {
        var sel = new CouponPolicy(3).Select(new[]
        {
            Fix("N1", 5m, stackable: false),
            Pct("N2", 20, stackable: false),
            Pct("S1", 5),
        }, Today, Usd(100m));
        Assert.Equal(new[] { "N2" }, sel.Accepted.Select(c => c.Code).ToArray());
        Assert.Equal(new[] { ("N1", "exclusive"), ("S1", "exclusive") }, sel.Rejected.Select(r => (r.Code, r.Reason)).ToArray());
    }

    /** @id TEST-CPN-005 @verifies REQ-CPN-005 */
    [Fact]
    public void TEST_CPN_005_max_stack()
    {
        var sel = new CouponPolicy(2).Select(new[] { Pct("A", 5), Pct("B", 5), Pct("C", 5) }, Today, Usd(100m));
        Assert.Equal(new[] { "A", "B" }, sel.Accepted.Select(c => c.Code).ToArray());
        var rej = Assert.Single(sel.Rejected);
        Assert.Equal(("C", "max-stack"), (rej.Code, rej.Reason));
    }

    /** @id TEST-CPN-006 @verifies REQ-CPN-006 */
    [Fact]
    public void TEST_CPN_006_to_rule()
    {
        var order = Pricing.Orders.Order.Create("o", "US-CA").AddItem(OrderSupport.Item("A", 1, 100m));
        var p = Pct("P", 10).ToRule(5);
        var f = Fix("F", 7.5m).ToRule(6);
        Assert.Equal(5, p.Priority);
        Assert.Equal(Usd(10m), p.Compute(order, Usd(100m)));
        Assert.Equal(Usd(7.50m), f.Compute(order, Usd(100m)));
    }
}
