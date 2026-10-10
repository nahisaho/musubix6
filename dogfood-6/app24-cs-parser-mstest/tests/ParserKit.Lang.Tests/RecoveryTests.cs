using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit;
using ParserKit.Lang;

namespace ParserKit.Lang.Tests;

[TestClass]
public class RecoveryTests
{
    /** @id TEST-REC-001 @verifies REQ-REC-001 */
    [TestMethod]
    public void TEST_REC_001_valid_program_has_no_diagnostics()
    {
        var r = Recovery.ParseProgram("1 + 2; let x = 3 in x; \"a\"", 10);
        Assert.AreEqual(0, r.Diagnostics.Count);
        Assert.AreEqual(3, r.Statements.Count);
        Assert.IsTrue(r.Statements.All(s => s is not ErrorStmt));
    }

    /** @id TEST-REC-002 @verifies REQ-REC-002 */
    [TestMethod]
    public void TEST_REC_002_error_yields_diagnostic_and_continues()
    {
        var r = Recovery.ParseProgram("1 + 2;\n3 + ;\n4 * 5;", 10);
        Assert.AreEqual(1, r.Diagnostics.Count);
        Assert.AreEqual(3, r.Statements.Count);
        Assert.IsInstanceOfType<ErrorStmt>(r.Statements[1]);
        Assert.IsNotInstanceOfType<ErrorStmt>(r.Statements[2]);
        var d = r.Diagnostics[0];
        Assert.AreEqual(2, d.Pos.Line);
        Assert.AreEqual(5, d.Pos.Col);
        StringAssert.Contains(d.Message, "expected");
    }

    /** @id TEST-REC-003 @verifies REQ-REC-003 */
    [TestMethod]
    public void TEST_REC_003_sync_ignores_nested_semicolons()
    {
        var r = Recovery.ParseProgram("1 + ) \"a;b\" (c; d) # x; y\n; 7", 10);
        Assert.AreEqual(1, r.Diagnostics.Count);
        Assert.AreEqual(2, r.Statements.Count);
        Assert.IsInstanceOfType<ErrorStmt>(r.Statements[0]);
        Assert.IsNotInstanceOfType<ErrorStmt>(r.Statements[1]);
        var s = Recovery.ParseProgram("\"a;b\"; (1; 2); 3", 10);
        Assert.AreEqual(3, s.Statements.Count);
        Assert.AreEqual(1, s.Diagnostics.Count);
    }

    /** @id TEST-REC-004 @verifies REQ-REC-004 */
    [TestMethod]
    public void TEST_REC_004_diagnostics_are_capped()
    {
        var r = Recovery.ParseProgram("+; +; +; +; +; 1", 2);
        Assert.AreEqual(3, r.Diagnostics.Count);
        StringAssert.Contains(r.Diagnostics[2].Message, "too many errors");
        Assert.AreEqual(2, r.Statements.Count(s => s is ErrorStmt));
        var offs = r.Diagnostics.Select(d => d.Pos.Offset).ToList();
        CollectionAssert.AreEqual(offs.OrderBy(x => x).ToList(), offs);
    }

    /** @id TEST-REC-005 @verifies REQ-REC-005 */
    [TestMethod]
    public void TEST_REC_005_missing_final_semicolon_and_empty_statements()
    {
        var r = Recovery.ParseProgram(";; 1;; 2 ;", 10);
        Assert.AreEqual(0, r.Diagnostics.Count);
        Assert.AreEqual(2, r.Statements.Count);
        var e = Recovery.ParseProgram("", 10);
        Assert.AreEqual(0, e.Statements.Count);
        Assert.AreEqual(0, e.Diagnostics.Count);
    }

    /** @id TEST-REC-006 @verifies REQ-REC-006 */
    [TestMethod]
    public void TEST_REC_006_render_shows_caret()
    {
        var text = "1;\n3 + ;";
        var r = Recovery.ParseProgram(text, 10);
        var lines = Recovery.Render(r.Diagnostics[0], text).Split('\n');
        Assert.AreEqual(3, lines.Length);
        StringAssert.StartsWith(lines[0], "line 2, col 5:");
        Assert.AreEqual("3 + ;", lines[1]);
        Assert.AreEqual("    ^", lines[2]);
    }
}
