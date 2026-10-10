using Pricing.Monetary;

namespace Pricing.Tests;

public class MoneyTests
{
    /** @id TEST-MONEY-001 @verifies REQ-MONEY-001 */
    [Fact]
    public void TEST_MONEY_001_adds_same_currency()
    {
        var sum = Money.Of(10.25m, "USD") + Money.Of(0.75m, "USD");
        Assert.Equal(11.00m, sum.Amount);
        Assert.Equal("USD", sum.Currency);
    }

    /** @id TEST-MONEY-002 @verifies REQ-MONEY-002 */
    [Fact]
    public void test_money_002_currency_mismatch_throws()
    {
        var usd = Money.Of(1m, "USD");
        var eur = Money.Of(1m, "EUR");
        Assert.Throws<CurrencyMismatchException>(() => usd + eur);
        Assert.Throws<CurrencyMismatchException>(() => usd - eur);
    }

    /** @id TEST-MONEY-003 @verifies REQ-MONEY-003 */
    [Fact]
    public void test_money_003_half_up_away_from_zero()
    {
        Assert.Equal(2.35m, Money.Of(2.345m, "USD").Round(RoundingMode.HalfUp, 2).Amount);
        Assert.Equal(-2.35m, Money.Of(-2.345m, "USD").Round(RoundingMode.HalfUp, 2).Amount);
    }

    /** @id TEST-MONEY-004 @verifies REQ-MONEY-004 */
    [Fact]
    public void test_money_004_half_even()
    {
        Assert.Equal(2.34m, Money.Of(2.345m, "USD").Round(RoundingMode.HalfEven, 2).Amount);
        Assert.Equal(2.36m, Money.Of(2.355m, "USD").Round(RoundingMode.HalfEven, 2).Amount);
    }

    /** @id TEST-MONEY-005 @verifies REQ-MONEY-005 */
    [Fact]
    public void test_money_005_allocate_is_lossless()
    {
        var parts = Money.Of(100.00m, "USD").Allocate(1m, 1m, 1m);
        Assert.Equal(new[] { 33.34m, 33.33m, 33.33m }, parts.Select(p => p.Amount).ToArray());
        Assert.Equal(100.00m, parts.Sum(p => p.Amount));
    }

    /** @id TEST-MONEY-006 @verifies REQ-MONEY-006 */
    [Fact]
    public void test_money_006_allocate_rejects_bad_weights()
    {
        var m = Money.Of(10m, "USD");
        Assert.Throws<ArgumentException>(() => m.Allocate());
        Assert.Throws<ArgumentException>(() => m.Allocate(1m, -1m));
        Assert.Throws<ArgumentException>(() => m.Allocate(0m, 0m));
    }
}
