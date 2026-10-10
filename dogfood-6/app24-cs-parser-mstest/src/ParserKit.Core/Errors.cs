namespace ParserKit;

public sealed partial record Failure
{
    /** @id CODE-ERR-001 @implements REQ-ERR-001 */
    public static Failure Merge(Failure a, Failure b)
    {
        int max = Math.Max(a.Offset, b.Offset);
        var top = new[] { a, b }.Where(f => f.Offset == max).ToArray();
        var expected = top.SelectMany(f => f.Expected).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();
        return new Failure(max, expected, top.Any(f => f.Committed), top.Select(f => f.Message).FirstOrDefault(m => m != null));
    }

    internal static Failure? MergeOpt(Failure? a, Failure? b) => a == null ? b : b == null ? a : Merge(a, b);

    /** @id CODE-ERR-002 @implements REQ-ERR-006 */
    public string Describe(Source s)
    {
        var pos = s.PosAt(Offset);
        var head = $"line {pos.Line}, col {pos.Col}: ";
        if (Message != null) return head + Message;
        var found = Offset >= s.Length ? "end of input" : $"'{Escape(s.Text[Offset])}'";
        if (Expected.Count == 0) return head + $"unexpected {found}";
        string list = Expected.Count == 1 ? Expected[0]
            : string.Join(", ", Expected.Take(Expected.Count - 1)) + " or " + Expected[^1];
        return head + $"expected {list} but found {found}";
    }

    private static string Escape(char c) => c switch { '\n' => "\\n", '\t' => "\\t", '\r' => "\\r", _ => c.ToString() };
}

public static class ErrorExt
{
    /** @id CODE-ERR-003 @implements REQ-ERR-002 */
    public static Parser<T> Label<T>(this Parser<T> p, string name) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        return !r.Ok && r.Error!.Offset == o ? P.Err<T>(r.Error with { Expected = new[] { name }, Message = null }) : r;
    });

    /** @id CODE-ERR-004 @implements REQ-ERR-004 */
    public static Parser<T> Atomic<T>(this Parser<T> p) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        return r.Ok ? r with { Committed = false } : P.Err<T>(r.Error! with { Committed = false });
    });
}

public static partial class P
{
    /** @id CODE-ERR-005 @implements REQ-ERR-003 REQ-ERR-005 */
    public static Parser<Unit> Cut() => new((s, o) => new ParseResult<Unit> { Ok = true, Next = o, Committed = true });
}
