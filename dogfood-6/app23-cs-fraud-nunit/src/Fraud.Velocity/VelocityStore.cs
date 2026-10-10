using Fraud.Core;

namespace Fraud.Velocity;

public class VelocityStore
{
    sealed record Ev(DateTimeOffset Time, decimal Amount, string Value);

    readonly IClock _clock;
    readonly TimeSpan _maxWindow;
    readonly int _capacity;
    readonly Dictionary<string, List<Ev>> _events = new();
    readonly HashSet<string> _overflowed = new();

    public VelocityStore(IClock clock, TimeSpan maxWindow, int capacity)
    {
        _clock = clock;
        _maxWindow = maxWindow;
        _capacity = capacity;
    }

    /** @id CODE-VEL-007 @implements REQ-VEL-007 REQ-VEL-008 */
    public void Record(string key, DateTimeOffset time, decimal amount, string value)
    {
        if (time <= _clock.Now - _maxWindow) return;
        if (!_events.TryGetValue(key, out var list)) _events[key] = list = new List<Ev>();
        var ev = new Ev(time, amount, value);
        InsertSorted(list, ev);
        if (list.Count > _capacity)
        {
            list.RemoveRange(0, list.Count - _capacity);
            _overflowed.Add(key);
        }
    }

    static void InsertSorted(List<Ev> list, Ev ev)
    {
        var at = list.Count;
        while (at > 0 && list[at - 1].Time > ev.Time) at--;
        list.Insert(at, ev);
    }

    /** @id CODE-VEL-002 @implements REQ-VEL-002 REQ-VEL-003 REQ-VEL-004 */
    public int Count(string key, TimeSpan window) => InWindow(key, window).Count();

    /** @id CODE-VEL-005 @implements REQ-VEL-005 */
    public decimal Sum(string key, TimeSpan window) => InWindow(key, window).Sum(e => e.Amount);

    /** @id CODE-VEL-006 @implements REQ-VEL-006 */
    public int Distinct(string key, TimeSpan window) => InWindow(key, window).Select(e => e.Value).Distinct().Count();

    public bool Overflowed(string key) => _overflowed.Contains(key);

    /** @id CODE-VEL-009 @implements REQ-VEL-009 */
    public void Reset(string key)
    {
        _events.Remove(key);
        _overflowed.Remove(key);
    }

    IEnumerable<Ev> InWindow(string key, TimeSpan window)
    {
        if (!_events.TryGetValue(key, out var list)) return Enumerable.Empty<Ev>();
        var now = _clock.Now;
        var from = now - window;
        return list.Where(e => e.Time > from && e.Time <= now);
    }
}
