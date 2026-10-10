using System.Globalization;

namespace Fraud.Dsl;

public enum TokenKind { Number, Ident, String, Op, Keyword, Duration, Eof }

public record Token(TokenKind Kind, string Text, int Line, int Col);

public class DslException : Exception
{
    public int Line { get; }
    public int Col { get; }
    public DslException(string message, int line = 0, int col = 0) : base(message) { Line = line; Col = col; }
}

public class EvalException : Exception
{
    public EvalException(string message) : base(message) { }
}

public abstract record Expr
{
    public abstract string Show();
}

public record Num(decimal Value) : Expr
{
    public override string Show() => Value.ToString(CultureInfo.InvariantCulture);
}

public record Str(string Value) : Expr
{
    public override string Show() => "\"" + Value + "\"";
}

public record Dur(TimeSpan Value, string Text) : Expr
{
    public override string Show() => Text;
}

public record NullLit : Expr
{
    public override string Show() => "null";
}

public record Field(string Name) : Expr
{
    public override string Show() => Name;
}

public record Unary(string Op, Expr Operand) : Expr
{
    public override string Show() => $"({Op} {Operand.Show()})";
}

public record Binary(string Op, Expr Left, Expr Right) : Expr
{
    public override string Show() => $"({Op} {Left.Show()} {Right.Show()})";
}

public record InList(Expr Subject, IReadOnlyList<Expr> Items) : Expr
{
    public override string Show() => $"(in {Subject.Show()} [{string.Join(" ", Items.Select(i => i.Show()))}])";
}

public record Call(string Name, IReadOnlyList<Expr> Args) : Expr
{
    public override string Show() => $"(call {Name}{string.Concat(Args.Select(a => " " + a.Show()))})";
}

public record Rule(string Name, int Weight, Expr When);
