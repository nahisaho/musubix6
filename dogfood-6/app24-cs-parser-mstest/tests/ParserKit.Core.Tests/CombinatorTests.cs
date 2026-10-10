using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;

namespace ParserKit.Core.Tests;

[TestClass]
public class CombinatorTests
{
    static readonly Parser<char> Digit = P.Satisfy(char.IsDigit, "digit");

    /** @id TEST-CMB-001 @verifies REQ-CMB-001 */
    [TestMethod]
    public void TEST_CMB_001_pure_and_fail()
    {
        var r = P.Pure(7).Run("abc");
        Assert.IsTrue(r.Ok);
        Assert.AreEqual(7, r.Value);
        Assert.AreEqual(0, r.Next);
        var f = P.Fail<int>("boom").Run("abc");
        Assert.IsFalse(f.Ok);
        Assert.AreEqual(0, f.Error!.Offset);
        Assert.AreEqual("boom", f.Error.Message);
    }

    /** @id TEST-CMB-002 @verifies REQ-CMB-002 */
    [TestMethod]
    public void TEST_CMB_002_satisfy_consumes_one()
    {
        var ok = Digit.Run("7x");
        Assert.IsTrue(ok.Ok);
        Assert.AreEqual('7', ok.Value);
        Assert.AreEqual(1, ok.Next);
        var bad = Digit.Run("x7");
        Assert.IsFalse(bad.Ok);
        Assert.AreEqual(0, bad.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "digit" }, bad.Error.Expected.ToArray());
        var eof = Digit.Run("");
        Assert.IsFalse(eof.Ok);
        CollectionAssert.AreEqual(new[] { "digit" }, eof.Error!.Expected.ToArray());
    }

    /** @id TEST-CMB-003 @verifies REQ-CMB-003 */
    [TestMethod]
    public void TEST_CMB_003_str_is_atomic()
    {
        var ok = P.Str("let").Run("let x");
        Assert.IsTrue(ok.Ok);
        Assert.AreEqual("let", ok.Value);
        Assert.AreEqual(3, ok.Next);
        var bad = P.Str("let").Run("lex");
        Assert.IsFalse(bad.Ok);
        Assert.AreEqual(0, bad.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "\"let\"" }, bad.Error.Expected.ToArray());
    }

    /** @id TEST-CMB-004 @verifies REQ-CMB-004 */
    [TestMethod]
    public void TEST_CMB_004_map_and_select()
    {
        var r = Digit.Map(c => c - '0').Run("8");
        Assert.AreEqual(8, r.Value);
        var q = (from c in Digit select c - '0' + 1).Run("8");
        Assert.AreEqual(9, q.Value);
        Assert.AreEqual(1, q.Next);
        Assert.IsFalse(Digit.Map(c => c).Run("z").Ok);
    }

    /** @id TEST-CMB-005 @verifies REQ-CMB-005 */
    [TestMethod]
    public void TEST_CMB_005_bind_dependent_sequence()
    {
        var q = from a in Digit from b in Digit select (a, b);
        var ok = q.Run("12");
        Assert.AreEqual(('1', '2'), ok.Value);
        var dep = Digit.Bind(c => P.Str(new string(c, 2))).Run("1ab");
        Assert.IsFalse(dep.Ok);
        Assert.AreEqual(1, dep.Error!.Offset);
        Assert.AreEqual("22", Digit.Bind(c => P.Str(new string(c, 2))).Run("222").Value);
    }

    /** @id TEST-CMB-006 @verifies REQ-CMB-006 */
    [TestMethod]
    public void TEST_CMB_006_then_left_right()
    {
        var a = P.Char('a'); var b = P.Char('b');
        Assert.AreEqual(('a', 'b'), a.Then(b).Run("ab").Value);
        Assert.AreEqual('a', a.Left(b).Run("ab").Value);
        Assert.AreEqual('b', a.Right(b).Run("ab").Value);
        var f = a.Then(b).Run("ax");
        Assert.IsFalse(f.Ok);
        Assert.AreEqual(1, f.Error!.Offset);
    }

    /** @id TEST-CMB-007 @verifies REQ-CMB-007 */
    [TestMethod]
    public void TEST_CMB_007_or_backtracks()
    {
        var p = P.Str("ab").Or(P.Str("a"));
        Assert.AreEqual("ab", p.Run("abc").Value);
        var q = P.Str("a").Then(P.Char('x')).Map(t => "ax").Or(P.Str("ab"));
        var r = q.Run("ab");
        Assert.IsTrue(r.Ok);
        Assert.AreEqual("ab", r.Value);
        Assert.AreEqual(2, r.Next);
    }

    /** @id TEST-CMB-008 @verifies REQ-CMB-008 */
    [TestMethod]
    public void TEST_CMB_008_many_guards_empty_loop()
    {
        var r = Digit.Many().Run("123x");
        CollectionAssert.AreEqual(new[] { '1', '2', '3' }, r.Value!.ToArray());
        Assert.AreEqual(3, r.Next);
        Assert.AreEqual(0, Digit.Many().Run("x").Value!.Count);
        Assert.ThrowsExactly<InvalidOperationException>(() => P.Pure(1).Many().Run("abc"));
    }

    /** @id TEST-CMB-009 @verifies REQ-CMB-009 */
    [TestMethod]
    public void TEST_CMB_009_many1_and_sepby()
    {
        Assert.IsFalse(Digit.Many1().Run("x").Ok);
        Assert.AreEqual(2, Digit.Many1().Run("12").Value!.Count);
        var list = Digit.SepBy(P.Char(','));
        var r = list.Run("1,2,3,x");
        Assert.AreEqual(3, r.Value!.Count);
        Assert.AreEqual(5, r.Next);
        var empty = list.Run("x");
        Assert.IsTrue(empty.Ok);
        Assert.AreEqual(0, empty.Value!.Count);
        Assert.AreEqual(0, empty.Next);
    }

    /** @id TEST-CMB-010 @verifies REQ-CMB-010 */
    [TestMethod]
    public void TEST_CMB_010_opt_and_between()
    {
        var o = Digit.Opt('?').Run("x");
        Assert.AreEqual('?', o.Value);
        Assert.AreEqual(0, o.Next);
        Assert.AreEqual('5', Digit.Opt('?').Run("5").Value);
        var b = Digit.Between(P.Char('('), P.Char(')')).Run("(4)");
        Assert.AreEqual('4', b.Value);
        Assert.AreEqual(3, b.Next);
    }

    /** @id TEST-CMB-011 @verifies REQ-CMB-011 */
    [TestMethod]
    public void TEST_CMB_011_parseall_requires_eof()
    {
        Assert.IsTrue(Digit.ParseAll("1").Ok);
        var r = Digit.ParseAll("12");
        Assert.IsFalse(r.Ok);
        Assert.AreEqual(1, r.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "end of input" }, r.Error.Expected.ToArray());
    }

    /** @id TEST-CMB-012 @verifies REQ-CMB-012 */
    [TestMethod]
    public void TEST_CMB_012_lazy_recursion()
    {
        int calls = 0;
        Parser<int> parens = null!;
        parens = P.Lazy(() => { calls++; return parens!.Between(P.Char('('), P.Char(')')).Map(d => d + 1).Opt(0); });
        var text = new string('(', 500) + new string(')', 500);
        var r = parens.ParseAll(text);
        Assert.IsTrue(r.Ok);
        Assert.AreEqual(500, r.Value);
        Assert.AreEqual(1, calls);
    }

    /** @id TEST-CMB-013 @verifies REQ-CMB-013 */
    [TestMethod]
    public void TEST_CMB_013_lookahead()
    {
        var pk = Digit.Peek().Run("7");
        Assert.IsTrue(pk.Ok);
        Assert.AreEqual(0, pk.Next);
        Assert.AreEqual('7', pk.Value);
        Assert.IsTrue(Digit.NotFollowedBy().Run("x").Ok);
        var bad = Digit.NotFollowedBy().Run("7");
        Assert.IsFalse(bad.Ok);
        Assert.AreEqual(0, bad.Error!.Offset);
    }
}
