import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class R3Test {
    /** @id TEST-R-004 @verifies REQ-R-004 */
    @Test
    void test_r_004_typed_local() {
        Calc c = new Calc();
        int prev = 0;
        for (int i = 1; i < 5; i++) {
            int r = c.twice(i);
            assertTrue(r > prev, "i=" + i);
            prev = r;
        }
    }
    /** @id TEST-R-005 @verifies REQ-R-005 */
    @Test
    void test_r_005_untyped_local() {
        Calc c = new Calc();
        var r = c.twice(2);
        assertEquals(4, r);
    }
}
