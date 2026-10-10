using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;

namespace ParserKit.Core.Tests;

[TestClass]
public class SourceTests
{
    /** @id TEST-SRC-001 @verifies REQ-SRC-001 */
    [TestMethod]
    public void TEST_SRC_001_origin_is_line1_col1()
    {
        var p = new Source("abc").PosAt(0);
        Assert.AreEqual(1, p.Line);
        Assert.AreEqual(1, p.Col);
        Assert.AreEqual(0, p.Offset);
    }

    /** @id TEST-SRC-002 @verifies REQ-SRC-002 */
    [TestMethod]
    public void TEST_SRC_002_newline_and_tab_columns()
    {
        var s = new Source("a\tb\ncd");
        Assert.AreEqual(3, s.PosAt(2).Col);
        Assert.AreEqual(4, s.PosAt(3).Col);
        var p = s.PosAt(4);
        Assert.AreEqual(2, p.Line);
        Assert.AreEqual(1, p.Col);
        Assert.AreEqual(2, s.PosAt(5).Col);
    }

    /** @id TEST-SRC-003 @verifies REQ-SRC-003 */
    [TestMethod]
    public void TEST_SRC_003_crlf_is_one_break()
    {
        var s = new Source("a\r\nb\rc");
        Assert.AreEqual(1, s.PosAt(2).Line);
        Assert.AreEqual(3, s.PosAt(2).Col);
        Assert.AreEqual(2, s.PosAt(3).Line);
        Assert.AreEqual(1, s.PosAt(3).Col);
        Assert.AreEqual(2, s.PosAt(5).Line);
        Assert.AreEqual(3, s.PosAt(5).Col);
    }

    /** @id TEST-SRC-004 @verifies REQ-SRC-004 */
    [TestMethod]
    public void TEST_SRC_004_offset_bounds()
    {
        var s = new Source("ab");
        Assert.AreEqual(3, s.PosAt(2).Col);
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => s.PosAt(3));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => s.PosAt(-1));
    }

    /** @id TEST-SRC-005 @verifies REQ-SRC-005 */
    [TestMethod]
    public void TEST_SRC_005_line_text()
    {
        var s = new Source("one\r\ntwo\n\nlast");
        Assert.AreEqual("one", s.LineText(1));
        Assert.AreEqual("two", s.LineText(2));
        Assert.AreEqual("", s.LineText(3));
        Assert.AreEqual("last", s.LineText(4));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => s.LineText(5));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => s.LineText(0));
    }

    /** @id TEST-SRC-006 @verifies REQ-SRC-006 */
    [TestMethod]
    public void TEST_SRC_006_agrees_with_naive_scan()
    {
        var rng = new Random(42);
        var chars = new[] { 'a', 'b', ' ', '\n', '\r', '\t' };
        var text = new string(Enumerable.Range(0, 2000).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
        var s = new Source(text);
        for (int off = 0; off <= text.Length; off++)
        {
            int line = 1, col = 1;
            for (int i = 0; i < off; i++)
            {
                if (text[i] == '\n') { line++; col = 1; }
                else if (text[i] == '\r' && i + 1 < text.Length && text[i + 1] == '\n') { col++; }
                else col++;
            }
            var p = s.PosAt(off);
            Assert.AreEqual((line, col), (p.Line, p.Col), $"offset {off}");
        }
    }
}
