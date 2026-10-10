using Microsoft.VisualStudio.TestTools.UnitTesting;
using ParserKit.Lang;

namespace ParserKit.Lang.Tests;

[TestClass]
public class GrammarErrorTests
{
    /** @id TEST-LNG-010 @verifies REQ-LNG-010 */
    [TestMethod]
    public void TEST_LNG_010_expected_set_excludes_whitespace()
    {
        foreach (var text in new[] { "", "1 +", "let x = 1 in", "(1 + 2" })
        {
            var r = Grammar.Parse(text);
            Assert.IsFalse(r.Ok, text);
            CollectionAssert.DoesNotContain(r.Error!.Expected.ToList(), "whitespace", text);
            CollectionAssert.DoesNotContain(r.Error.Expected.ToList(), "'#'", text);
            CollectionAssert.DoesNotContain(r.Error.Expected.ToList(), "comment", text);
        }
    }
}
