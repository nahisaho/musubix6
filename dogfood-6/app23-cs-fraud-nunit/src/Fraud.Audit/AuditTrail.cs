using Fraud.Core;

namespace Fraud.Audit;

public class AuditTrail
{
    public const string Genesis = "0000000000000000000000000000000000000000000000000000000000000000";

    readonly IClock _clock;
    readonly List<AuditEntry> _entries = new();

    public AuditTrail(IClock clock) { _clock = clock; }

    /** @id CODE-AUD-001 @implements REQ-AUD-001 REQ-AUD-002 */
    public AuditEntry Append(string actor, string action, string subject, string detail)
    {
        var seq = _entries.Count + 1;
        var prev = _entries.Count == 0 ? Genesis : _entries[^1].Hash;
        var time = _clock.Now;
        var e = new AuditEntry(seq, time, actor, action, subject, detail, prev, AuditHasher.Compute(seq, time, actor, action, subject, detail, prev));
        _entries.Add(e);
        return e;
    }

    /** @id CODE-AUD-004 @implements REQ-AUD-004 REQ-AUD-005 REQ-AUD-006 */
    public VerifyResult Verify()
    {
        var prev = Genesis;
        for (int i = 0; i < _entries.Count; i++)
        {
            var e = _entries[i];
            var good = e.Seq == i + 1
                && e.PrevHash == prev
                && e.Hash == AuditHasher.Compute(e.Seq, e.Time, e.Actor, e.Action, e.Subject, e.Detail, e.PrevHash);
            if (!good) return new VerifyResult(false, e.Seq);
            prev = e.Hash;
        }
        return new VerifyResult(true, null);
    }

    /** @id CODE-AUD-008 @implements REQ-AUD-008 */
    public IReadOnlyList<AuditEntry> Entries => _entries.ToArray();

    public static AuditTrail FromEntries(IClock clock, IEnumerable<AuditEntry> entries)
    {
        var t = new AuditTrail(clock);
        t._entries.AddRange(entries);
        return t;
    }

    /** @id CODE-AUD-007 @implements REQ-AUD-007 */
    public IReadOnlyList<AuditEntry> ForSubject(string subject) =>
        _entries.Where(e => e.Subject == subject).OrderBy(e => e.Seq).ToArray();
}
