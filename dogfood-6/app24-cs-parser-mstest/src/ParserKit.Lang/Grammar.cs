using System.Globalization;
using System.Text;

namespace ParserKit.Lang;

public static class Grammar
{
    private static readonly HashSet<string> Reserved = new() { "let", "rec", "in", "fn", "if", "then", "else", "true", "false" };

    private static ParseResult<T> Done<T>(T v, int next) => new() { Ok = true, Value = v, Next = next };
    private static ParseResult<T> Fail<T>(int o, string? message = null, bool committed = false, params string[] expected) =>
        new() { Ok = false, Error = new Failure(o, expected, committed, message) };

    private static readonly Parser<int> Offset = new((s, o) => Done(o, o));

    /** @id CODE-LNG-001 @implements REQ-LNG-004 REQ-LNG-010 */
    private static readonly Parser<Unit> Ws = new((s, o) =>
    {
        var t = s.Text;
        int i = o;
        while (i < t.Length)
        {
            if (char.IsWhiteSpace(t[i])) i++;
            else if (t[i] == '#') { while (i < t.Length && t[i] != '\n') i++; }
            else break;
        }
        return Done(default(Unit), i);
    });

    private static Parser<(T V, Span S)> Lex<T>(Parser<T> p) =>
        Offset.Bind(a => p.Bind(v => Offset.Bind(b => Ws.Map(_ => (v, new Span(a, b))))));

    private static Parser<Span> Sym(string text) => Lex(P.Str(text)).Map(t => t.S);

    private static bool IdentChar(char c) => char.IsLetterOrDigit(c) || c == '_';

    private static Parser<Span> Kw(string word) => Lex(new Parser<string>((s, o) =>
        string.CompareOrdinal(s.Text, o, word, 0, word.Length) == 0 && o + word.Length <= s.Length && (o + word.Length == s.Length || !IdentChar(s.Text[o + word.Length]))
            ? Done(word, o + word.Length)
            : Fail<string>(o, null, false, $"\"{word}\""))).Map(t => t.S);

    /** @id CODE-LNG-002 @implements REQ-LNG-003 */
    private static readonly Parser<(string V, Span S)> Ident = Lex(new Parser<string>((s, o) =>
    {
        int i = o;
        if (i < s.Length && (char.IsLetter(s.Text[i]) || s.Text[i] == '_'))
        {
            while (i < s.Length && IdentChar(s.Text[i])) i++;
            var name = s.Text.Substring(o, i - o);
            if (!Reserved.Contains(name)) return Done(name, i);
        }
        return Fail<string>(o, null, false, "identifier");
    }));

    /** @id CODE-LNG-003 @implements REQ-LNG-001 */
    private static readonly Parser<Expr> Number = Lex(
        P.Satisfy(char.IsDigit, "number").Many1().Bind(ip =>
            P.Char('.').Right(P.Satisfy(char.IsDigit, "digit").Many1()).Map(fp => new string(ip.ToArray()) + "." + new string(fp.ToArray()))
                .Opt(new string(ip.ToArray()))))
        .Map(t => (Expr)new Num(double.Parse(t.V, CultureInfo.InvariantCulture), t.S));

    /** @id CODE-LNG-004 @implements REQ-LNG-002 */
    private static readonly Parser<Expr> StringLit = Lex(new Parser<string>((s, o) =>
    {
        if (o >= s.Length || s.Text[o] != '"') return Fail<string>(o, null, false, "string");
        var sb = new StringBuilder();
        for (int i = o + 1; i < s.Length; i++)
        {
            char c = s.Text[i];
            if (c == '"') return Done(sb.ToString(), i + 1);
            if (c != '\\') { sb.Append(c); continue; }
            if (++i >= s.Length) break;
            switch (s.Text[i])
            {
                case 'n': sb.Append('\n'); break;
                case 't': sb.Append('\t'); break;
                case '"': sb.Append('"'); break;
                case '\\': sb.Append('\\'); break;
                default: return Fail<string>(i, $"invalid escape '\\{s.Text[i]}'", true);
            }
        }
        return Fail<string>(o, "unterminated string", true);
    })).Map(t => (Expr)new Str(t.V, t.S));

    private static Parser<Func<Expr, Expr, Expr>> Bin(string op) =>
        P.Str(op).Left(Ws).Map(_ => (Func<Expr, Expr, Expr>)((a, b) => new Binary(op, a, b, new Span(a.Span.Start, b.Span.End))));

    private static Parser<Func<Expr, Expr>> Pre(string op) =>
        Offset.Bind(start => P.Str(op).Left(Ws).Map(_ => (Func<Expr, Expr>)(e => new Unary(op, e, new Span(start, e.Span.End)))));

    private static readonly Parser<Expr> ExprP = Build();

    /** @id CODE-LNG-005 @implements REQ-LNG-005 REQ-LNG-006 REQ-LNG-007 REQ-LNG-008 REQ-LNG-009 */
    private static Parser<Expr> Atom()
    {
        var boolean = Kw("true").Map(sp => (Expr)new Bool(true, sp)).Or(Kw("false").Map(sp => (Expr)new Bool(false, sp)));
        var variable = Ident.Map(t => (Expr)new Var(t.V, t.S));
        var group = Sym("(").Bind(open => P.Lazy(() => ExprP).Bind(inner => Sym(")").Map(close => (Expr)new Group(inner, new Span(open.Start, close.End)))));
        var lambda = Kw("fn").Bind(kw =>
            Sym("(").Right(Ident.Map(t => t.V).SepBy(Sym(","))).Left(Sym(")")).Left(Sym("=>"))
                .Bind(ps => P.Lazy(() => ExprP).Map(body => (Expr)new Lambda(ps, body, new Span(kw.Start, body.Span.End)))));
        var let = Kw("let").Bind(kw =>
            Kw("rec").Map(_ => true).Opt(false).Bind(rec =>
                Ident.Bind(name => Sym("=").Right(P.Lazy(() => ExprP)).Bind(value =>
                    Kw("in").Right(P.Lazy(() => ExprP)).Map(body => (Expr)new Let(name.V, value, body, rec, new Span(kw.Start, body.Span.End)))))));
        var cond = Kw("if").Bind(kw =>
            P.Lazy(() => ExprP).Bind(c => Kw("then").Right(P.Lazy(() => ExprP)).Bind(t =>
                Kw("else").Right(P.Lazy(() => ExprP)).Map(e => (Expr)new If(c, t, e, new Span(kw.Start, e.Span.End))))));
        return Number.Or(StringLit).Or(boolean).Or(lambda).Or(let).Or(cond).Or(variable).Or(group);
    }

    private static Parser<Expr> Build()
    {
        var atom = Atom();
        var args = Sym("(").Right(P.Lazy(() => ExprP).SepBy(Sym(","))).Then(Sym(")"));
        var primary = atom.Bind(fn => args.Many().Map(calls =>
        {
            Expr cur = fn;
            foreach (var (a, close) in calls) cur = new Call(cur, a, new Span(cur.Span.Start, close.End));
            return cur;
        }));
        var b = new ExprBuilder<Expr>(primary);
        b.Infix(1, Assoc.Left, Bin("||")).Infix(2, Assoc.Left, Bin("&&"))
         .Infix(3, Assoc.None, Bin("==")).Infix(3, Assoc.None, Bin("!="))
         .Infix(4, Assoc.None, Bin("<=")).Infix(4, Assoc.None, Bin(">=")).Infix(4, Assoc.None, Bin("<")).Infix(4, Assoc.None, Bin(">"))
         .Infix(5, Assoc.Left, Bin("+")).Infix(5, Assoc.Left, Bin("-"))
         .Infix(6, Assoc.Left, Bin("*")).Infix(6, Assoc.Left, Bin("/")).Infix(6, Assoc.Left, Bin("%"))
         .Prefix(7, Pre("-")).Prefix(7, Pre("!"));
        return b.Build();
    }

    public static Parser<Expr> Expression => ExprP;

    public static ParseResult<Expr> Parse(string text) => Ws.Right(ExprP).ParseAll(text);
}
