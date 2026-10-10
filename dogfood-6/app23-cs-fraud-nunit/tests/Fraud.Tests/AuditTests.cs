using Fraud.Audit;
using Fraud.Core;

namespace Fraud.Tests;

public class AuditTests
{
    static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    static (ManualClock, AuditTrail) Make()
    {
        var clock = new ManualClock(T0);
        return (clock, new AuditTrail(clock));
    }

    /** @id TEST-AUD-001 @verifies REQ-AUD-001 */
    [Test]
    public void TEST_AUD_001_append_assigns_seq_and_clock_time()
    {
        var (clock, trail) = Make();
        var a = trail.Append("alice", "open", "c1", "d");
        clock.Advance(TimeSpan.FromSeconds(5));
        var b = trail.Append("bob", "close", "c1", "d");
        Assert.That(a.Seq, Is.EqualTo(1));
        Assert.That(b.Seq, Is.EqualTo(2));
        Assert.That(a.Time, Is.EqualTo(T0));
        Assert.That(b.Time, Is.EqualTo(T0.AddSeconds(5)));
    }

    /** @id TEST-AUD-002 @verifies REQ-AUD-002 */
    [Test]
    public void TEST_AUD_002_hash_chain_links_and_genesis()
    {
        var (_, trail) = Make();
        var a = trail.Append("alice", "open", "c1", "d");
        var b = trail.Append("alice", "open", "c2", "d");
        Assert.That(a.PrevHash, Is.EqualTo(new string('0', 64)));
        Assert.That(b.PrevHash, Is.EqualTo(a.Hash));
        Assert.That(a.Hash, Is.EqualTo(AuditHasher.Compute(a.Seq, a.Time, a.Actor, a.Action, a.Subject, a.Detail, a.PrevHash)));
        Assert.That(a.Hash, Has.Length.EqualTo(64));
        Assert.That(a.Hash, Is.EqualTo(a.Hash.ToLowerInvariant()));
    }

    /** @id TEST-AUD-003 @verifies REQ-AUD-003 */
    [Test]
    public void TEST_AUD_003_canonical_encoding_is_unambiguous()
    {
        var h1 = AuditHasher.Compute(1, T0, "ab", "c", "s", "d", "p");
        var h2 = AuditHasher.Compute(1, T0, "a", "bc", "s", "d", "p");
        Assert.That(h1, Is.Not.EqualTo(h2));
        Assert.That(AuditHasher.Canonical(1, T0, "é", "c", "s", "d", "p"), Does.Contain("2:é"));
    }

    /** @id TEST-AUD-004 @verifies REQ-AUD-004 */
    [Test]
    public void TEST_AUD_004_verify_ok_on_clean_chain()
    {
        var (_, trail) = Make();
        for (int i = 0; i < 5; i++) trail.Append("a", "x", "s" + i, "d");
        var r = trail.Verify();
        Assert.That(r.Ok, Is.True);
        Assert.That(r.BadSeq, Is.Null);
        Assert.That(new AuditTrail(new ManualClock(T0)).Verify().Ok, Is.True);
    }

    /** @id TEST-AUD-005 @verifies REQ-AUD-005 */
    [Test]
    public void TEST_AUD_005_verify_detects_tampered_entry()
    {
        var (clock, trail) = Make();
        for (int i = 0; i < 4; i++) trail.Append("a", "x", "s", "d" + i);
        var list = trail.Entries.ToList();
        list[2] = list[2] with { Detail = "forged" };
        var r = AuditTrail.FromEntries(clock, list).Verify();
        Assert.That(r.Ok, Is.False);
        Assert.That(r.BadSeq, Is.EqualTo(3));
    }

    /** @id TEST-AUD-006 @verifies REQ-AUD-006 */
    [Test]
    public void TEST_AUD_006_verify_detects_removed_and_reordered()
    {
        var (clock, trail) = Make();
        for (int i = 0; i < 4; i++) trail.Append("a", "x", "s", "d" + i);
        var removed = trail.Entries.Where(e => e.Seq != 2).ToList();
        var r1 = AuditTrail.FromEntries(clock, removed).Verify();
        Assert.That(r1.Ok, Is.False);
        Assert.That(r1.BadSeq, Is.EqualTo(3));
        var swapped = trail.Entries.ToList();
        (swapped[0], swapped[1]) = (swapped[1], swapped[0]);
        var r2 = AuditTrail.FromEntries(clock, swapped).Verify();
        Assert.That(r2.Ok, Is.False);
        Assert.That(r2.BadSeq, Is.EqualTo(2));
    }

    /** @id TEST-AUD-007 @verifies REQ-AUD-007 */
    [Test]
    public void TEST_AUD_007_query_by_subject_in_seq_order()
    {
        var (_, trail) = Make();
        trail.Append("a", "x", "c1", "1");
        trail.Append("a", "x", "c2", "2");
        trail.Append("a", "y", "c1", "3");
        var s = trail.ForSubject("c1");
        Assert.That(s.Select(e => e.Detail), Is.EqualTo(new[] { "1", "3" }));
        Assert.That(trail.ForSubject("none"), Is.Empty);
    }

    /** @id TEST-AUD-008 @verifies REQ-AUD-008 */
    [Test]
    public void TEST_AUD_008_entries_view_is_a_snapshot()
    {
        var (_, trail) = Make();
        trail.Append("a", "x", "c1", "1");
        var snap = trail.Entries;
        trail.Append("a", "x", "c1", "2");
        Assert.That(snap, Has.Count.EqualTo(1));
        Assert.That(trail.Entries, Has.Count.EqualTo(2));
        Assert.That(snap, Is.Not.SameAs(trail.Entries));
    }

    /** @id TEST-AUD-009 @verifies REQ-AUD-009 */
    [Test]
    public void TEST_AUD_009_jsonl_roundtrip_and_malformed()
    {
        var (clock, trail) = Make();
        trail.Append("a\"q", "x", "c1", "line1\nline2");
        clock.Advance(TimeSpan.FromMilliseconds(1234));
        trail.Append("b", "y", "c2", "ü");
        var text = AuditCodec.Export(trail);
        Assert.That(text.Split('\n', StringSplitOptions.RemoveEmptyEntries), Has.Length.EqualTo(2));
        var back = AuditCodec.Import(text, clock);
        Assert.That(back.Verify().Ok, Is.True);
        Assert.That(back.Entries, Is.EqualTo(trail.Entries));
        Assert.Throws<FormatException>(() => AuditCodec.Import("{not json}\n", clock));
    }
}
