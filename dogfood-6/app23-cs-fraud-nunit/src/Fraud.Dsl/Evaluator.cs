namespace Fraud.Dsl;

public static class Evaluator
{
    /** @id CODE-DSL-007 @implements REQ-DSL-007 REQ-DSL-008 REQ-DSL-009 REQ-DSL-010 REQ-DSL-012 */
    public static object? Eval(Expr e, IReadOnlyDictionary<string, object?> ctx, Func<string, object?[], object?>? fn)
    {
        switch (e)
        {
            case Num n: return n.Value;
            case Str s: return s.Value;
            case Dur d: return d.Value;
            case NullLit: return null;
            case Field f: return ctx.TryGetValue(f.Name, out var v) ? Normalize(v) : null;
            case Unary u: return !Truthy(Eval(u.Operand, ctx, fn));
            case InList l:
                var subject = Eval(l.Subject, ctx, fn);
                if (subject is null) return false;
                return l.Items.Any(i => Equal(subject, Eval(i, ctx, fn)));
            case Call c:
                var args = c.Args.Select(a => Eval(a, ctx, fn)).ToArray();
                if (fn is null) throw new EvalException($"unknown function {c.Name}");
                return Normalize(fn(c.Name, args));
            case Binary b: return EvalBinary(b, ctx, fn);
            default: throw new EvalException("unsupported expression " + e.GetType().Name);
        }
    }

    static object? EvalBinary(Binary b, IReadOnlyDictionary<string, object?> ctx, Func<string, object?[], object?>? fn)
    {
        if (b.Op == "and") return Truthy(Eval(b.Left, ctx, fn)) && Truthy(Eval(b.Right, ctx, fn));
        if (b.Op == "or") return Truthy(Eval(b.Left, ctx, fn)) || Truthy(Eval(b.Right, ctx, fn));
        var l = Eval(b.Left, ctx, fn);
        var r = Eval(b.Right, ctx, fn);
        switch (b.Op)
        {
            case "==": return Equal(l, r);
            case "!=": return !Equal(l, r);
            case ">": case ">=": case "<": case "<=":
                if (l is null || r is null) return false;
                var cmp = Compare(l, r);
                return b.Op switch { ">" => cmp > 0, ">=" => cmp >= 0, "<" => cmp < 0, _ => cmp <= 0 };
            default:
                if (l is TimeSpan || r is TimeSpan) return DurationOp(b.Op, l, r);
                if (l is not decimal x || r is not decimal y) throw new EvalException($"operator {b.Op} needs numbers");
                return Arith(b.Op, x, y);
        }
    }

    static decimal Arith(string op, decimal x, decimal y) => op switch
    {
        "+" => x + y,
        "-" => x - y,
        "*" => x * y,
        _ => y == 0m ? throw new EvalException("division by zero") : x / y,
    };

    /** @id CODE-DSL-013 @implements REQ-DSL-013 */
    static object DurationOp(string op, object? l, object? r) => (op, l, r) switch
    {
        ("+", TimeSpan a, TimeSpan b) => a + b,
        ("-", TimeSpan a, TimeSpan b) => a - b,
        ("*", TimeSpan a, decimal n) => TimeSpan.FromTicks((long)(a.Ticks * n)),
        ("*", decimal n, TimeSpan a) => TimeSpan.FromTicks((long)(a.Ticks * n)),
        _ => throw new EvalException($"operator {op} cannot combine these duration operands"),
    };

    static bool Truthy(object? v) => v switch { null => false, bool b => b, _ => throw new EvalException("expected a boolean") };

    static object? Normalize(object? v) => v switch { int i => (decimal)i, long l => (decimal)l, double d => (decimal)d, float f => (decimal)f, _ => v };

    static bool Equal(object? l, object? r)
    {
        if (l is null || r is null) return l is null && r is null;
        if (l.GetType() != r.GetType()) return false;
        return l is string a ? string.Equals(a, (string)r, StringComparison.Ordinal) : l.Equals(r);
    }

    static int Compare(object l, object r) => (l, r) switch
    {
        (decimal a, decimal b) => a.CompareTo(b),
        (TimeSpan a, TimeSpan b) => a.CompareTo(b),
        (string a, string b) => string.CompareOrdinal(a, b),
        _ => throw new EvalException("cannot order values of different types"),
    };
}
