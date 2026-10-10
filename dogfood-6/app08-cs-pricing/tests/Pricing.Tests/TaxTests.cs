using Pricing.Monetary;
using Pricing.Tax;

namespace Pricing.Tests;

public class TaxTests
{
    private static Money Usd(decimal a) => Money.Of(a, "USD");

    private static TaxTable Table() => TaxTable.Empty
        .With("US-CA", 0.0825m, "grocery")
        .With("US-OR", 0m);

    /** @id TEST-TAX-001 @verifies REQ-TAX-001 */
    [Fact]
    public void TEST_TAX_001_applies_jurisdiction_rate()
    {
        var calc = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerLine);
        var r = calc.Calculate("US-CA", "USD", new[] { new TaxableLine("general", Usd(100.00m)) });
        Assert.Equal(Usd(100.00m), r.Net);
        Assert.Equal(Usd(8.25m), r.Tax);
        Assert.Equal(Usd(108.25m), r.Gross);
    }

    /** @id TEST-TAX-002 @verifies REQ-TAX-002 */
    [Fact]
    public void TEST_TAX_002_unknown_jurisdiction_throws()
    {
        var calc = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerLine);
        Assert.Throws<UnknownJurisdictionException>(() =>
            calc.Calculate("US-XX", "USD", new[] { new TaxableLine("general", Usd(1m)) }));
    }

    /** @id TEST-TAX-003 @verifies REQ-TAX-003 */
    [Fact]
    public void TEST_TAX_003_exempt_category_pays_zero()
    {
        var calc = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerLine);
        var r = calc.Calculate("US-CA", "USD", new[]
        {
            new TaxableLine("grocery", Usd(50.00m)),
            new TaxableLine("general", Usd(100.00m)),
        });
        Assert.Equal(Usd(8.25m), r.Tax);
        Assert.Equal(Usd(150.00m), r.Net);
    }

    /** @id TEST-TAX-004 @verifies REQ-TAX-004 */
    [Fact]
    public void TEST_TAX_004_rounding_scope_changes_total()
    {
        var lines = Enumerable.Repeat(new TaxableLine("general", Usd(0.10m)), 3).ToArray();
        var perLine = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerLine).Calculate("US-CA", "USD", lines);
        var perOrder = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerOrder).Calculate("US-CA", "USD", lines);
        Assert.Equal(Usd(0.03m), perLine.Tax);
        Assert.Equal(Usd(0.02m), perOrder.Tax);
    }

    /** @id TEST-TAX-005 @verifies REQ-TAX-005 */
    [Fact]
    public void TEST_TAX_005_rejects_bad_rates()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TaxTable.Empty.With("X", 1.5m));
        Assert.Throws<ArgumentOutOfRangeException>(() => TaxTable.Empty.With("X", -0.01m));
    }

    /** @id TEST-TAX-006 @verifies REQ-TAX-006 */
    [Fact]
    public void TEST_TAX_006_inclusive_extracts_tax()
    {
        var calc = new TaxCalculator(Table(), RoundingMode.HalfUp, TaxScope.PerOrder, inclusive: true);
        var r = calc.Calculate("US-CA", "USD", new[] { new TaxableLine("general", Usd(108.25m)) });
        Assert.Equal(Usd(8.25m), r.Tax);
        Assert.Equal(Usd(100.00m), r.Net);
        Assert.Equal(Usd(108.25m), r.Gross);
    }
}
