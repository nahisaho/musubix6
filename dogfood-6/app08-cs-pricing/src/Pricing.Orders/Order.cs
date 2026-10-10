using System.Collections.Immutable;
using Pricing.Monetary;

namespace Pricing.Orders;

public enum OrderStatus { Draft, Placed, Paid, Shipped, Delivered, Cancelled, Refunded }

public sealed class InvalidOrderOperationException : Exception
{
    public InvalidOrderOperationException(string m) : base(m) { }
}

public sealed class InvalidOrderTransitionException : Exception
{
    public InvalidOrderTransitionException(OrderStatus from, OrderStatus to) : base($"{from}->{to}") { }
}

public sealed record LineItem(string Sku, int Quantity, Money UnitPrice, string Category = "general")
{
    public Money Total => Money.Of(UnitPrice.Amount * Quantity, UnitPrice.Currency);
}

public sealed record Order
{
    public string Id { get; init; } = "";
    public string Jurisdiction { get; init; } = "";
    public string Currency { get; init; } = "USD";
    public OrderStatus Status { get; init; }
    public ImmutableList<LineItem> Items { get; init; } = ImmutableList<LineItem>.Empty;

    private static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Transitions = new Dictionary<OrderStatus, OrderStatus[]>
    {
        [OrderStatus.Draft] = new[] { OrderStatus.Placed, OrderStatus.Cancelled },
        [OrderStatus.Placed] = new[] { OrderStatus.Paid, OrderStatus.Cancelled },
        [OrderStatus.Paid] = new[] { OrderStatus.Shipped, OrderStatus.Cancelled, OrderStatus.Refunded },
        [OrderStatus.Shipped] = new[] { OrderStatus.Delivered },
        [OrderStatus.Delivered] = new[] { OrderStatus.Refunded },
        [OrderStatus.Cancelled] = Array.Empty<OrderStatus>(),
        [OrderStatus.Refunded] = Array.Empty<OrderStatus>(),
    };

    /** @id CODE-ORD-001 @implements REQ-ORD-001 */
    public static Order Create(string id, string jurisdiction, string currency = "USD") =>
        new() { Id = id, Jurisdiction = jurisdiction, Currency = currency, Status = OrderStatus.Draft };

    /** @id CODE-ORD-002 @implements REQ-ORD-002 REQ-ORD-003 REQ-ORD-004 */
    public Order AddItem(LineItem item)
    {
        if (Status != OrderStatus.Draft) throw new InvalidOrderOperationException($"cannot add items in {Status}");
        if (item.Quantity <= 0) throw new ArgumentException("quantity must be positive", nameof(item));
        if (item.UnitPrice.Currency != Currency) throw new CurrencyMismatchException(Currency, item.UnitPrice.Currency);
        return this with { Items = Items.Add(item) };
    }

    /** @id CODE-ORD-003 @implements REQ-ORD-006 REQ-ORD-007 REQ-ORD-008 */
    public Order TransitionTo(OrderStatus target)
    {
        if (!Transitions[Status].Contains(target)) throw new InvalidOrderTransitionException(Status, target);
        if (target == OrderStatus.Placed && Items.IsEmpty) throw new InvalidOrderTransitionException(Status, target);
        return this with { Status = target };
    }

    /** @id CODE-ORD-004 @implements REQ-ORD-005 */
    public Money Subtotal => Items.Aggregate(Money.Of(0m, Currency), (acc, i) => acc + i.Total);
}
