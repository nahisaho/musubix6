using Lib;
namespace T;
public class CTests {
    /**
     * @id TEST-C-001
     * @verifies REQ-C-001
     */
    [Fact]
    public void test_c_001_add() { Assert.Equal(3, Calc.Add(1, 2)); }
}
