namespace Fraud.Core;

public interface IClock
{
    DateTimeOffset Now { get; }
}

public sealed record Txn(string Id, string Account, decimal Amount, string Country, string Merchant, DateTimeOffset Time);
