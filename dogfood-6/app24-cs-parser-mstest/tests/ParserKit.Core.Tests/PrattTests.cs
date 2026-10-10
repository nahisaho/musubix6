using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;

namespace ParserKit.Core.Tests;

[TestClass]
public class PrattTests
{
    static Parser<Func<string, string, string>> Bin(char c) =>
        P.Char(c).Map(_ => (Func<string, string, string>)((a, b) => $"({a}{c}{b})"));
    static Parser<Func<string, string>> Un(char c) =>
        P.Char(c).Map(_ => (Func<string, string>)(a => $"({c}{a})"));
    static Parser<Func<string, string>> Post(char c) =>
        P.Char(c).Map(_ => (Func<string, string>)(a => $"({a}{c})"));
    static Parser<string> Num() => P.Satisfy(char.IsDigit, "digit").Many1().Label("number").Map(d => new string(d.ToArray()));

    static Parser<string> Make(Action<ExprBuilder<string>> cfg)
    {
        Parser<string> expr = null!;
        var atom = Num().Or(P.Lazy(() => expr).Between(P.Char('('), P.Char(')')));
        var b = new ExprBuilder<string>(atom);
        cfg(b);
        expr = b.Build();
        return expr;
    }

    /** @id TEST-PRT-001 @verifies REQ-PRT-001 */
    [TestMethod]
    public void TEST_PRT_001_left_associative()
    {
        var p = Make(b => b.Infix(1, Assoc.Left, Bin('-')));
        Assert.AreEqual("((1-2)-3)", p.ParseAll("1-2-3").Value);
        Assert.AreEqual("(((1-2)-3)-4)", p.ParseAll("1-2-3-4").Value);
    }

    /** @id TEST-PRT-002 @verifies REQ-PRT-002 */
    [TestMethod]
    public void TEST_PRT_002_right_associative()
    {
        var p = Make(b => b.Infix(3, Assoc.Right, Bin('^')));
        Assert.AreEqual("(2^(3^2))", p.ParseAll("2^3^2").Value);
    }

    /** @id TEST-PRT-003 @verifies REQ-PRT-003 */
    [TestMethod]
    public void TEST_PRT_003_non_associative_chain_rejected()
    {
        var p = Make(b => b.Infix(1, Assoc.None, Bin('<')));
        Assert.AreEqual("(1<2)", p.ParseAll("1<2").Value);
        var r = p.ParseAll("1<2<3");
        Assert.IsFalse(r.Ok);
        Assert.AreEqual(3, r.Error!.Offset);
        StringAssert.Contains(r.Error.Message, "non-associative");
    }

    /** @id TEST-PRT-004 @verifies REQ-PRT-004 */
    [TestMethod]
    public void TEST_PRT_004_prefix_precedence()
    {
        var p = Make(b => b.Infix(2, Assoc.Left, Bin('*')).Infix(4, Assoc.Right, Bin('^')).Prefix(3, Un('-')));
        Assert.AreEqual("(-(2^2))", p.ParseAll("-2^2").Value);
        Assert.AreEqual("((-2)*3)", p.ParseAll("-2*3").Value);
        Assert.AreEqual("(-(-2))", p.ParseAll("--2").Value);
    }

    /** @id TEST-PRT-005 @verifies REQ-PRT-005 */
    [TestMethod]
    public void TEST_PRT_005_postfix()
    {
        var p = Make(b => b.Infix(2, Assoc.Left, Bin('*')).Infix(4, Assoc.Right, Bin('^')).Postfix(3, Post('!')));
        Assert.AreEqual("((3!)!)", p.ParseAll("3!!").Value);
        Assert.AreEqual("((2!)*3)", p.ParseAll("2!*3").Value);
        Assert.AreEqual("(2*(3!))", p.ParseAll("2*3!").Value);
        Assert.AreEqual("((2^3)!)", p.ParseAll("2^3!").Value);
    }

    /** @id TEST-PRT-006 @verifies REQ-PRT-006 */
    [TestMethod]
    public void TEST_PRT_006_mixed_levels_and_parens()
    {
        var p = Make(b => b.Infix(1, Assoc.Left, Bin('+')).Infix(1, Assoc.Left, Bin('-')).Infix(2, Assoc.Left, Bin('*')).Infix(2, Assoc.Left, Bin('/')));
        Assert.AreEqual("((1+(2*3))-(4/2))", p.ParseAll("1+2*3-4/2").Value);
        Assert.AreEqual("(((1+2)*3)-4)", p.ParseAll("(1+2)*3-4").Value);
        Assert.AreEqual("(1+2)", p.ParseAll("((((1+2))))").Value);
    }

    /** @id TEST-PRT-007 @verifies REQ-PRT-007 */
    [TestMethod]
    public void TEST_PRT_007_missing_operand()
    {
        var p = Make(b => b.Infix(1, Assoc.Left, Bin('+')));
        var r = p.ParseAll("1+");
        Assert.IsFalse(r.Ok);
        Assert.AreEqual(2, r.Error!.Offset);
        CollectionAssert.Contains(r.Error.Expected.ToArray(), "number");
        var r2 = p.ParseAll("1+2+");
        Assert.AreEqual(4, r2.Error!.Offset);
    }

    /** @id TEST-PRT-008 @verifies REQ-PRT-008 */
    [TestMethod]
    public void TEST_PRT_008_conflicting_associativity()
    {
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            new ExprBuilder<string>(Num()).Infix(1, Assoc.Left, Bin('+')).Infix(1, Assoc.Right, Bin('-')).Build());
        new ExprBuilder<string>(Num()).Infix(1, Assoc.Left, Bin('+')).Infix(1, Assoc.Left, Bin('-')).Build();
    }
}
