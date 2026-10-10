namespace Pricing.Monetary;

public enum RoundingMode { HalfUp, HalfEven, Down, Up }

public sealed class CurrencyMismatchException : Exception
{
    public CurrencyMismatchException(string a, string b) : base($"{a} vs {b}") { }
}

public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Of(decimal amount, string currency) => new(amount, currency);

    /** @id CODE-MONEY-001 @implements REQ-MONEY-001 REQ-MONEY-002 */
    public static Money operator +(Money a, Money b) => new(a.Amount + b.Amount, SameCurrency(a, b));

    public static Money operator -(Money a, Money b) => new(a.Amount - b.Amount, SameCurrency(a, b));

    private static string SameCurrency(Money a, Money b) =>
        a.Currency == b.Currency ? a.Currency : throw new CurrencyMismatchException(a.Currency, b.Currency);

    /** @id CODE-MONEY-002 @implements REQ-MONEY-003 REQ-MONEY-004 */
    public Money Round(RoundingMode mode, int decimals) => new(Math.Round(Amount, decimals, Midpoint(mode)), Currency);

    private static MidpointRounding Midpoint(RoundingMode mode) => mode switch
    {
        RoundingMode.HalfUp => MidpointRounding.AwayFromZero,
        RoundingMode.HalfEven => MidpointRounding.ToEven,
        RoundingMode.Down => MidpointRounding.ToZero,
        _ => MidpointRounding.ToPositiveInfinity,
    };

    /** @id CODE-MONEY-003 @implements REQ-MONEY-005 REQ-MONEY-006 */
    public Money[] Allocate(params decimal[] weights)
    {
        if (weights.Length == 0 || weights.Any(w => w < 0) || weights.Sum() == 0)
            throw new ArgumentException("weights must be non-empty, non-negative and not all zero");
        var total = weights.Sum();
        var cents = Math.Round(Amount, 2) * 100m;
        var parts = weights.Select(w => Math.Floor(cents * w / total)).ToArray();
        var left = (int)(cents - parts.Sum());
        for (var i = 0; left > 0; i = (i + 1) % parts.Length)
        {
            if (weights[i] == 0) continue;
            parts[i]++;
            left--;
        }
        var currency = Currency;
        return parts.Select(p => new Money(p / 100m, currency)).ToArray();
    }
}
