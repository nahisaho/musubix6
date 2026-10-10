namespace ParserKit;

public readonly record struct Unit;

public static partial class P
{
    internal static ParseResult<T> Ok<T>(T v, int next) => new() { Ok = true, Value = v, Next = next };
    internal static ParseResult<T> Err<T>(Failure f) => new() { Ok = false, Error = f };
    internal static Failure At(int offset, params string[] expected) =>
        new(offset, expected.Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray());

    /** @id CODE-CMB-001 @implements REQ-CMB-001 */
    public static Parser<T> Pure<T>(T v) => new((s, o) => Ok(v, o));
    public static Parser<T> Fail<T>(string message) =>
        new((s, o) => Err<T>(new Failure(o, Array.Empty<string>(), false, message)));

    /** @id CODE-CMB-002 @implements REQ-CMB-002 */
    public static Parser<char> Satisfy(Func<char, bool> pred, string name) =>
        new((s, o) => o < s.Length && pred(s.Text[o]) ? Ok(s.Text[o], o + 1) : Err<char>(At(o, name)));

    public static Parser<char> Char(char c) => Satisfy(x => x == c, $"'{c}'");

    /** @id CODE-CMB-003 @implements REQ-CMB-003 */
    public static Parser<string> Str(string lit) =>
        new((s, o) => string.CompareOrdinal(s.Text, o, lit, 0, lit.Length) == 0 && o + lit.Length <= s.Length
            ? Ok(lit, o + lit.Length)
            : Err<string>(At(o, $"\"{lit}\"")));

    /** @id CODE-CMB-004 @implements REQ-CMB-012 */
    public static Parser<T> Lazy<T>(Func<Parser<T>> factory)
    {
        Parser<T>? cached = null;
        return new((s, o) => (cached ??= factory()).Parse(s, o));
    }
}

public static class ParserExt
{
    /** @id CODE-CMB-005 @implements REQ-CMB-004 */
    public static Parser<U> Map<T, U>(this Parser<T> p, Func<T, U> f) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        return r.Ok
            ? new ParseResult<U> { Ok = true, Value = f(r.Value!), Next = r.Next, Committed = r.Committed, Hint = r.Hint }
            : P.Err<U>(r.Error!);
    });

    public static Parser<U> Select<T, U>(this Parser<T> p, Func<T, U> f) => p.Map(f);

    /** @id CODE-CMB-006 @implements REQ-CMB-005 */
    public static Parser<U> Bind<T, U>(this Parser<T> p, Func<T, Parser<U>> f) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        if (!r.Ok) return P.Err<U>(r.Error!);
        var r2 = f(r.Value!).Parse(s, r.Next);
        if (r2.Ok)
            return new ParseResult<U> { Ok = true, Value = r2.Value, Next = r2.Next, Committed = r.Committed || r2.Committed, Hint = Failure.MergeOpt(r.Hint, r2.Hint) };
        var err = Failure.MergeOpt(r.Hint, r2.Error)!;
        return P.Err<U>(r.Committed ? err with { Committed = true } : err);
    });

    public static Parser<V> SelectMany<T, U, V>(this Parser<T> p, Func<T, Parser<U>> f, Func<T, U, V> g) =>
        p.Bind(a => f(a).Map(b => g(a, b)));

    /** @id CODE-CMB-007 @implements REQ-CMB-006 */
    public static Parser<(T, U)> Then<T, U>(this Parser<T> p, Parser<U> q) => p.Bind(a => q.Map(b => (a, b)));
    public static Parser<T> Left<T, U>(this Parser<T> p, Parser<U> q) => p.Bind(a => q.Map(_ => a));
    public static Parser<U> Right<T, U>(this Parser<T> p, Parser<U> q) => p.Bind(_ => q);

    /** @id CODE-CMB-008 @implements REQ-CMB-007 */
    public static Parser<T> Or<T>(this Parser<T> p, Parser<T> q) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        if (r.Ok || r.Error!.Committed) return r;
        var r2 = q.Parse(s, o);
        if (r2.Ok) return new ParseResult<T> { Ok = true, Value = r2.Value, Next = r2.Next, Committed = r2.Committed, Hint = Failure.MergeOpt(r.Error, r2.Hint) };
        return P.Err<T>(Failure.Merge(r.Error!, r2.Error!));
    });

    /** @id CODE-CMB-009 @implements REQ-CMB-008 REQ-CMB-009 */
    public static Parser<List<T>> Many<T>(this Parser<T> p) => new((s, o) =>
    {
        var items = new List<T>();
        int at = o;
        bool committed = false;
        while (true)
        {
            var r = p.Parse(s, at);
            if (!r.Ok)
            {
                if (r.Error!.Committed) return P.Err<List<T>>(r.Error);
                return new ParseResult<List<T>> { Ok = true, Value = items, Next = at, Committed = committed, Hint = r.Error };
            }
            if (r.Next == at) throw new InvalidOperationException("Many: item parser succeeded without consuming input");
            committed |= r.Committed;
            items.Add(r.Value!);
            at = r.Next;
        }
    });

    public static Parser<List<T>> Many1<T>(this Parser<T> p) =>
        p.Bind(first => p.Many().Map(rest => { rest.Insert(0, first); return rest; }));

    public static Parser<List<T>> SepBy<T, S>(this Parser<T> p, Parser<S> sep) =>
        p.Bind(first => sep.Right(p).Many().Map(rest => { rest.Insert(0, first); return rest; })).Or(P.Pure(new List<T>()));

    /** @id CODE-CMB-010 @implements REQ-CMB-010 */
    public static Parser<T> Opt<T>(this Parser<T> p, T fallback) => p.Or(P.Pure(fallback));

    public static Parser<T> Between<T, L, R>(this Parser<T> p, Parser<L> l, Parser<R> r) => l.Right(p).Left(r);

    /** @id CODE-CMB-011 @implements REQ-CMB-013 */
    public static Parser<T> Peek<T>(this Parser<T> p) => new((s, o) =>
    {
        var r = p.Parse(s, o);
        return r.Ok ? P.Ok(r.Value!, o) : r;
    });

    public static Parser<Unit> NotFollowedBy<T>(this Parser<T> p) => new((s, o) =>
        p.Parse(s, o).Ok ? P.Err<Unit>(P.At(o, "not " + typeof(T).Name)) : P.Ok(default(Unit), o));

    /** @id CODE-CMB-012 @implements REQ-CMB-011 */
    public static ParseResult<T> ParseAll<T>(this Parser<T> p, string text)
    {
        var src = new Source(text);
        var r = p.Parse(src, 0);
        if (!r.Ok || r.Next == src.Length) return r;
        return P.Err<T>(P.At(r.Next, "end of input"));
    }
}
