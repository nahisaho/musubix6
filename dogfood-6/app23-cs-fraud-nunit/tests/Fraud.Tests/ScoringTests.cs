using Fraud.Core;
using Fraud.Dsl;
using Fraud.Scoring;
using Fraud.Velocity;

namespace Fraud.Tests;

public class ScoringTests
{
    static readonly DateTimeOffset T0 = new(2026, 5, 1, 9, 0, 0, TimeSpan.Zero);

    static Txn Tx(string id, string acct = "A", decimal amount = 10m, string country = "US", string merchant = "shop", DateTimeOffset? time = null) =>
        new(id, acct, amount, country, merchant, time ?? T0);

    static (ManualClock, VelocityStore, ScoringPipeline) Make(string rules)
    {
        var clock = new ManualClock(T0);
        var store = new VelocityStore(clock, TimeSpan.FromDays(1), 1000);
        return (clock, store, new ScoringPipeline(Parser.ParseRules(rules), store, clock));
    }

    /** @id TEST-SCO-001 @verifies REQ-SCO-001 */
    [Test]
    public void TEST_SCO_001_sums_matching_weights()
    {
        var (_, _, p) = Make("rule big weight 30 when amount > 1000\nrule foreign weight 25 when country != \"US\"\nrule never weight 50 when amount < 0");
        Assert.That(p.Score(Tx("t1", amount: 2000m, country: "FR")).Score, Is.EqualTo(55));
        Assert.That(p.Score(Tx("t2", amount: 2000m)).Score, Is.EqualTo(30));
        Assert.That(p.Score(Tx("t3")).Score, Is.EqualTo(0));
    }

    /** @id TEST-SCO-002 @verifies REQ-SCO-002 */
    [Test]
    public void TEST_SCO_002_score_is_clamped_0_to_100()
    {
        var (_, _, p) = Make("rule a weight 80 when amount > 0\nrule b weight 70 when amount > 0");
        Assert.That(p.Score(Tx("t1")).Score, Is.EqualTo(100));
        var (_, _, q) = Make("rule c weight -50 when amount > 0");
        Assert.That(q.Score(Tx("t2")).Score, Is.EqualTo(0));
    }

    /** @id TEST-SCO-003 @verifies REQ-SCO-003 */
    [Test]
    public void TEST_SCO_003_negative_weight_subtracts_before_clamp()
    {
        var (_, _, p) = Make("rule big weight 30 when amount > 100\nrule allow weight -20 when merchant in [\"trusted\"]\nrule hot weight 90 when amount > 100");
        Assert.That(p.Score(Tx("t1", amount: 500m, merchant: "trusted")).Score, Is.EqualTo(100), "30-20+90=100 not clamp(120)-20");
        Assert.That(p.Score(Tx("t2", amount: 500m)).Score, Is.EqualTo(100));
        var (_, _, q) = Make("rule big weight 30 when amount > 100\nrule allow weight -20 when merchant in [\"trusted\"]");
        Assert.That(q.Score(Tx("t3", amount: 500m, merchant: "trusted")).Score, Is.EqualTo(10));
    }

    /** @id TEST-SCO-004 @verifies REQ-SCO-004 */
    [Test]
    public void TEST_SCO_004_matched_order_is_deterministic()
    {
        var (_, _, p) = Make("rule zeta weight 25 when amount > 0\nrule alpha weight 25 when amount > 0\nrule allow weight -40 when amount > 0\nrule small weight 5 when amount > 0");
        var r = p.Score(Tx("t1"));
        Assert.That(r.Matched.Select(m => m.Name), Is.EqualTo(new[] { "allow", "alpha", "zeta", "small" }));
        Assert.That(r.Matched[0].Weight, Is.EqualTo(-40));
    }

    /** @id TEST-SCO-005 @verifies REQ-SCO-005 */
    [Test]
    public void TEST_SCO_005_rule_errors_fail_open_and_are_reported()
    {
        var (_, _, p) = Make("rule bad weight 40 when amount / 0 > 1\nrule ok weight 20 when amount > 0\nrule missing weight 10 when ghost + 1 > 0");
        var r = p.Score(Tx("t1"));
        Assert.That(r.Score, Is.EqualTo(20));
        Assert.That(r.Matched.Select(m => m.Name), Is.EqualTo(new[] { "ok" }));
        Assert.That(r.Errors.Select(e => e.Rule), Is.EqualTo(new[] { "bad", "missing" }));
        Assert.That(r.Errors[0].Message, Does.Contain("division by zero"));
        Assert.That(r.HasErrors, Is.True);
        Assert.That(p.Score(Tx("t2")).HasErrors, Is.True);
    }

    /** @id TEST-SCO-006 @verifies REQ-SCO-006 */
    [Test]
    public void TEST_SCO_006_velocity_functions_scoped_to_account()
    {
        var (clock, _, p) = Make("rule rapid weight 20 when count(10m) >= 1\nrule heavy weight 10 when sum(1h) > 150\nrule geo weight 15 when distinct(\"country\", 1h) >= 2");
        Assert.That(p.Score(Tx("t1", amount: 100m, country: "US")).Score, Is.EqualTo(0));
        clock.Advance(TimeSpan.FromMinutes(5));
        var r = p.Score(Tx("t2", amount: 100m, country: "FR", time: clock.Now));
        Assert.That(r.Matched.Select(m => m.Name), Is.EquivalentTo(new[] { "rapid" }), "geo needs 2 distinct BEFORE this txn; heavy sum is 100");
        var other = p.Score(Tx("t3", acct: "B", time: clock.Now));
        Assert.That(other.Score, Is.EqualTo(0), "account B has no history");
        clock.Advance(TimeSpan.FromMinutes(1));
        var r3 = p.Score(Tx("t4", amount: 1m, country: "DE", time: clock.Now));
        Assert.That(r3.Matched.Select(m => m.Name), Is.EquivalentTo(new[] { "rapid", "heavy", "geo" }));
        var (_, _, bad) = Make("rule x weight 5 when distinct(\"merchant\", 1h) >= 0");
        Assert.That(bad.Score(Tx("t5")).Errors, Has.Count.EqualTo(1));
    }

    /** @id TEST-SCO-007 @verifies REQ-SCO-007 */
    [Test]
    public void TEST_SCO_007_transaction_recorded_after_evaluation()
    {
        var (_, store, p) = Make("rule first weight 5 when count(1h) == 0");
        Assert.That(p.Score(Tx("t1")).Score, Is.EqualTo(5));
        Assert.That(store.Count("A", TimeSpan.FromHours(1)), Is.EqualTo(1));
        Assert.That(p.Score(Tx("t2")).Score, Is.EqualTo(0));
        Assert.That(store.Count("A", TimeSpan.FromHours(1)), Is.EqualTo(2));
        Assert.That(store.Sum("A", TimeSpan.FromHours(1)), Is.EqualTo(20m));
    }

    /** @id TEST-SCO-008 @verifies REQ-SCO-008 */
    [Test]
    public void TEST_SCO_008_bands_and_threshold_validation()
    {
        var b = new Bands(30, 70);
        Assert.That(b.Of(0), Is.EqualTo(RiskBand.Low));
        Assert.That(b.Of(29), Is.EqualTo(RiskBand.Low));
        Assert.That(b.Of(30), Is.EqualTo(RiskBand.Medium));
        Assert.That(b.Of(69), Is.EqualTo(RiskBand.Medium));
        Assert.That(b.Of(70), Is.EqualTo(RiskBand.High));
        Assert.That(b.Of(100), Is.EqualTo(RiskBand.High));
        Assert.Throws<ArgumentException>(() => new Bands(70, 30));
        Assert.Throws<ArgumentException>(() => new Bands(30, 30));
    }

    /** @id TEST-SCO-009 @verifies REQ-SCO-009 */
    [Test]
    public void TEST_SCO_009_idempotent_per_transaction_id()
    {
        var (clock, store, p) = Make("rule rapid weight 20 when count(1h) >= 1");
        var first = p.Score(Tx("t1"));
        clock.Advance(TimeSpan.FromMinutes(1));
        var again = p.Score(Tx("t1"));
        Assert.That(again, Is.SameAs(first));
        Assert.That(store.Count("A", TimeSpan.FromHours(1)), Is.EqualTo(1));
        var next = p.Score(Tx("t2"));
        Assert.That(next.Score, Is.EqualTo(20));
    }

    /** @id TEST-SCO-010 @verifies REQ-SCO-010 */
    [Test]
    public void TEST_SCO_010_explanation_string()
    {
        var (_, _, p) = Make("rule big weight 30 when amount > 1000\nrule foreign weight 25 when country != \"US\"\nrule allow weight -10 when merchant == \"trusted\"");
        Assert.That(p.Score(Tx("t1", amount: 2000m, country: "FR", merchant: "trusted")).Explanation, Is.EqualTo("score=45; matched=big(+30),foreign(+25),allow(-10)"));
        Assert.That(p.Score(Tx("t2")).Explanation, Is.EqualTo("score=0; matched=none"));
    }
}
