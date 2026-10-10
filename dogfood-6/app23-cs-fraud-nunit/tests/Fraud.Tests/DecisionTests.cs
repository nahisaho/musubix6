using Fraud.Audit;
using Fraud.Core;
using Fraud.Decision;
using Fraud.Scoring;

namespace Fraud.Tests;

public class DecisionTests
{
    static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    static (ManualClock, AuditTrail, DecisionMachine) Make()
    {
        var clock = new ManualClock(T0);
        var trail = new AuditTrail(clock);
        return (clock, trail, new DecisionMachine(clock, trail));
    }

    /** @id TEST-DEC-001 @verifies REQ-DEC-001 */
    [Test]
    public void TEST_DEC_001_open_starts_pending_version_zero()
    {
        var (_, _, m) = Make();
        var c = m.Open("c1");
        Assert.That(c.State, Is.EqualTo(CaseState.Pending));
        Assert.That(c.Version, Is.EqualTo(0));
        Assert.That(c.History, Is.Empty);
    }

    /** @id TEST-DEC-002 @verifies REQ-DEC-002 */
    [Test]
    public void TEST_DEC_002_autoroute_by_band()
    {
        var (_, _, m) = Make();
        m.Open("lo"); m.Open("mid"); m.Open("hi");
        Assert.That(m.AutoRoute("lo", RiskBand.Low).State, Is.EqualTo(CaseState.Approved));
        Assert.That(m.AutoRoute("mid", RiskBand.Medium).State, Is.EqualTo(CaseState.Review));
        Assert.That(m.AutoRoute("hi", RiskBand.High).State, Is.EqualTo(CaseState.Declined));
    }

    /** @id TEST-DEC-003 @verifies REQ-DEC-003 */
    [Test]
    public void TEST_DEC_003_analyst_resolve_requires_reason()
    {
        var (_, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        Assert.Throws<ArgumentException>(() => m.Resolve("c1", "ann", true, "  "));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Review));
        Assert.That(m.Resolve("c1", "ann", true, "looks fine").State, Is.EqualTo(CaseState.Approved));
        m.Open("c2");
        m.AutoRoute("c2", RiskBand.Medium);
        Assert.That(m.Resolve("c2", "ann", false, "stolen card").State, Is.EqualTo(CaseState.Declined));
    }

    /** @id TEST-DEC-004 @verifies REQ-DEC-004 */
    [Test]
    public void TEST_DEC_004_illegal_transition_leaves_state_unchanged()
    {
        var (_, trail, m) = Make();
        m.Open("c1");
        var ex = Assert.Throws<IllegalTransitionException>(() => m.Resolve("c1", "ann", true, "x"));
        Assert.That(ex!.From, Is.EqualTo(CaseState.Pending));
        Assert.That(ex.To, Is.EqualTo(CaseState.Approved));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Pending));
        Assert.That(m.Get("c1").Version, Is.EqualTo(0));
        Assert.That(trail.Entries, Is.Empty);
    }

    /** @id TEST-DEC-005 @verifies REQ-DEC-005 */
    [Test]
    public void TEST_DEC_005_terminal_states_reject_everything()
    {
        var (_, _, m) = Make();
        m.Open("d");
        m.AutoRoute("d", RiskBand.High);
        Assert.Throws<IllegalTransitionException>(() => m.Resolve("d", "ann", true, "x"));
        Assert.Throws<IllegalTransitionException>(() => m.Chargeback("d", "ann", "x"));
        Assert.Throws<IllegalTransitionException>(() => m.AutoRoute("d", RiskBand.Low));
        m.Open("a");
        m.AutoRoute("a", RiskBand.Low);
        m.Chargeback("a", "ann", "dispute");
        Assert.That(m.Get("a").State, Is.EqualTo(CaseState.Chargeback));
        Assert.Throws<IllegalTransitionException>(() => m.Chargeback("a", "ann", "again"));
        Assert.Throws<IllegalTransitionException>(() => m.Resolve("a", "ann", false, "x"));
    }

    /** @id TEST-DEC-006 @verifies REQ-DEC-006 */
    [Test]
    public void TEST_DEC_006_tick_escalates_at_24h_inclusive()
    {
        var (clock, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        clock.Advance(TimeSpan.FromHours(24) - TimeSpan.FromTicks(1));
        Assert.That(m.Tick(), Is.EqualTo(0));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Review));
        clock.Advance(TimeSpan.FromTicks(1));
        Assert.That(m.Tick(), Is.EqualTo(1));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Escalated));
        Assert.That(m.Tick(), Is.EqualTo(0));
    }

    /** @id TEST-DEC-007 @verifies REQ-DEC-007 */
    [Test]
    public void TEST_DEC_007_escalated_approve_needs_senior()
    {
        var (clock, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        clock.Advance(TimeSpan.FromHours(30));
        m.Tick();
        Assert.Throws<IllegalTransitionException>(() => m.Resolve("c1", "ann", true, "ok"));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Escalated));
        Assert.That(m.Resolve("c1", "sam", true, "ok", senior: true).State, Is.EqualTo(CaseState.Approved));
        m.Open("c2");
        m.AutoRoute("c2", RiskBand.Medium);
        clock.Advance(TimeSpan.FromHours(30));
        m.Tick();
        Assert.That(m.Resolve("c2", "ann", false, "fraud").State, Is.EqualTo(CaseState.Declined));
    }

    /** @id TEST-DEC-008 @verifies REQ-DEC-008 */
    [Test]
    public void TEST_DEC_008_chargeback_within_120_days_inclusive()
    {
        var (clock, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Low);
        clock.Advance(TimeSpan.FromDays(120));
        Assert.That(m.Chargeback("c1", "ann", "dispute").State, Is.EqualTo(CaseState.Chargeback));
        m.Open("c2");
        m.AutoRoute("c2", RiskBand.Low);
        clock.Advance(TimeSpan.FromDays(120) + TimeSpan.FromTicks(1));
        Assert.Throws<IllegalTransitionException>(() => m.Chargeback("c2", "ann", "late"));
        Assert.That(m.Get("c2").State, Is.EqualTo(CaseState.Approved));
    }

    /** @id TEST-DEC-009 @verifies REQ-DEC-009 */
    [Test]
    public void TEST_DEC_009_transition_appends_audit_entry()
    {
        var (_, trail, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        m.Resolve("c1", "ann", true, "fine");
        Assert.That(trail.Entries.Count, Is.EqualTo(2));
        var e = trail.Entries[1];
        Assert.That(e.Actor, Is.EqualTo("ann"));
        Assert.That(e.Action, Is.EqualTo("Review->Approved"));
        Assert.That(e.Detail, Is.EqualTo("fine"));
        Assert.That(e.Subject, Is.EqualTo("c1"));
        Assert.That(trail.Verify().Ok, Is.True);
    }

    /** @id TEST-DEC-011 @verifies REQ-DEC-011 */
    [Test]
    public void TEST_DEC_011_duplicate_open_rejected()
    {
        var (_, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        Assert.Throws<InvalidOperationException>(() => m.Open("c1"));
        Assert.That(m.Get("c1").State, Is.EqualTo(CaseState.Review));
        Assert.That(m.Get("c1").Version, Is.EqualTo(1));
    }

    /** @id TEST-DEC-010 @verifies REQ-DEC-010 */
    [Test]
    public void TEST_DEC_010_version_and_history_track_transitions()
    {
        var (_, _, m) = Make();
        m.Open("c1");
        m.AutoRoute("c1", RiskBand.Medium);
        m.Resolve("c1", "ann", true, "fine");
        try { m.Resolve("c1", "ann", false, "again"); } catch (IllegalTransitionException) { }
        var c = m.Get("c1");
        Assert.That(c.Version, Is.EqualTo(2));
        Assert.That(c.History.Count, Is.EqualTo(c.Version));
        Assert.That(c.History.Select(h => h.To), Is.EqualTo(new[] { CaseState.Review, CaseState.Approved }));
    }
}
