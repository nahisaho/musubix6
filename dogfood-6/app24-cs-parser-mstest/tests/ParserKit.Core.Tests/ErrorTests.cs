using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;

namespace ParserKit.Core.Tests;

[TestClass]
public class ErrorTests
{
    static Parser<char> Digit => P.Satisfy(char.IsDigit, "digit");

    /** @id TEST-ERR-001 @verifies REQ-ERR-001 */
    [TestMethod]
    public void TEST_ERR_001_furthest_failure_wins_and_equal_offsets_union()
    {
        var deep = P.Char('a').Then(P.Char('b')).Map(_ => 'x');
        var shallow = P.Char('x');
        foreach (var r in new[] { deep.Or(shallow).Run("az"), shallow.Or(deep).Run("az") })
        {
            Assert.IsFalse(r.Ok);
            Assert.AreEqual(1, r.Error!.Offset);
            CollectionAssert.AreEqual(new[] { "'b'" }, r.Error.Expected.ToArray());
        }
        var u = P.Str("zz").Or(P.Str("aa")).Or(P.Str("zz")).Run("q");
        Assert.AreEqual(0, u.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "\"aa\"", "\"zz\"" }, u.Error.Expected.ToArray());
        var f1 = new Failure(3, new[] { "b", "a" });
        var f2 = new Failure(3, new[] { "c", "a" });
        Assert.AreEqual(Failure.Merge(f1, f2).Offset, Failure.Merge(f2, f1).Offset);
        CollectionAssert.AreEqual(new[] { "a", "b", "c" }, Failure.Merge(f1, f2).Expected.ToArray());
        CollectionAssert.AreEqual(Failure.Merge(f1, f1).Expected.ToArray(), new[] { "a", "b" });
    }

    /** @id TEST-ERR-002 @verifies REQ-ERR-002 */
    [TestMethod]
    public void TEST_ERR_002_label_replaces_only_shallow_expectations()
    {
        var num = Digit.Many1().Label("number").Run("x");
        CollectionAssert.AreEqual(new[] { "number" }, num.Error!.Expected.ToArray());
        var deep = P.Char('a').Then(P.Char('b')).Label("ab").Run("ax");
        Assert.AreEqual(1, deep.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "'b'" }, deep.Error.Expected.ToArray());
        Assert.IsTrue(Digit.Label("d").Run("5").Ok);
    }

    /** @id TEST-ERR-003 @verifies REQ-ERR-003 */
    [TestMethod]
    public void TEST_ERR_003_cut_commits_and_blocks_alternatives()
    {
        var committed = P.Str("if").Right(P.Cut()).Right(Digit);
        var f = committed.Run("if x");
        Assert.IsFalse(f.Ok);
        Assert.IsTrue(f.Error!.Committed);
        Assert.AreEqual(2, f.Error.Offset);
        var withAlt = committed.Or(P.Pure('z'));
        Assert.IsFalse(withAlt.Run("if x").Ok);
        var plain = P.Str("if").Right(Digit);
        Assert.AreEqual('z', plain.Or(P.Pure('z')).Run("if x").Value);
        Assert.IsTrue(committed.Or(P.Pure('z')).Run("if4").Ok);
    }

    /** @id TEST-ERR-004 @verifies REQ-ERR-004 */
    [TestMethod]
    public void TEST_ERR_004_atomic_clears_commit()
    {
        var committed = P.Str("if").Right(P.Cut()).Right(Digit);
        var r = committed.Atomic().Or(P.Pure('z')).Run("if x");
        Assert.IsTrue(r.Ok);
        Assert.AreEqual('z', r.Value);
        var f = P.Cut().Atomic().Right(Digit).Run("x");
        Assert.IsFalse(f.Ok);
        Assert.IsFalse(f.Error!.Committed);
        Assert.IsTrue(P.Cut().Run("x").Committed);
    }

    /** @id TEST-ERR-005 @verifies REQ-ERR-005 */
    [TestMethod]
    public void TEST_ERR_005_many_hint_merges_expected()
    {
        var r = Digit.Many().Then(P.Char(')')).Run("12x");
        Assert.IsFalse(r.Ok);
        Assert.AreEqual(2, r.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "')'", "digit" }, r.Error.Expected.ToArray());
        var deeper = Digit.Many().Then(P.Char('a').Then(P.Char('b'))).Run("1ax");
        Assert.AreEqual(2, deeper.Error!.Offset);
        CollectionAssert.AreEqual(new[] { "'b'" }, deeper.Error.Expected.ToArray());
    }

    /** @id TEST-ERR-006 @verifies REQ-ERR-006 */
    [TestMethod]
    public void TEST_ERR_006_describe_renders_position_and_expectations()
    {
        var src = new Source("q\nxyz");
        Assert.AreEqual("line 2, col 2: expected 'a', 'b' or 'c' but found 'y'",
            new Failure(3, new[] { "'a'", "'b'", "'c'" }).Describe(src));
        Assert.AreEqual("line 2, col 2: expected 'a' or 'b' but found 'y'",
            new Failure(3, new[] { "'a'", "'b'" }).Describe(src));
        Assert.AreEqual("line 1, col 1: expected digit but found 'q'", new Failure(0, new[] { "digit" }).Describe(src));
        Assert.AreEqual("line 2, col 4: expected digit but found end of input", new Failure(5, new[] { "digit" }).Describe(src));
        Assert.AreEqual("line 1, col 1: boom", new Failure(0, Array.Empty<string>(), false, "boom").Describe(src));
    }
}
