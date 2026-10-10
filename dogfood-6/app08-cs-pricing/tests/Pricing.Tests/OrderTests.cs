using Pricing.Monetary;
using Pricing.Orders;

namespace Pricing.Tests;

public static class OrderSupport
{
    public static LineItem Item(string sku = "A", int qty = 1, decimal price = 10m, string cat = "general", string cur = "USD")
        => new(sku, qty, Money.Of(price, cur), cat);

    public static Order Draft() => Order.Create("o-1", "US-CA").AddItem(Item());

    public static Order Reach(OrderStatus s) => s switch
    {
        OrderStatus.Draft => Draft(),
        OrderStatus.Placed => Draft().TransitionTo(OrderStatus.Placed),
        OrderStatus.Paid => Reach(OrderStatus.Placed).TransitionTo(OrderStatus.Paid),
        OrderStatus.Shipped => Reach(OrderStatus.Paid).TransitionTo(OrderStatus.Shipped),
        OrderStatus.Delivered => Reach(OrderStatus.Shipped).TransitionTo(OrderStatus.Delivered),
        OrderStatus.Cancelled => Draft().TransitionTo(OrderStatus.Cancelled),
        OrderStatus.Refunded => Reach(OrderStatus.Paid).TransitionTo(OrderStatus.Refunded),
        _ => throw new ArgumentOutOfRangeException(nameof(s)),
    };

    public static readonly (OrderStatus From, OrderStatus To)[] Legal =
    {
        (OrderStatus.Draft, OrderStatus.Placed), (OrderStatus.Draft, OrderStatus.Cancelled),
        (OrderStatus.Placed, OrderStatus.Paid), (OrderStatus.Placed, OrderStatus.Cancelled),
        (OrderStatus.Paid, OrderStatus.Shipped), (OrderStatus.Paid, OrderStatus.Cancelled), (OrderStatus.Paid, OrderStatus.Refunded),
        (OrderStatus.Shipped, OrderStatus.Delivered),
        (OrderStatus.Delivered, OrderStatus.Refunded),
    };
}

public class OrderTests
{
    /** @id TEST-ORD-001 @verifies REQ-ORD-001 */
    [Fact]
    public void TEST_ORD_001_new_order_is_empty_draft()
    {
        var o = Order.Create("o-1", "US-CA");
        Assert.Equal(OrderStatus.Draft, o.Status);
        Assert.Empty(o.Items);
    }

    /** @id TEST-ORD-002 @verifies REQ-ORD-002 */
    [Fact]
    public void TEST_ORD_002_add_item_is_immutable()
    {
        var o = Order.Create("o-1", "US-CA");
        var o2 = o.AddItem(OrderSupport.Item());
        Assert.Empty(o.Items);
        Assert.Single(o2.Items);
        Assert.NotSame(o, o2);
    }

    /** @id TEST-ORD-003 @verifies REQ-ORD-003 */
    [Fact]
    public void TEST_ORD_003_add_item_requires_draft()
    {
        var placed = OrderSupport.Reach(OrderStatus.Placed);
        Assert.Throws<InvalidOrderOperationException>(() => placed.AddItem(OrderSupport.Item("B")));
    }

    /** @id TEST-ORD-004 @verifies REQ-ORD-004 */
    [Fact]
    public void TEST_ORD_004_rejects_bad_quantity_and_mixed_currency()
    {
        var o = OrderSupport.Draft();
        Assert.Throws<ArgumentException>(() => o.AddItem(OrderSupport.Item(qty: 0)));
        Assert.Throws<ArgumentException>(() => o.AddItem(OrderSupport.Item(qty: -2)));
        Assert.Throws<CurrencyMismatchException>(() => o.AddItem(OrderSupport.Item("B", cur: "EUR")));
    }

    /** @id TEST-ORD-005 @verifies REQ-ORD-005 */
    [Fact]
    public void TEST_ORD_005_subtotal_sums_lines()
    {
        var o = Order.Create("o-1", "US-CA")
            .AddItem(OrderSupport.Item("A", 2, 10.50m))
            .AddItem(OrderSupport.Item("B", 1, 3.00m));
        Assert.Equal(Money.Of(24.00m, "USD"), o.Subtotal);
    }

    /** @id TEST-ORD-006 @verifies REQ-ORD-006 */
    [Fact]
    public void TEST_ORD_006_legal_transitions()
    {
        foreach (var (from, to) in OrderSupport.Legal)
        {
            var start = OrderSupport.Reach(from);
            var next = start.TransitionTo(to);
            Assert.Equal(to, next.Status);
            Assert.Equal(from, start.Status);
        }
    }

    /** @id TEST-ORD-007 @verifies REQ-ORD-007 */
    [Fact]
    public void TEST_ORD_007_illegal_transitions_throw()
    {
        foreach (var from in Enum.GetValues<OrderStatus>())
            foreach (var to in Enum.GetValues<OrderStatus>())
            {
                if (OrderSupport.Legal.Contains((from, to))) continue;
                var start = OrderSupport.Reach(from);
                Assert.Throws<InvalidOrderTransitionException>(() => start.TransitionTo(to));
            }
    }

    /** @id TEST-ORD-008 @verifies REQ-ORD-008 */
    [Fact]
    public void TEST_ORD_008_empty_order_cannot_be_placed()
    {
        var o = Order.Create("o-1", "US-CA");
        Assert.Throws<InvalidOrderTransitionException>(() => o.TransitionTo(OrderStatus.Placed));
    }
}
