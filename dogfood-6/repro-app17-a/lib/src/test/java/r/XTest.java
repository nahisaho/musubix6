package r;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class XTest {
    /** @id TEST-X-1 @verifies REQ-X-1 */
    @Test void test_x_1_one() { assertEquals(1, V.one()); }
    /** @id TEST-X-10 @verifies REQ-X-10 */
    @Test void test_x_10_ten() { assertEquals(10, V.ten()); }
}
