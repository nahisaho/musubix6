using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit.Interp;

namespace ParserKit.Interp.Tests;

[TestClass]
public class InterpTests
{
    static string Eval(string src)
    {
        var r = new Interpreter().Run(src);
        Assert.IsTrue(r.Ok, r.Error?.Message);
        return r.Text!;
    }

    static ErrorInfo Err(string src, int line, int col, string messagePart, string kind = "runtime")
    {
        var r = new Interpreter().Run(src);
        Assert.IsFalse(r.Ok, "expected an error for: " + src);
        Assert.AreEqual(kind, r.Error!.Kind);
        Assert.AreEqual((line, col), (r.Error.Pos.Line, r.Error.Pos.Col), r.Error.Message);
        StringAssert.Contains(r.Error.Message, messagePart);
        return r.Error;
    }

    /** @id TEST-INT-001 @verifies REQ-INT-001 */
    [TestMethod]
    public void TEST_INT_001_operators()
    {
        Assert.AreEqual("7", Eval("1 + 2 * 3"));
        Assert.AreEqual("1", Eval("7 % 3"));
        Assert.AreEqual("\"ab\"", Eval("\"a\" + \"b\""));
        Assert.AreEqual("true", Eval("1 < 2 && 2 <= 2 && 3 > 2 && 3 >= 3"));
        Assert.AreEqual("true", Eval("\"a\" == \"a\""));
        Assert.AreEqual("false", Eval("1 == true"));
        Assert.AreEqual("true", Eval("1 != \"1\""));
        Assert.AreEqual("-3", Eval("-(1 + 2)"));
        Assert.AreEqual("true", Eval("!false"));
    }

    /** @id TEST-INT-002 @verifies REQ-INT-002 */
    [TestMethod]
    public void TEST_INT_002_scoping_and_shadowing()
    {
        Assert.AreEqual("2", Eval("let x = 1 in let x = x + 1 in x"));
        Assert.AreEqual("11", Eval("let x = 1 in (let x = 10 in x) + x"));
        Err("(let y = 1 in y) + y", 1, 20, "unbound variable 'y'");
    }

    /** @id TEST-INT-003 @verifies REQ-INT-003 */
    [TestMethod]
    public void TEST_INT_003_closures_capture_definition_env()
    {
        Assert.AreEqual("1", Eval("let mk = fn(n) => fn() => n in let a = mk(1) in let n = 99 in a()"));
        Assert.AreEqual("12", Eval("let mk = fn(n) => fn() => n in let a = mk(1) in let b = mk(2) in a() * 10 + b()"));
        Assert.AreEqual("12", Eval("let add = fn(a) => fn(b) => a + b in let inc = add(1) in let add10 = add(10) in inc(1) + add10(0)"));
        Assert.AreEqual("5", Eval("let compose = fn(f, g) => fn(x) => f(g(x)) in let inc = fn(x) => x + 1 in let dbl = fn(x) => x * 2 in compose(inc, dbl)(2)"));
    }

    /** @id TEST-INT-004 @verifies REQ-INT-004 */
    [TestMethod]
    public void TEST_INT_004_let_rec()
    {
        Assert.AreEqual("3628800", Eval("let rec fact = fn(n) => if n <= 1 then 1 else n * fact(n - 1) in fact(10)"));
        Assert.AreEqual("610", Eval("let rec fib = fn(n) => if n < 2 then n else fib(n - 1) + fib(n - 2) in fib(15)"));
        Err("let f = fn(n) => f(n) in f(1)", 1, 18, "unbound variable 'f'");
        Err("let rec x = 1 in x", 1, 13, "let rec requires a function");
    }

    /** @id TEST-INT-005 @verifies REQ-INT-005 */
    [TestMethod]
    public void TEST_INT_005_runtime_errors_have_positions()
    {
        Err("1 +\n  zz", 2, 3, "unbound variable 'zz'");
        Err("let a = 4 in\n  a / (a - 4)", 2, 3, "division by zero");
        Err("1 + true", 1, 1, "cannot apply '+' to number and bool");
        Err("-\"s\"", 1, 1, "cannot apply '-' to string");
        Err("a % 0", 1, 1, "unbound variable 'a'");
        Err("1 % 0", 1, 1, "division by zero");
    }

    /** @id TEST-INT-006 @verifies REQ-INT-006 */
    [TestMethod]
    public void TEST_INT_006_call_errors()
    {
        Err("let f = fn(a, b) => a in f(1)", 1, 26, "expected 2 arguments but got 1");
        Err("let f = fn() => 1 in f(1, 2, 3)", 1, 22, "expected 0 arguments but got 3");
        Err("3(4)", 1, 1, "cannot call number");
        Err("\"s\"()", 1, 1, "cannot call string");
    }

    /** @id TEST-INT-007 @verifies REQ-INT-007 */
    [TestMethod]
    public void TEST_INT_007_short_circuit_and_bool_checks()
    {
        Assert.AreEqual("false", Eval("false && (1 / 0 == 0)"));
        Assert.AreEqual("true", Eval("true || boom"));
        Assert.AreEqual("1", Eval("if true then 1 else 1 / 0"));
        Err("if 1 then 2 else 3", 1, 1, "condition must be bool");
        Err("1 && true", 1, 1, "operand must be bool");
        Err("true && 1", 1, 1, "operand must be bool");
        Err("!1", 1, 1, "operand must be bool");
    }

    /** @id TEST-INT-008 @verifies REQ-INT-008 */
    [TestMethod]
    public void TEST_INT_008_depth_limit()
    {
        const string def = "let rec f = fn(n) => if n == 0 then 0 else 1 + f(n - 1) in ";
        var it = new Interpreter();
        Assert.AreEqual(200, it.MaxDepth);
        Assert.AreEqual("150", it.Run(def + "f(150)").Text);
        var r = it.Run(def + "f(100000)");
        Assert.IsFalse(r.Ok);
        StringAssert.Contains(r.Error!.Message, "stack overflow");
        Assert.AreEqual("150", it.Run(def + "f(150)").Text);
        var small = new Interpreter(10);
        Assert.IsFalse(small.Run(def + "f(11)").Ok);
        Assert.AreEqual("9", small.Run(def + "f(9)").Text);
    }

    /** @id TEST-INT-009 @verifies REQ-INT-009 */
    [TestMethod]
    public void TEST_INT_009_builtins()
    {
        Assert.AreEqual("5", Eval("len(\"héllo\")"));
        Assert.AreEqual("\"3\"", Eval("str(1 + 2)"));
        Assert.AreEqual("\"true\"", Eval("str(1 < 2)"));
        Assert.AreEqual("41.5", Eval("num(\"41.5\")"));
        Err("len(1)", 1, 1, "len expects a string");
        Err("len(\"a\", \"b\")", 1, 1, "expected 1 arguments but got 2");
        Err("num(\"abc\")", 1, 1, "cannot convert");
    }

    /** @id TEST-INT-010 @verifies REQ-INT-010 */
    [TestMethod]
    public void TEST_INT_010_parse_errors_reported()
    {
        var e = Err("let x = 1 in\n  x +", 2, 6, "expected", "parse");
        StringAssert.Contains(e.Message, "line 2, col 6");
        Err("1 + \"abc", 1, 5, "unterminated string", "parse");
    }

    /** @id TEST-INT-011 @verifies REQ-INT-011 */
    [TestMethod]
    public void TEST_INT_011_show()
    {
        Assert.AreEqual("3", Interpreter.Show(new NumV(3)));
        Assert.AreEqual("-0.5", Interpreter.Show(new NumV(-0.5)));
        Assert.AreEqual("0.30000000000000004", Eval("0.1 + 0.2"));
        Assert.AreEqual("\"a\\nb\\\"\"", Eval("\"a\\nb\\\"\""));
        Assert.AreEqual("<fn/2>", Eval("fn(a, b) => a"));
        Assert.AreEqual("<builtin len>", Eval("len"));
        Assert.AreEqual("true", Interpreter.Show(new BoolV(true)));
    }
}
