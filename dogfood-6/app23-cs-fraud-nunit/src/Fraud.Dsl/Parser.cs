using System.Globalization;

namespace Fraud.Dsl;

public static class Parser
{
    sealed class Cursor
    {
        readonly IReadOnlyList<Token> _t;
        int _p;
        public Cursor(IReadOnlyList<Token> t) { _t = t; }
        public Token Peek => _t[_p];
        public Token Next() => _t[_p < _t.Count - 1 ? _p++ : _p];
        public bool IsOp(string s) => Peek.Kind == TokenKind.Op && Peek.Text == s;
        public bool IsKw(string s) => Peek.Kind == TokenKind.Keyword && Peek.Text == s;
        public Token Fail(string msg) => throw new DslException(msg, Peek.Line, Peek.Col);
        public void ExpectOp(string s) { if (!IsOp(s)) Fail($"expected '{s}' but found '{Peek.Text}'"); Next(); }
        public void ExpectKw(string s) { if (!IsKw(s)) Fail($"expected '{s}' but found '{Peek.Text}'"); Next(); }
    }

    /** @id CODE-DSL-003 @implements REQ-DSL-003 REQ-DSL-004 */
    public static Expr ParseExpr(string src)
    {
        var c = new Cursor(Lexer.Tokenize(src));
        var e = Or(c);
        if (c.Peek.Kind != TokenKind.Eof) c.Fail($"unexpected '{c.Peek.Text}'");
        return e;
    }

    /** @id CODE-DSL-005 @implements REQ-DSL-005 REQ-DSL-006 */
    public static IReadOnlyList<Rule> ParseRules(string src)
    {
        var c = new Cursor(Lexer.Tokenize(src));
        var rules = new List<Rule>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (c.Peek.Kind != TokenKind.Eof)
        {
            c.ExpectKw("rule");
            var name = c.Peek;
            if (name.Kind != TokenKind.Ident) c.Fail("expected rule name");
            c.Next();
            if (!seen.Add(name.Text)) throw new DslException($"duplicate rule name '{name.Text}'", name.Line, name.Col);
            c.ExpectKw("weight");
            var neg = c.IsOp("-");
            if (neg) c.Next();
            var w = c.Peek;
            if (w.Kind != TokenKind.Number || w.Text.Contains('.')) c.Fail("weight must be an integer");
            c.Next();
            c.ExpectKw("when");
            var weight = int.Parse(w.Text, CultureInfo.InvariantCulture) * (neg ? -1 : 1);
            rules.Add(new Rule(name.Text, weight, Or(c)));
        }
        return rules;
    }

    static Expr Or(Cursor c)
    {
        var l = And(c);
        while (c.IsKw("or")) { c.Next(); l = new Binary("or", l, And(c)); }
        return l;
    }

    static Expr And(Cursor c)
    {
        var l = Not(c);
        while (c.IsKw("and")) { c.Next(); l = new Binary("and", l, Not(c)); }
        return l;
    }

    static Expr Not(Cursor c)
    {
        if (c.IsKw("not")) { c.Next(); return new Unary("not", Not(c)); }
        return Cmp(c);
    }

    static readonly HashSet<string> CmpOps = new() { ">", ">=", "<", "<=", "==", "!=" };

    static Expr Cmp(Cursor c)
    {
        var l = Add(c);
        if (c.Peek.Kind == TokenKind.Op && CmpOps.Contains(c.Peek.Text)) { var op = c.Next().Text; return new Binary(op, l, Add(c)); }
        if (c.IsKw("in"))
        {
            c.Next();
            c.ExpectOp("[");
            var items = new List<Expr>();
            if (!c.IsOp("]"))
            {
                items.Add(Add(c));
                while (c.IsOp(",")) { c.Next(); items.Add(Add(c)); }
            }
            c.ExpectOp("]");
            return new InList(l, items);
        }
        return l;
    }

    static Expr Add(Cursor c)
    {
        var l = Mul(c);
        while (c.IsOp("+") || c.IsOp("-")) { var op = c.Next().Text; l = new Binary(op, l, Mul(c)); }
        return l;
    }

    static Expr Mul(Cursor c)
    {
        var l = Primary(c);
        while (c.IsOp("*") || c.IsOp("/")) { var op = c.Next().Text; l = new Binary(op, l, Primary(c)); }
        return l;
    }

    static Expr Primary(Cursor c)
    {
        var t = c.Peek;
        switch (t.Kind)
        {
            case TokenKind.Number:
                c.Next();
                return new Num(decimal.Parse(t.Text, CultureInfo.InvariantCulture));
            case TokenKind.String:
                c.Next();
                return new Str(t.Text);
            case TokenKind.Duration:
                c.Next();
                var n = double.Parse(t.Text[..^1], CultureInfo.InvariantCulture);
                return new Dur(t.Text[^1] switch { 's' => TimeSpan.FromSeconds(n), 'm' => TimeSpan.FromMinutes(n), 'h' => TimeSpan.FromHours(n), _ => TimeSpan.FromDays(n) }, t.Text);
            case TokenKind.Keyword when t.Text == "null":
                c.Next();
                return new NullLit();
            case TokenKind.Ident:
                c.Next();
                if (!c.IsOp("(")) return new Field(t.Text);
                c.Next();
                var args = new List<Expr>();
                if (!c.IsOp(")"))
                {
                    args.Add(Or(c));
                    while (c.IsOp(",")) { c.Next(); args.Add(Or(c)); }
                }
                c.ExpectOp(")");
                return new Call(t.Text, args);
            case TokenKind.Op when t.Text == "(":
                c.Next();
                var e = Or(c);
                c.ExpectOp(")");
                return e;
            case TokenKind.Op when t.Text == "-" :
                c.Next();
                if (c.Peek.Kind != TokenKind.Number) c.Fail("'-' is only allowed before a number literal");
                return new Num(-decimal.Parse(c.Next().Text, CultureInfo.InvariantCulture));
            default:
                c.Fail(t.Kind == TokenKind.Eof ? "unexpected end of input" : $"unexpected '{t.Text}'");
                return null!;
        }
    }
}
