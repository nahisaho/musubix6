import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
class R2Test {
    /** @id TEST-R-003 @verifies REQ-R-003 */
    @Test
    void test_r_003_c() {
        Foo f = new Foo();
        List<String> out = new ArrayList<>();
        out.add("x");
        f.bar(1);
        assertTrue(f.ok());
        assertEquals(1, out.size());
    }
}
