using Fraud.Core;
using Fraud.Velocity;

namespace Fraud.Tests;

public class VelocityTests
{
    static readonly DateTimeOffset T0 = new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);
    static readonly TimeSpan Hour = TimeSpan.FromHours(1);

    static (ManualClock, VelocityStore) Make(int capacity = 1000)
    {
        var clock = new ManualClock(T0);
        return (clock, new VelocityStore(clock, TimeSpan.FromHours(24), capacity));
    }

    /** @id TEST-VEL-001 @verifies REQ-VEL-001 */
    [Test]
    public void TEST_VEL_001_clock_advances_and_rejects_negative()
    {
        var clock = new ManualClock(T0);
        Assert.That(clock.Now, Is.EqualTo(T0));
        clock.Advance(TimeSpan.FromMinutes(90));
        Assert.That(clock.Now, Is.EqualTo(T0.AddMinutes(90)));
        clock.Advance(TimeSpan.Zero);
        Assert.That(clock.Now, Is.EqualTo(T0.AddMinutes(90)));
        Assert.Throws<ArgumentOutOfRangeException>(() => clock.Advance(TimeSpan.FromSeconds(-1)));
        Assert.That(clock.Now, Is.EqualTo(T0.AddMinutes(90)));
    }

    /** @id TEST-VEL-002 @verifies REQ-VEL-002 */
    [Test]
    public void TEST_VEL_002_window_is_half_open()
    {
        var (clock, store) = Make();
        store.Record("a", T0, 1m, "US");
        clock.Advance(Hour);
        Assert.That(store.Count("a", Hour), Is.EqualTo(0), "event exactly at T-W is excluded");
        store.Record("a", clock.Now, 1m, "US");
        Assert.That(store.Count("a", Hour), Is.EqualTo(1), "event at T is included");
        Assert.That(store.Count("a", Hour + TimeSpan.FromTicks(1)), Is.EqualTo(2));
    }

    /** @id TEST-VEL-003 @verifies REQ-VEL-003 */
    [Test]
    public void TEST_VEL_003_expired_events_leave_the_window()
    {
        var (clock, store) = Make();
        for (int i = 0; i < 4; i++) { store.Record("a", clock.Now, 1m, "US"); clock.Advance(TimeSpan.FromMinutes(20)); }
        Assert.That(store.Count("a", Hour), Is.EqualTo(2));
        clock.Advance(TimeSpan.FromMinutes(20));
        Assert.That(store.Count("a", Hour), Is.EqualTo(1));
        clock.Advance(TimeSpan.FromHours(3));
        Assert.That(store.Count("a", Hour), Is.EqualTo(0));
    }

    /** @id TEST-VEL-004 @verifies REQ-VEL-004 */
    [Test]
    public void TEST_VEL_004_keys_are_isolated()
    {
        var (_, store) = Make();
        store.Record("a", T0, 5m, "US");
        store.Record("a", T0, 5m, "FR");
        store.Record("b", T0, 7m, "JP");
        Assert.That(store.Count("a", Hour), Is.EqualTo(2));
        Assert.That(store.Count("b", Hour), Is.EqualTo(1));
        Assert.That(store.Sum("b", Hour), Is.EqualTo(7m));
        Assert.That(store.Distinct("b", Hour), Is.EqualTo(1));
        Assert.That(store.Count("zzz", Hour), Is.EqualTo(0));
    }

    /** @id TEST-VEL-005 @verifies REQ-VEL-005 */
    [Test]
    public void TEST_VEL_005_sum_is_exact_decimal_within_window()
    {
        var (clock, store) = Make();
        store.Record("a", T0, 0.1m, "US");
        clock.Advance(TimeSpan.FromMinutes(30));
        store.Record("a", clock.Now, 0.2m, "US");
        store.Record("a", clock.Now, 100.05m, "US");
        Assert.That(store.Sum("a", Hour), Is.EqualTo(100.35m));
        clock.Advance(TimeSpan.FromMinutes(31));
        Assert.That(store.Sum("a", Hour), Is.EqualTo(100.25m));
        Assert.That(store.Sum("none", Hour), Is.EqualTo(0m));
    }

    /** @id TEST-VEL-006 @verifies REQ-VEL-006 */
    [Test]
    public void TEST_VEL_006_distinct_forgets_fully_expired_values()
    {
        var (clock, store) = Make();
        store.Record("a", T0, 1m, "US");
        store.Record("a", T0.AddMinutes(10), 1m, "US");
        store.Record("a", T0.AddMinutes(20), 1m, "FR");
        clock.Advance(TimeSpan.FromMinutes(30));
        Assert.That(store.Distinct("a", Hour), Is.EqualTo(2));
        clock.Advance(TimeSpan.FromMinutes(45));
        Assert.That(store.Distinct("a", Hour), Is.EqualTo(1), "US occurrences at +0/+10 expired, FR at +20 alive");
        clock.Advance(TimeSpan.FromMinutes(30));
        Assert.That(store.Distinct("a", Hour), Is.EqualTo(0));
    }

    /** @id TEST-VEL-007 @verifies REQ-VEL-007 */
    [Test]
    public void TEST_VEL_007_out_of_order_inside_max_window_counts_older_is_dropped()
    {
        var (clock, store) = Make();
        clock.Advance(TimeSpan.FromHours(30));
        store.Record("a", clock.Now, 1m, "US");
        store.Record("a", clock.Now.AddMinutes(-10), 2m, "US");
        store.Record("a", clock.Now.AddHours(-25), 4m, "US");
        Assert.That(store.Count("a", TimeSpan.FromHours(24)), Is.EqualTo(2));
        Assert.That(store.Sum("a", TimeSpan.FromHours(24)), Is.EqualTo(3m));
        Assert.That(store.Count("a", Hour), Is.EqualTo(2));
    }

    /** @id TEST-VEL-008 @verifies REQ-VEL-008 */
    [Test]
    public void TEST_VEL_008_capacity_drops_oldest_and_flags_overflow()
    {
        var (clock, store) = Make(capacity: 3);
        for (int i = 1; i <= 3; i++) { store.Record("a", clock.Now, i, "US"); clock.Advance(TimeSpan.FromSeconds(1)); }
        Assert.That(store.Overflowed("a"), Is.False);
        store.Record("a", clock.Now, 10m, "US");
        Assert.That(store.Overflowed("a"), Is.True);
        Assert.That(store.Count("a", Hour), Is.EqualTo(3));
        Assert.That(store.Sum("a", Hour), Is.EqualTo(15m), "amount 1 was dropped");
        Assert.That(store.Overflowed("b"), Is.False);
    }

    /** @id TEST-VEL-009 @verifies REQ-VEL-009 */
    [Test]
    public void TEST_VEL_009_reset_clears_key_state_and_flag()
    {
        var (clock, store) = Make(capacity: 1);
        store.Record("a", clock.Now, 1m, "US");
        store.Record("a", clock.Now, 1m, "US");
        store.Record("b", clock.Now, 1m, "US");
        Assert.That(store.Overflowed("a"), Is.True);
        store.Reset("a");
        Assert.That(store.Count("a", Hour), Is.EqualTo(0));
        Assert.That(store.Overflowed("a"), Is.False);
        Assert.That(store.Count("b", Hour), Is.EqualTo(1));
    }
}
