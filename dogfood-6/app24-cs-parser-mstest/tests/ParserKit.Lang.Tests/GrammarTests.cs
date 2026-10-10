using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;
using ParserKit.Lang;

namespace ParserKit.Lang.Tests;

[TestClass]
public class GrammarTests
{
    static string D(Expr e) => e switch
    {
        Num n => n.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
        Str s => $"\"{s.Value}\"",
        Bool b => b.Value ? "true" : "false",
        Var v => v.Name,
        Group g => D(g.Inner),
        Unary u => $"({u.Op} {D(u.Operand)})",
        Binary b => $"({b.Op} {D(b.Left)} {D(b.Right)})",
        If i => $"(if {D(i.Cond)} {D(i.Then)} {D(i.Else)})",
        Let l => $"({(l.Rec ? "letrec" : "let")} {l.Name} {D(l.Value)} {D(l.Body)})",
        Lambda f => $"(fn [{string.Join(' ', f.Params)}] {D(f.Body)})",
        Call c => $"(call {D(c.Fn)}{string.Concat(c.Args.Select(a => " " + D(a)))})",
        _ => throw new InvalidOperationException(e.GetType().Name),
    };

    static string Ok(string text)
    {
        var r = Grammar.Parse(text);
        Assert.IsTrue(r.Ok, r.Error?.Describe(new Source(text)));
        return D(r.Value!);
    }

    /** @id TEST-LNG-001 @verifies REQ-LNG-001 */
    [TestMethod]
    public void TEST_LNG_001_numbers()
    {
        Assert.AreEqual("12", Ok("12"));
        Assert.AreEqual("3.25", Ok("3.25"));
        var r = Grammar.Parse("1.");
        Assert.IsFalse(r.Ok);
        Assert.AreEqual(1, r.Error!.Offset);
    }

    /** @id TEST-LNG-002 @verifies REQ-LNG-002 */
    [TestMethod]
    public void TEST_LNG_002_strings_and_escapes()
    {
        var r = Grammar.Parse("\"a\\nb\\t\\\"c\\\\\"");
        Assert.IsTrue(r.Ok);
        Assert.AreEqual("a\nb\t\"c\\", ((Str)r.Value!).Value);
        var bad = Grammar.Parse("1 + \"abc");
        Assert.IsFalse(bad.Ok);
        Assert.AreEqual(4, bad.Error!.Offset);
        StringAssert.Contains(bad.Error.Message, "unterminated string");
    }

    /** @id TEST-LNG-003 @verifies REQ-LNG-003 */
    [TestMethod]
    public void TEST_LNG_003_keywords_vs_identifiers()
    {
        Assert.AreEqual("letter", Ok("letter"));
        Assert.AreEqual("iffy", Ok("iffy"));
        Assert.AreEqual("true", Ok("true"));
        Assert.AreEqual("truest", Ok("truest"));
        Assert.IsFalse(Grammar.Parse("let").Ok);
        Assert.IsFalse(Grammar.Parse("in").Ok);
        Assert.AreEqual("_a1", Ok("_a1"));
    }

    /** @id TEST-LNG-004 @verifies REQ-LNG-004 */
    [TestMethod]
    public void TEST_LNG_004_whitespace_and_comments()
    {
        Assert.AreEqual("(+ 1 2)", Ok("  1 # one\n + 2 \n"));
        Assert.AreEqual("1", Ok("# lead\n1 # tail without newline"));
        Assert.AreEqual("(+ 1 2)", Ok("1\r\n+\t2"));
    }

    /** @id TEST-LNG-005 @verifies REQ-LNG-005 */
    [TestMethod]
    public void TEST_LNG_005_lambda_and_call()
    {
        Assert.AreEqual("(fn [a b] (+ a b))", Ok("fn(a, b) => a + b"));
        Assert.AreEqual("(call (call f x) y)", Ok("f(x)(y)"));
        Assert.AreEqual("(call f)", Ok("f()"));
        Assert.AreEqual("(call (fn [x] x) 3)", Ok("(fn(x) => x)(3)"));
        Assert.AreEqual("(fn [] 1)", Ok("fn() => 1"));
    }

    /** @id TEST-LNG-006 @verifies REQ-LNG-006 */
    [TestMethod]
    public void TEST_LNG_006_let_forms()
    {
        Assert.AreEqual("(let x 1 (+ x 2))", Ok("let x = 1 in x + 2"));
        Assert.AreEqual("(letrec f (fn [n] n) (call f 1))", Ok("let rec f = fn(n) => n in f(1)"));
        Assert.AreEqual("(let a 1 (let b 2 (+ a b)))", Ok("let a = 1 in let b = 2 in a + b"));
        var r = Grammar.Parse("let x = 1 x");
        Assert.IsFalse(r.Ok);
        CollectionAssert.Contains(r.Error!.Expected.ToArray(), "\"in\"");
    }

    /** @id TEST-LNG-007 @verifies REQ-LNG-007 */
    [TestMethod]
    public void TEST_LNG_007_operator_precedence()
    {
        Assert.AreEqual("(+ 1 (* 2 3))", Ok("1 + 2 * 3"));
        Assert.AreEqual("(|| a (&& b c))", Ok("a || b && c"));
        Assert.AreEqual("(- (- 1 2) 3)", Ok("1 - 2 - 3"));
        Assert.AreEqual("(* (- x) y)", Ok("-x * y"));
        Assert.AreEqual("(== (< a b) (< c d))", Ok("a < b == c < d"));
        Assert.AreEqual("(&& (! a) b)", Ok("!a && b"));
        Assert.AreEqual("(<= a b)", Ok("a <= b"));
        Assert.IsFalse(Grammar.Parse("1 < 2 < 3").Ok);
        Assert.IsFalse(Grammar.Parse("1 == 2 == 3").Ok);
    }

    /** @id TEST-LNG-008 @verifies REQ-LNG-008 */
    [TestMethod]
    public void TEST_LNG_008_spans()
    {
        const string text = "  (1 + 2) * f(x)  ";
        var e = (Binary)Grammar.Parse(text).Value!;
        Assert.AreEqual("(1 + 2) * f(x)", text[e.Span.Start..e.Span.End].ToString());
        var group = (Group)e.Left;
        Assert.AreEqual("(1 + 2)", text[group.Span.Start..group.Span.End]);
        var left = (Binary)group.Inner;
        Assert.AreEqual("1 + 2", text[left.Span.Start..left.Span.End]);
        var call = (Call)e.Right;
        Assert.AreEqual("f(x)", text[call.Span.Start..call.Span.End]);
        Assert.AreEqual("f", text[call.Fn.Span.Start..call.Fn.Span.End]);
        const string t2 = "let x = fn(a) => a in -x";
        var l = (Let)Grammar.Parse(t2).Value!;
        Assert.AreEqual(t2, t2[l.Span.Start..l.Span.End]);
        Assert.AreEqual("fn(a) => a", t2[l.Value.Span.Start..l.Value.Span.End]);
        Assert.AreEqual("-x", t2[l.Body.Span.Start..l.Body.Span.End]);
    }

    /** @id TEST-LNG-009 @verifies REQ-LNG-009 */
    [TestMethod]
    public void TEST_LNG_009_if_then_else()
    {
        Assert.AreEqual("(if a b c)", Ok("if a then b else c"));
        Assert.AreEqual("(if a b (if c d e))", Ok("if a then b else if c then d else e"));
        var r = Grammar.Parse("if a then b");
        Assert.IsFalse(r.Ok);
        CollectionAssert.Contains(r.Error!.Expected.ToArray(), "\"else\"");
    }
}
