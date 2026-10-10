using System.Collections.Immutable;
using Pricing.Monetary;

namespace Pricing.Tax;

public enum TaxScope { PerLine, PerOrder }

public sealed class UnknownJurisdictionException : Exception
{
    public UnknownJurisdictionException(string j) : base(j) { }
}

public sealed record JurisdictionRule(decimal Rate, IReadOnlySet<string> Exempt);

public sealed record TaxableLine(string Category, Money Amount);

public sealed record TaxResult(Money Net, Money Tax, Money Gross);

public sealed class TaxTable
{
    public static readonly TaxTable Empty = new(ImmutableDictionary<string, JurisdictionRule>.Empty);

    private readonly ImmutableDictionary<string, JurisdictionRule> _rules;

    private TaxTable(ImmutableDictionary<string, JurisdictionRule> rules) => _rules = rules;

    /** @id CODE-TAX-001 @implements REQ-TAX-005 */
    public TaxTable With(string jurisdiction, decimal rate, params string[] exempt)
    {
        if (rate < 0m || rate > 1m) throw new ArgumentOutOfRangeException(nameof(rate), rate, "rate must be within 0..1");
        return new(_rules.SetItem(jurisdiction, new JurisdictionRule(rate, exempt.ToHashSet(StringComparer.OrdinalIgnoreCase))));
    }

    public JurisdictionRule? Find(string jurisdiction) => _rules.TryGetValue(jurisdiction, out var r) ? r : null;
}

public sealed class TaxCalculator
{
    private readonly TaxTable _table;
    private readonly RoundingMode _mode;
    private readonly TaxScope _scope;
    private readonly bool _inclusive;

    public TaxCalculator(TaxTable table, RoundingMode mode, TaxScope scope, bool inclusive = false)
    {
        _table = table;
        _mode = mode;
        _scope = scope;
        _inclusive = inclusive;
    }

    /** @id CODE-TAX-002 @implements REQ-TAX-001 REQ-TAX-002 REQ-TAX-003 REQ-TAX-004 REQ-TAX-006 */
    public TaxResult Calculate(string jurisdiction, string currency, IReadOnlyList<TaxableLine> lines)
    {
        var rule = _table.Find(jurisdiction) ?? throw new UnknownJurisdictionException(jurisdiction);
        var zero = Money.Of(0m, currency);
        var rawTaxes = lines.Select(l => RawTax(l, rule)).ToList();
        var tax = _scope == TaxScope.PerLine
            ? rawTaxes.Aggregate(zero, (acc, t) => acc + Money.Of(t, currency).Round(_mode, 2))
            : Money.Of(rawTaxes.Sum(), currency).Round(_mode, 2);
        var total = lines.Aggregate(zero, (acc, l) => acc + l.Amount);
        return _inclusive ? new TaxResult(total - tax, tax, total) : new TaxResult(total, tax, total + tax);
    }

    private decimal RawTax(TaxableLine line, JurisdictionRule rule)
    {
        if (rule.Exempt.Contains(line.Category)) return 0m;
        var amount = line.Amount.Amount;
        return _inclusive ? amount - amount / (1m + rule.Rate) : amount * rule.Rate;
    }
}
