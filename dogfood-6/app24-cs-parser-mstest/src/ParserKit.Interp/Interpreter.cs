using System.Globalization;
using System.Text;
using ParserKit.Lang;

namespace ParserKit.Interp;

public abstract record Value;
public sealed record NumV(double V) : Value;
public sealed record StrV(string V) : Value;
public sealed record BoolV(bool V) : Value;
public sealed record ClosureV(Lambda Lam, Env Env) : Value;
public sealed record BuiltinV(string Name, int Arity, Func<Value[], Span, Value> Fn) : Value;

public sealed class Cell { public Value? Value { get; set; } }

public sealed class Env
{
    private readonly string _name;
    private readonly Cell _cell;
    private readonly Env? _parent;
    public Env(string name, Cell cell, Env? parent) { _name = name; _cell = cell; _parent = parent; }
    public static Env Bind(Env? parent, string name, Value v) => new(name, new Cell { Value = v }, parent);
    public static Env BindRec(Env? parent, string name, out Cell cell) { cell = new Cell(); return new Env(name, cell, parent); }
    public Cell? Lookup(string name)
    {
        for (var e = this; e != null; e = e._parent)
            if (e._name == name) return e._cell;
        return null;
    }
}

public sealed record ErrorInfo(string Kind, string Message, Pos Pos);
public sealed record RunResult(bool Ok, string? Text, ErrorInfo? Error);

internal sealed class RuntimeFailure : Exception
{
    public Span Span { get; }
    public RuntimeFailure(Span span, string message) : base(message) => Span = span;
}

public sealed class Interpreter
{
    private int _depth;
    private readonly Env _root;

    public Interpreter(int maxDepth = 200)
    {
        MaxDepth = maxDepth;
        _root = Builtins();
    }

    public int MaxDepth { get; }

    private static Env Builtins()
    {
        var env = Env.Bind(null, "len", new BuiltinV("len", 1, (a, sp) =>
            a[0] is StrV s ? new NumV(s.V.Length) : throw new RuntimeFailure(sp, "len expects a string")));
        env = Env.Bind(env, "str", new BuiltinV("str", 1, (a, sp) => new StrV(a[0] is StrV s ? s.V : Show(a[0]))));
        env = Env.Bind(env, "num", new BuiltinV("num", 1, (a, sp) =>
            a[0] is StrV s && double.TryParse(s.V, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
                ? new NumV(d)
                : throw new RuntimeFailure(sp, "cannot convert argument to number")));
        return env;
    }

    /** @id CODE-INT-001 @implements REQ-INT-010 */
    public RunResult Run(string source)
    {
        var src = new Source(source);
        var parsed = Grammar.Parse(source);
        if (!parsed.Ok)
            return new RunResult(false, null, new ErrorInfo("parse", parsed.Error!.Describe(src), src.PosAt(parsed.Error.Offset)));
        _depth = 0;
        try
        {
            return new RunResult(true, Show(Eval(parsed.Value!, _root)), null);
        }
        catch (RuntimeFailure f)
        {
            return new RunResult(false, null, new ErrorInfo("runtime", f.Message, src.PosAt(f.Span.Start)));
        }
    }

    private static string TypeName(Value v) => v switch
    {
        NumV => "number", StrV => "string", BoolV => "bool", _ => "function",
    };

    /** @id CODE-INT-002 @implements REQ-INT-011 */
    public static string Show(Value v) => v switch
    {
        NumV n => ShowNum(n.V),
        StrV s => Quote(s.V),
        BoolV b => b.V ? "true" : "false",
        ClosureV c => $"<fn/{c.Lam.Params.Count}>",
        BuiltinV b => $"<builtin {b.Name}>",
        _ => throw new InvalidOperationException(),
    };

    private static string ShowNum(double d) =>
        d == Math.Floor(d) && Math.Abs(d) < 1e15 ? ((long)d).ToString(CultureInfo.InvariantCulture) : d.ToString("R", CultureInfo.InvariantCulture);

    private static string Quote(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (var c in s)
            sb.Append(c switch { '\n' => "\\n", '\t' => "\\t", '"' => "\\\"", '\\' => "\\\\", _ => c.ToString() });
        return sb.Append('"').ToString();
    }

    /** @id CODE-INT-003 @implements REQ-INT-001 REQ-INT-002 REQ-INT-003 REQ-INT-004 REQ-INT-005 REQ-INT-007 */
    private Value Eval(Expr e, Env env)
    {
        switch (e)
        {
            case Num n: return new NumV(n.Value);
            case Str s: return new StrV(s.Value);
            case Bool b: return new BoolV(b.Value);
            case Group g: return Eval(g.Inner, env);
            case Var v:
                var cell = env.Lookup(v.Name) ?? throw new RuntimeFailure(v.Span, $"unbound variable '{v.Name}'");
                return cell.Value ?? throw new RuntimeFailure(v.Span, $"uninitialized variable '{v.Name}'");
            case Lambda l: return new ClosureV(l, env);
            case Let l when l.Rec:
                var inner = Env.BindRec(env, l.Name, out var slot);
                if (l.Value is not Lambda lam) throw new RuntimeFailure(l.Value.Span, "let rec requires a function");
                slot.Value = new ClosureV(lam, inner);
                return Eval(l.Body, inner);
            case Let l: return Eval(l.Body, Env.Bind(env, l.Name, Eval(l.Value, env)));
            case If i:
                return Eval(i.Cond, env) is BoolV cv
                    ? Eval(cv.V ? i.Then : i.Else, env)
                    : throw new RuntimeFailure(i.Span, "condition must be bool");
            case Unary u: return EvalUnary(u, env);
            case Binary b: return EvalBinary(b, env);
            case Call c: return EvalCall(c, env);
            default: throw new InvalidOperationException(e.GetType().Name);
        }
    }

    private Value EvalUnary(Unary u, Env env)
    {
        var x = Eval(u.Operand, env);
        if (u.Op == "!") return x is BoolV b ? new BoolV(!b.V) : throw new RuntimeFailure(u.Span, "operand must be bool");
        return x is NumV n ? new NumV(-n.V) : throw new RuntimeFailure(u.Span, $"cannot apply '-' to {TypeName(x)}");
    }

    private Value EvalBinary(Binary b, Env env)
    {
        if (b.Op is "&&" or "||")
        {
            if (Eval(b.Left, env) is not BoolV l) throw new RuntimeFailure(b.Span, "operand must be bool");
            if (b.Op == "&&" ? !l.V : l.V) return l;
            return Eval(b.Right, env) is BoolV r ? r : throw new RuntimeFailure(b.Span, "operand must be bool");
        }
        var x = Eval(b.Left, env);
        var y = Eval(b.Right, env);
        if (b.Op == "==") return new BoolV(Equal(x, y));
        if (b.Op == "!=") return new BoolV(!Equal(x, y));
        if (x is NumV p && y is NumV q)
        {
            switch (b.Op)
            {
                case "+": return new NumV(p.V + q.V);
                case "-": return new NumV(p.V - q.V);
                case "*": return new NumV(p.V * q.V);
                case "/":
                case "%":
                    if (q.V == 0) throw new RuntimeFailure(b.Span, "division by zero");
                    return new NumV(b.Op == "/" ? p.V / q.V : p.V % q.V);
                case "<": return new BoolV(p.V < q.V);
                case "<=": return new BoolV(p.V <= q.V);
                case ">": return new BoolV(p.V > q.V);
                case ">=": return new BoolV(p.V >= q.V);
            }
        }
        if (x is StrV s && y is StrV t)
        {
            if (b.Op == "+") return new StrV(s.V + t.V);
            if (b.Op == "<") return new BoolV(string.CompareOrdinal(s.V, t.V) < 0);
            if (b.Op == ">") return new BoolV(string.CompareOrdinal(s.V, t.V) > 0);
        }
        throw new RuntimeFailure(b.Span, $"cannot apply '{b.Op}' to {TypeName(x)} and {TypeName(y)}");
    }

    private static bool Equal(Value x, Value y) => x switch
    {
        NumV a when y is NumV b => a.V == b.V,
        StrV a when y is StrV b => a.V == b.V,
        BoolV a when y is BoolV b => a.V == b.V,
        _ => ReferenceEquals(x, y),
    };

    /** @id CODE-INT-004 @implements REQ-INT-006 REQ-INT-008 REQ-INT-009 */
    private Value EvalCall(Call c, Env env)
    {
        var fn = Eval(c.Fn, env);
        int arity = fn switch { ClosureV cl => cl.Lam.Params.Count, BuiltinV bi => bi.Arity, _ => -1 };
        if (arity < 0) throw new RuntimeFailure(c.Span, $"cannot call {TypeName(fn)}");
        if (arity != c.Args.Count) throw new RuntimeFailure(c.Span, $"expected {arity} arguments but got {c.Args.Count}");
        var args = c.Args.Select(a => Eval(a, env)).ToArray();
        if (fn is BuiltinV builtin) return builtin.Fn(args, c.Span);
        var closure = (ClosureV)fn;
        if (++_depth > MaxDepth)
        {
            _depth--;
            throw new RuntimeFailure(c.Span, $"stack overflow: call depth exceeded {MaxDepth}");
        }
        try
        {
            var callEnv = closure.Env;
            for (int i = 0; i < args.Length; i++) callEnv = Env.Bind(callEnv, closure.Lam.Params[i], args[i]);
            return Eval(closure.Lam.Body, callEnv);
        }
        finally { _depth--; }
    }
}
