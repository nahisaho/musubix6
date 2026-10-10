using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Fraud.Core;

namespace Fraud.Audit;

public static class AuditHasher
{
    /** @id CODE-AUD-002 @implements REQ-AUD-002 REQ-AUD-003 */
    public static string Canonical(long seq, DateTimeOffset time, string actor, string action, string subject, string detail, string prev)
    {
        var sb = new StringBuilder();
        foreach (var f in new[] { seq.ToString(CultureInfo.InvariantCulture), time.ToString("O", CultureInfo.InvariantCulture), actor, action, subject, detail, prev })
            sb.Append(Encoding.UTF8.GetByteCount(f)).Append(':').Append(f).Append(';');
        return sb.ToString();
    }

    public static string Compute(long seq, DateTimeOffset time, string actor, string action, string subject, string detail, string prev) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(seq, time, actor, action, subject, detail, prev)))).ToLowerInvariant();
}

public static class AuditCodec
{
    /** @id CODE-AUD-009 @implements REQ-AUD-009 */
    public static string Export(AuditTrail trail)
    {
        var sb = new StringBuilder();
        foreach (var e in trail.Entries)
            sb.Append(JsonSerializer.Serialize(new { e.Seq, Time = e.Time.ToString("O", CultureInfo.InvariantCulture), e.Actor, e.Action, e.Subject, e.Detail, e.PrevHash, e.Hash })).Append('\n');
        return sb.ToString();
    }

    public static AuditTrail Import(string text, IClock clock)
    {
        var list = new List<AuditEntry>();
        foreach (var line in text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var r = doc.RootElement;
                string S(string n) => r.GetProperty(n).GetString() ?? throw new FormatException($"null {n}");
                list.Add(new AuditEntry(r.GetProperty("Seq").GetInt64(), DateTimeOffset.Parse(S("Time"), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    S("Actor"), S("Action"), S("Subject"), S("Detail"), S("PrevHash"), S("Hash")));
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
            {
                throw new FormatException($"malformed audit line: {line}", ex);
            }
        }
        return AuditTrail.FromEntries(clock, list);
    }
}
