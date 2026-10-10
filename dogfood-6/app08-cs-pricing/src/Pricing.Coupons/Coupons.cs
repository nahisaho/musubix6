using Pricing.Discounts;
using Pricing.Monetary;

namespace Pricing.Coupons;

public enum CouponKind { Percent, Fixed }

public sealed record Coupon(string Code, CouponKind Kind, decimal Value, DateOnly ExpiresOn, Money? MinSubtotal = null, bool Stackable = true)
{
    public Money DiscountOn(Money subtotal)
    {
        var raw = Kind == CouponKind.Percent ? subtotal.Amount * Value / 100m : Math.Min(Value, subtotal.Amount);
        return Money.Of(raw, subtotal.Currency).Round(RoundingMode.HalfUp, 2);
    }

    /** @id CODE-CPN-001 @implements REQ-CPN-006 */
    public IDiscountRule ToRule(int priority) => Kind == CouponKind.Percent
        ? new PercentOffRule("coupon:" + Code, priority, Value)
        : new FixedAmountRule("coupon:" + Code, priority, Money.Of(Value, MinSubtotal?.Currency ?? "USD"));
}

public sealed record RejectedCoupon(string Code, string Reason);

public sealed record CouponSelection(IReadOnlyList<Coupon> Accepted, IReadOnlyList<RejectedCoupon> Rejected);

public sealed class CouponPolicy
{
    private readonly int _maxStack;

    public CouponPolicy(int maxStack) => _maxStack = maxStack;

    /** @id CODE-CPN-002 @implements REQ-CPN-001 REQ-CPN-002 REQ-CPN-003 REQ-CPN-004 REQ-CPN-005 */
    public CouponSelection Select(IEnumerable<Coupon> coupons, DateOnly today, Money subtotal)
    {
        var rejected = new List<(int Index, RejectedCoupon Rej)>();
        var valid = new List<(int Index, Coupon C)>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var i = 0;
        foreach (var c in coupons)
        {
            var idx = i++;
            var repeated = !seen.Add(c.Code);
            string? reason = c.ExpiresOn < today ? "expired"
                : c.MinSubtotal is { } min && subtotal.Amount < min.Amount ? "min-subtotal"
                : repeated ? "duplicate"
                : null;
            if (reason is null) valid.Add((idx, c));
            else rejected.Add((idx, new RejectedCoupon(c.Code, reason)));
        }

        List<Coupon> accepted;
        if (valid.Any(v => !v.C.Stackable))
        {
            var best = valid.Where(v => !v.C.Stackable).MaxBy(v => v.C.DiscountOn(subtotal).Amount);
            accepted = new List<Coupon> { best.C };
            rejected.AddRange(valid.Where(v => v.Index != best.Index).Select(v => (v.Index, new RejectedCoupon(v.C.Code, "exclusive"))));
        }
        else
        {
            accepted = valid.Take(_maxStack).Select(v => v.C).ToList();
            rejected.AddRange(valid.Skip(_maxStack).Select(v => (v.Index, new RejectedCoupon(v.C.Code, "max-stack"))));
        }
        return new CouponSelection(accepted, rejected.OrderBy(r => r.Index).Select(r => r.Rej).ToList());
    }
}
