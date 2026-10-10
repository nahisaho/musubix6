package bpmn.model;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ModelTest {
    static final String SIMPLE = "process p1\nstart s\ntask a\nend e\nflow s -> a\nflow a -> e\n";

    static List<String> codes(String src) {
        return ModelValidator.validate(ProcessParser.parse(src)).stream().map(Issue::code).toList();
    }

    /** @id TEST-MODEL-001 @verifies REQ-MODEL-001 */
    @Test void test_model_001_parse_simple() {
        ProcessModel m = ProcessParser.parse(SIMPLE);
        assertEquals("p1", m.id());
        assertEquals(List.of("s", "a", "e"), m.nodes().stream().map(Node::id).toList());
        assertEquals(NodeType.TASK, m.node("a").type());
        assertEquals(2, m.flows().size());
        assertEquals("a", m.flows().get(0).to());
        assertEquals(1, m.outgoing("s").size());
        assertEquals(1, m.incoming("e").size());
    }

    /** @id TEST-MODEL-002 @verifies REQ-MODEL-002 */
    @Test void test_model_002_comments_and_blanks() {
        ProcessModel m = ProcessParser.parse("# c\n\nprocess p\n   \nstart s\n# x\nend e\nflow s -> e\n");
        assertEquals(2, m.nodes().size());
    }

    /** @id TEST-MODEL-003 @verifies REQ-MODEL-003 */
    @Test void test_model_003_parse_error_line() {
        ParseException ex = assertThrows(ParseException.class, () -> ProcessParser.parse("process p\nstart s\nbogus x y\n"));
        assertEquals(3, ex.line());
        ParseException ex2 = assertThrows(ParseException.class, () -> ProcessParser.parse("process p\nflow a b\n"));
        assertEquals(2, ex2.line());
        assertThrows(ParseException.class, () -> ProcessParser.parse("start s\n"));
    }

    /** @id TEST-MODEL-004 @verifies REQ-MODEL-004 */
    @Test void test_model_004_attributes() {
        ProcessModel m = ProcessParser.parse("process p\ntask a name=\"Ship it # now\" retries=3 compensate=undo\n");
        Node a = m.node("a");
        assertEquals("Ship it # now", a.attrs().get("name"));
        assertEquals("3", a.attrs().get("retries"));
        assertEquals("undo", a.attrs().get("compensate"));
        assertThrows(ParseException.class, () -> ProcessParser.parse("process p\ntask a name=\"open\n"));
    }

    /** @id TEST-MODEL-005 @verifies REQ-MODEL-005 */
    @Test void test_model_005_flow_conditions() {
        ProcessModel m = ProcessParser.parse("process p\nxor g\nflow g -> a when amount > 100 && region == \"EU\"\nflow g -> b default\nflow g -> c\n");
        assertEquals("amount > 100 && region == \"EU\"", m.flows().get(0).condition());
        assertFalse(m.flows().get(0).isDefault());
        assertTrue(m.flows().get(1).isDefault());
        assertNull(m.flows().get(2).condition());
    }

    /** @id TEST-MODEL-006 @verifies REQ-MODEL-006 */
    @Test void test_model_006_duplicate_id() {
        List<Issue> is = ModelValidator.validate(ProcessParser.parse("process p\nstart s\ntask a\ntask a\nend e\nflow s -> a\nflow a -> e\n"));
        assertEquals(List.of("DUPLICATE_ID"), is.stream().map(Issue::code).toList());
        assertEquals("a", is.get(0).subject());
    }

    /** @id TEST-MODEL-007 @verifies REQ-MODEL-007 */
    @Test void test_model_007_unknown_node() {
        List<Issue> is = ModelValidator.validate(ProcessParser.parse(SIMPLE + "flow a -> zz\nflow qq -> e\n"));
        assertEquals(List.of("zz", "qq"), is.stream().filter(i -> i.code().equals("UNKNOWN_NODE")).map(Issue::subject).sorted(java.util.Comparator.reverseOrder()).toList());
    }

    /** @id TEST-MODEL-008 @verifies REQ-MODEL-008 */
    @Test void test_model_008_start_and_end() {
        assertTrue(codes("process p\nstart s1\nstart s2\nend e\nflow s1 -> e\nflow s2 -> e\n").contains("START_COUNT"));
        assertTrue(codes("process p\ntask a\nend e\nflow a -> e\n").contains("START_COUNT"));
        assertTrue(codes("process p\nstart s\ntask a\nflow s -> a\n").contains("NO_END"));
        assertEquals(List.of(), codes(SIMPLE));
    }

    /** @id TEST-MODEL-009 @verifies REQ-MODEL-009 */
    @Test void test_model_009_reachability() {
        List<String> c = codes("process p\nstart s\ntask a\ntask orphan\ntask sink\nend e\nflow s -> a\nflow a -> e\nflow a -> sink\nflow orphan -> e\n");
        assertTrue(c.contains("UNREACHABLE"));
        assertTrue(c.contains("DEAD_END"));
        List<Issue> is = ModelValidator.validate(ProcessParser.parse("process p\nstart s\ntask a\ntask b\nend e\nflow s -> a\nflow a -> b\nflow b -> a\nflow a -> e\n"));
        assertEquals(List.of(), is);
    }

    /** @id TEST-MODEL-010 @verifies REQ-MODEL-010 */
    @Test void test_model_010_xor_flows() {
        String base = "process p\nstart s\nxor g\nend e\ntask a\nflow s -> g\nflow a -> e\n";
        assertTrue(codes(base + "flow g -> a default\nflow g -> e default\n").contains("XOR_FLOWS"));
        assertTrue(codes(base + "flow g -> a when x > 1\nflow g -> e\n").contains("XOR_FLOWS"));
        assertFalse(codes(base + "flow g -> a when x > 1\nflow g -> e default\n").contains("XOR_FLOWS"));
        assertFalse(codes(base + "flow g -> a\n").contains("XOR_FLOWS"));
    }

    /** @id TEST-MODEL-011 @verifies REQ-MODEL-011 */
    @Test void test_model_011_and_mixed() {
        String src = "process p\nstart s\nstart s2\ntask t\nand g\nend e\nend e2\nflow s -> g\nflow s2 -> g\nflow g -> e\nflow g -> e2\nflow t -> e\n";
        assertTrue(codes(src).contains("AND_MIXED"));
        assertFalse(codes("process p\nstart s\nand f\ntask a\ntask b\nand j\nend e\nflow s -> f\nflow f -> a\nflow f -> b\nflow a -> j\nflow b -> j\nflow j -> e\n").contains("AND_MIXED"));
    }

    /** @id TEST-MODEL-012 @verifies REQ-MODEL-012 */
    @Test void test_model_012_sorted_issues() {
        List<Issue> is = ModelValidator.validate(ProcessParser.parse("process p\nstart s\ntask z\ntask b\ntask b\nflow s -> z\n"));
        List<String> keys = is.stream().map(i -> i.code() + ":" + i.subject()).toList();
        assertEquals(keys.stream().sorted().toList(), keys);
        assertTrue(keys.size() >= 3);
        assertEquals(is, ModelValidator.validate(ProcessParser.parse("process p\nstart s\ntask z\ntask b\ntask b\nflow s -> z\n")));
    }
}
