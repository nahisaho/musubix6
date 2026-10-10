using Fraud.Audit;
using Fraud.Core;
using Fraud.Scoring;

namespace Fraud.Decision;

public enum CaseState { Pending, Review, Approved, Declined, Escalated, Chargeback }

public class IllegalTransitionException : Exception
{
    public CaseState From { get; }
    public CaseState To { get; }
    public IllegalTransitionException(CaseState from, CaseState to) : base($"illegal transition {from}->{to}") { From = from; To = to; }
}

public record TransitionRecord(CaseState From, CaseState To, string Actor, string Reason, DateTimeOffset At);

public class DecisionCase
{
    internal readonly List<TransitionRecord> _history = new();
    public string Id { get; }
    public CaseState State { get; internal set; } = CaseState.Pending;
    public int Version { get; internal set; }
    public DateTimeOffset EnteredAt { get; internal set; }
    public DateTimeOffset? ApprovedAt { get; internal set; }
    public IReadOnlyList<TransitionRecord> History => _history.ToArray();

    internal DecisionCase(string id, DateTimeOffset now) { Id = id; EnteredAt = now; }
}

public static class TransitionTable
{
    static readonly HashSet<(CaseState, CaseState)> Edges = new()
    {
        (CaseState.Pending, CaseState.Approved),
        (CaseState.Pending, CaseState.Review),
        (CaseState.Pending, CaseState.Declined),
        (CaseState.Review, CaseState.Approved),
        (CaseState.Review, CaseState.Declined),
        (CaseState.Review, CaseState.Escalated),
        (CaseState.Escalated, CaseState.Approved),
        (CaseState.Escalated, CaseState.Declined),
        (CaseState.Approved, CaseState.Chargeback),
    };

    /** @id CODE-DEC-004 @implements REQ-DEC-004 REQ-DEC-005 */
    public static bool Allows(CaseState from, CaseState to) => Edges.Contains((from, to));
}

public class DecisionMachine
{
    public static readonly TimeSpan ReviewSla = TimeSpan.FromHours(24);
    public static readonly TimeSpan ChargebackWindow = TimeSpan.FromDays(120);

    readonly IClock _clock;
    readonly AuditTrail _trail;
    readonly Dictionary<string, DecisionCase> _cases = new();

    public DecisionMachine(IClock clock, AuditTrail trail) { _clock = clock; _trail = trail; }

    /** @id CODE-DEC-001 @implements REQ-DEC-001 REQ-DEC-011 */
    public DecisionCase Open(string id)
    {
        if (_cases.ContainsKey(id)) throw new InvalidOperationException($"case {id} already exists");
        var c = new DecisionCase(id, _clock.Now);
        _cases.Add(id, c);
        return c;
    }

    public DecisionCase Get(string id) => _cases[id];

    /** @id CODE-DEC-002 @implements REQ-DEC-002 */
    public DecisionCase AutoRoute(string id, RiskBand band)
    {
        var to = band switch { RiskBand.Low => CaseState.Approved, RiskBand.Medium => CaseState.Review, _ => CaseState.Declined };
        return Move(Get(id), to, "system", band.ToString());
    }

    /** @id CODE-DEC-003 @implements REQ-DEC-003 REQ-DEC-007 */
    public DecisionCase Resolve(string id, string actor, bool approve, string reason, bool senior = false)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("reason required", nameof(reason));
        var c = Get(id);
        var to = approve ? CaseState.Approved : CaseState.Declined;
        if (c.State != CaseState.Review && c.State != CaseState.Escalated) throw new IllegalTransitionException(c.State, to);
        if (c.State == CaseState.Escalated && approve && !senior) throw new IllegalTransitionException(c.State, to);
        return Move(c, to, actor, reason);
    }

    /** @id CODE-DEC-008 @implements REQ-DEC-008 */
    public DecisionCase Chargeback(string id, string actor, string reason)
    {
        var c = Get(id);
        if (c.State == CaseState.Approved && _clock.Now - c.ApprovedAt!.Value > ChargebackWindow)
            throw new IllegalTransitionException(c.State, CaseState.Chargeback);
        return Move(c, CaseState.Chargeback, actor, reason);
    }

    /** @id CODE-DEC-006 @implements REQ-DEC-006 */
    public int Tick()
    {
        var n = 0;
        foreach (var c in _cases.Values.ToList())
            if (c.State == CaseState.Review && _clock.Now - c.EnteredAt >= ReviewSla)
            {
                Move(c, CaseState.Escalated, "system", "sla");
                n++;
            }
        return n;
    }

    /** @id CODE-DEC-009 @implements REQ-DEC-009 REQ-DEC-010 */
    DecisionCase Move(DecisionCase c, CaseState to, string actor, string reason)
    {
        if (!TransitionTable.Allows(c.State, to)) throw new IllegalTransitionException(c.State, to);
        var now = _clock.Now;
        _trail.Append(actor, $"{c.State}->{to}", c.Id, reason);
        c._history.Add(new TransitionRecord(c.State, to, actor, reason, now));
        c.State = to;
        c.Version++;
        c.EnteredAt = now;
        if (to == CaseState.Approved) c.ApprovedAt = now;
        return c;
    }
}
