using Pricing.Monetary;
using Pricing.Orders;

namespace Pricing.Discounts;

public interface IDiscountRule
{
    string Id { get; }
    int Priority { get; }
    Money Compute(Order order, Money running);
}

public sealed class PercentOffRule : IDiscountRule
{
    public string Id { get; }
    public int Priority { get; }
    public decimal Percent { get; }

    /** @id CODE-DISC-001 @implements REQ-DISC-007 */
    public PercentOffRule(string id, int priority, decimal percent)
    {
        if (percent < 0m || percent > 100m) throw new ArgumentOutOfRangeException(nameof(percent), percent, "percent must be within 0..100");
        Id = id;
        Priority = priority;
        Percent = percent;
    }

    /** @id CODE-DISC-002 @implements REQ-DISC-002 */
    public Money Compute(Order order, Money running) =>
        Money.Of(running.Amount * Percent / 100m, running.Currency).Round(RoundingMode.HalfUp, 2);
}

public sealed class FixedAmountRule : IDiscountRule
{
    public string Id { get; }
    public int Priority { get; }
    public Money Amount { get; }

    public FixedAmountRule(string id, int priority, Money amount)
    {
        Id = id;
        Priority = priority;
        Amount = amount;
    }

    public Money Compute(Order order, Money running) => Amount;
}

public sealed class BuyXGetYRule : IDiscountRule
{
    private readonly string _sku;
    private readonly int _buy;
    private readonly int _free;
    public string Id { get; }
    public int Priority { get; }

    public BuyXGetYRule(string id, int priority, string sku, int buy, int free)
    {
        Id = id;
        Priority = priority;
        _sku = sku;
        _buy = buy;
        _free = free;
    }

    /** @id CODE-DISC-003 @implements REQ-DISC-005 */
    public Money Compute(Order order, Money running)
    {
        var total = Money.Of(0m, running.Currency);
        foreach (var item in order.Items.Where(i => i.Sku == _sku))
        {
            var freeUnits = item.Quantity / (_buy + _free) * _free;
            total += Money.Of(freeUnits * item.UnitPrice.Amount, running.Currency);
        }
        return total;
    }
}

public sealed record DiscountLine(string RuleId, Money Amount);

public sealed record PipelineResult(Money Subtotal, IReadOnlyList<DiscountLine> Lines, Money Total);

public sealed class DiscountPipeline
{
    private readonly IReadOnlyList<IDiscountRule> _rules;
    private readonly decimal? _maxPercent;

    public DiscountPipeline(IEnumerable<IDiscountRule> rules, decimal? maxPercent = null)
    {
        _rules = rules.ToList();
        _maxPercent = maxPercent;
    }

    public DiscountPipeline With(IEnumerable<IDiscountRule> extra) => new(_rules.Concat(extra), _maxPercent);

    /** @id CODE-DISC-004 @implements REQ-DISC-001 REQ-DISC-003 REQ-DISC-004 REQ-DISC-006 */
    public PipelineResult Run(Order order)
    {
        var subtotal = order.Subtotal;
        var running = subtotal;
        var budget = _maxPercent is { } p
            ? Money.Of(subtotal.Amount * p / 100m, subtotal.Currency).Round(RoundingMode.HalfUp, 2)
            : subtotal;
        var lines = new List<DiscountLine>();
        foreach (var rule in _rules.OrderBy(r => r.Priority).ThenBy(r => r.Id, StringComparer.Ordinal))
        {
            var d = rule.Compute(order, running);
            var amount = Math.Min(Math.Max(d.Amount, 0m), Math.Min(running.Amount, budget.Amount));
            if (amount == 0m) continue;
            var applied = Money.Of(amount, subtotal.Currency);
            lines.Add(new DiscountLine(rule.Id, applied));
            running -= applied;
            budget -= applied;
        }
        return new PipelineResult(subtotal, lines, running);
    }
}
