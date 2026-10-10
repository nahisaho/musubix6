using Fraud.Core;
using Fraud.Dsl;
using Fraud.Velocity;

namespace Fraud.Scoring;

public enum RiskBand { Low, Medium, High }

public record MatchedRule(string Name, int Weight);

public record RuleError(string Rule, string Message);

public record ScoreResult(int Score, IReadOnlyList<MatchedRule> Matched, IReadOnlyList<RuleError> Errors, string Explanation)
{
    public bool HasErrors => Errors.Count > 0;
}

public class Bands
{
    readonly int _medium;
    readonly int _high;

    /** @id CODE-SCO-008 @implements REQ-SCO-008 */
    public Bands(int medium, int high)
    {
        if (medium >= high) throw new ArgumentException("thresholds must be strictly ascending");
        _medium = medium;
        _high = high;
    }

    public RiskBand Of(int score) => score < _medium ? RiskBand.Low : score < _high ? RiskBand.Medium : RiskBand.High;
}

public class ScoringPipeline
{
    readonly IReadOnlyList<Rule> _rules;
    readonly VelocityStore _store;
    readonly IClock _clock;
    readonly Dictionary<string, ScoreResult> _done = new();

    public ScoringPipeline(IReadOnlyList<Rule> rules, VelocityStore store, IClock clock)
    {
        _rules = rules;
        _store = store;
        _clock = clock;
    }

    /** @id CODE-SCO-001 @implements REQ-SCO-001 REQ-SCO-002 REQ-SCO-003 REQ-SCO-004 REQ-SCO-005 REQ-SCO-007 REQ-SCO-009 REQ-SCO-010 */
    public ScoreResult Score(Txn txn)
    {
        if (_done.TryGetValue(txn.Id, out var cached)) return cached;
        var ctx = new Dictionary<string, object?> { ["amount"] = txn.Amount, ["country"] = txn.Country, ["merchant"] = txn.Merchant, ["account"] = txn.Account };
        var matched = new List<MatchedRule>();
        var errors = new List<RuleError>();
        foreach (var rule in _rules)
        {
            try
            {
                var v = Evaluator.Eval(rule.When, ctx, (name, args) => Call(txn, name, args));
                if (v is not bool b) throw new EvalException("rule did not yield a boolean");
                if (b) matched.Add(new MatchedRule(rule.Name, rule.Weight));
            }
            catch (EvalException ex)
            {
                errors.Add(new RuleError(rule.Name, ex.Message));
            }
        }
        var score = Math.Clamp(matched.Sum(m => m.Weight), 0, 100);
        var ordered = matched.OrderByDescending(m => Math.Abs(m.Weight)).ThenBy(m => m.Name, StringComparer.OrdinalIgnoreCase).ToList();
        var list = ordered.Count == 0 ? "none" : string.Join(",", ordered.Select(m => $"{m.Name}({(m.Weight >= 0 ? "+" : "")}{m.Weight})"));
        var result = new ScoreResult(score, ordered, errors, $"score={score}; matched={list}");
        _store.Record(txn.Account, txn.Time, txn.Amount, txn.Country);
        _done[txn.Id] = result;
        return result;
    }

    /** @id CODE-SCO-006 @implements REQ-SCO-006 */
    object? Call(Txn txn, string name, object?[] args)
    {
        switch (name)
        {
            case "count" when args is [TimeSpan w]: return (decimal)_store.Count(txn.Account, w);
            case "sum" when args is [TimeSpan w]: return _store.Sum(txn.Account, w);
            case "distinct" when args is ["country", TimeSpan w]: return (decimal)_store.Distinct(txn.Account, w);
            case "distinct" when args is [string f, TimeSpan]: throw new EvalException($"unsupported distinct field {f}");
            default: throw new EvalException($"unknown function {name}");
        }
    }
}
