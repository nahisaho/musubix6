namespace ParserKit;

public enum Assoc { Left, Right, None }

public sealed class ExprBuilder<T>
{
    private sealed record Infixer(int Prec, Assoc Assoc, Parser<Func<T, T, T>> Op);
    private sealed record Unary(int Prec, Parser<Func<T, T>> Op);

    private readonly Parser<T> _atom;
    private readonly List<Infixer> _infix = new();
    private readonly List<Unary> _prefix = new();
    private readonly List<Unary> _postfix = new();

    public ExprBuilder(Parser<T> atom) => _atom = atom;

    public ExprBuilder<T> Infix(int prec, Assoc assoc, Parser<Func<T, T, T>> op) { _infix.Add(new Infixer(prec, assoc, op)); return this; }
    public ExprBuilder<T> Prefix(int prec, Parser<Func<T, T>> op) { _prefix.Add(new Unary(prec, op)); return this; }
    public ExprBuilder<T> Postfix(int prec, Parser<Func<T, T>> op) { _postfix.Add(new Unary(prec, op)); return this; }

    /** @id CODE-PRT-001 @implements REQ-PRT-008 */
    public Parser<T> Build()
    {
        foreach (var g in _infix.GroupBy(i => i.Prec))
            if (g.Select(i => i.Assoc).Distinct().Count() > 1)
                throw new InvalidOperationException($"precedence level {g.Key} mixes associativities");
        var infix = _infix.ToArray();
        var prefix = _prefix.ToArray();
        var postfix = _postfix.ToArray();
        return new((s, o) => ParseExpr(s, o, int.MinValue, infix, prefix, postfix));
    }

    /** @id CODE-PRT-002 @implements REQ-PRT-001 REQ-PRT-002 REQ-PRT-003 REQ-PRT-004 REQ-PRT-005 REQ-PRT-006 REQ-PRT-007 */
    private ParseResult<T> ParseExpr(Source s, int o, int minPrec, Infixer[] infix, Unary[] prefix, Unary[] postfix)
    {
        ParseResult<T> left = default;
        bool started = false;
        foreach (var pre in prefix)
        {
            var pr = pre.Op.Parse(s, o);
            if (!pr.Ok) continue;
            var operand = ParseExpr(s, pr.Next, pre.Prec, infix, prefix, postfix);
            if (!operand.Ok) return operand;
            left = P.Ok(pr.Value!(operand.Value!), operand.Next);
            started = true;
            break;
        }
        if (!started)
        {
            left = _atom.Parse(s, o);
            if (!left.Ok) return left;
        }
        while (true)
        {
            bool progressed = false;
            foreach (var post in postfix)
            {
                if (post.Prec < minPrec) continue;
                var pr = post.Op.Parse(s, left.Next);
                if (!pr.Ok) continue;
                left = P.Ok(pr.Value!(left.Value!), pr.Next);
                progressed = true;
                break;
            }
            if (progressed) continue;
            foreach (var inf in infix)
            {
                if (inf.Prec < minPrec) continue;
                var opr = inf.Op.Parse(s, left.Next);
                if (!opr.Ok) continue;
                int rhsMin = inf.Assoc == Assoc.Right ? inf.Prec : inf.Prec + 1;
                var rhs = ParseExpr(s, opr.Next, rhsMin, infix, prefix, postfix);
                if (!rhs.Ok) return P.Err<T>(rhs.Error! with { Committed = true });
                left = P.Ok(opr.Value!(left.Value!, rhs.Value!), rhs.Next);
                if (inf.Assoc == Assoc.None)
                {
                    foreach (var again in infix.Where(i => i.Prec == inf.Prec))
                    {
                        var chained = again.Op.Parse(s, left.Next);
                        if (chained.Ok)
                            return P.Err<T>(new Failure(left.Next, Array.Empty<string>(), true, "non-associative operator cannot be chained"));
                    }
                }
                progressed = true;
                break;
            }
            if (!progressed) return left;
        }
    }
}
