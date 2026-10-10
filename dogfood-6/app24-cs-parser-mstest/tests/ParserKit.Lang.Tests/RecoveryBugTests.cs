using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit.Lang;

namespace ParserKit.Lang.Tests;

[TestClass]
public class RecoveryBugTests
{
    /** @id TEST-REC-007 @verifies REQ-REC-007 */
    [TestMethod]
    public void TEST_REC_007_comment_only_statement_is_ignored()
    {
        var r = Recovery.ParseProgram("1; # note\n; 2;\n# trailing comment", 10);
        Assert.AreEqual(0, r.Diagnostics.Count);
        Assert.AreEqual(2, r.Statements.Count);
    }
}
