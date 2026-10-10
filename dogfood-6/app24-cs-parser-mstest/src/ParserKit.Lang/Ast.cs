namespace ParserKit.Lang;

public readonly record struct Span(int Start, int End);

public abstract record Expr(Span Span);
public sealed record Num(double Value, Span Span) : Expr(Span);
public sealed record Str(string Value, Span Span) : Expr(Span);
public sealed record Bool(bool Value, Span Span) : Expr(Span);
public sealed record Var(string Name, Span Span) : Expr(Span);
public sealed record Group(Expr Inner, Span Span) : Expr(Span);
public sealed record Unary(string Op, Expr Operand, Span Span) : Expr(Span);
public sealed record Binary(string Op, Expr Left, Expr Right, Span Span) : Expr(Span);
public sealed record If(Expr Cond, Expr Then, Expr Else, Span Span) : Expr(Span);
public sealed record Let(string Name, Expr Value, Expr Body, bool Rec, Span Span) : Expr(Span);
public sealed record Lambda(IReadOnlyList<string> Params, Expr Body, Span Span) : Expr(Span);
public sealed record Call(Expr Fn, IReadOnlyList<Expr> Args, Span Span) : Expr(Span);
