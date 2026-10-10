package bpmn.engine;

import bpmn.model.ProcessParser;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class GatewaysTest {
    static Object ev(String e, Map<String, Object> v) { return Expr.parse(e).eval(v); }

    static Instance run(Engine en, String src, Map<String, Object> vars) { return en.start(ProcessParser.parse(src), vars); }

    static final String XOR = "process p\nstart s\nxor g\ntask a handler=ha\ntask b handler=hb\ntask c handler=hc\nxor m\nend e\n"
        + "flow s -> g\nflow g -> a when x > 10\nflow g -> b when x > 5\nflow g -> c default\nflow a -> m\nflow b -> m\nflow c -> m\nflow m -> e\n";

    static Engine recorder(List<String> log) {
        Engine en = new Engine();
        for (String n : List.of("ha", "hb", "hc", "h1", "h2")) en.register(n, (node, v) -> log.add(n));
        return en;
    }

    /** @id TEST-GATEWAYS-001 @verifies REQ-GATEWAYS-001 */
    @Test void test_gateways_001_literals_and_ops() {
        assertEquals(true, ev("1 < 2", Map.of()));
        assertEquals(false, ev("2 <= 1", Map.of()));
        assertEquals(true, ev("\"a\" == \"a\"", Map.of()));
        assertEquals(true, ev("name != \"bob\"", Map.of("name", "al")));
        assertEquals(true, ev("flag", Map.of("flag", true)));
        assertEquals(false, ev("false", Map.of()));
        assertEquals(true, ev("x >= 3", Map.of("x", 3)));
        assertEquals(true, ev("\"abc\" < \"abd\"", Map.of()));
    }

    /** @id TEST-GATEWAYS-002 @verifies REQ-GATEWAYS-002 */
    @Test void test_gateways_002_precedence() {
        assertEquals(true, ev("true || false && false", Map.of()));
        assertEquals(false, ev("(true || false) && false", Map.of()));
        assertEquals(true, ev("!false && true", Map.of()));
        assertEquals(false, ev("!(1 < 2)", Map.of()));
        assertEquals(true, ev("!!true", Map.of()));
    }

    /** @id TEST-GATEWAYS-003 @verifies REQ-GATEWAYS-003 */
    @Test void test_gateways_003_short_circuit() {
        assertEquals(false, ev("false && missing", Map.of()));
        assertEquals(true, ev("true || missing", Map.of()));
        assertThrows(ExprException.class, () -> ev("true && missing", Map.of()));
        assertThrows(ExprException.class, () -> ev("false || missing", Map.of()));
    }

    /** @id TEST-GATEWAYS-004 @verifies REQ-GATEWAYS-004 */
    @Test void test_gateways_004_errors() {
        assertEquals("UNDEFINED", assertThrows(ExprException.class, () -> ev("zz > 1", Map.of())).code());
        assertEquals("TYPE", assertThrows(ExprException.class, () -> ev("1 == \"1\"", Map.of())).code());
        assertEquals("TYPE", assertThrows(ExprException.class, () -> ev("true < false", Map.of())).code());
        assertEquals("SYNTAX", assertThrows(ExprException.class, () -> ev("1 < ", Map.of())).code());
        ExprException s = assertThrows(ExprException.class, () -> ev("1 < ) 2", Map.of()));
        assertEquals("SYNTAX", s.code());
        assertEquals(4, s.pos());
        assertEquals("SYNTAX", assertThrows(ExprException.class, () -> ev("(1 < 2", Map.of())).code());
        assertEquals("SYNTAX", assertThrows(ExprException.class, () -> ev("1 < 2 3", Map.of())).code());
        assertEquals("SYNTAX", assertThrows(ExprException.class, () -> ev("\"open", Map.of())).code());
        assertEquals("TYPE", assertThrows(ExprException.class, () -> ev("5", Map.of())).code());
    }

    /** @id TEST-GATEWAYS-005 @verifies REQ-GATEWAYS-005 */
    @Test void test_gateways_005_numeric_types() {
        assertEquals(true, ev("1 == 1.0", Map.of()));
        assertEquals(true, ev("a == b", Map.of("a", 2, "b", 2L)));
        assertEquals(true, ev("a < b", Map.of("a", 2, "b", 2.5)));
        assertEquals(true, ev("x > -1", Map.of("x", 0)));
        assertEquals(false, ev("a != b", Map.of("a", 3L, "b", 3.0)));
    }

    /** @id TEST-GATEWAYS-006 @verifies REQ-GATEWAYS-006 */
    @Test void test_gateways_006_first_match_wins() {
        List<String> log = new ArrayList<>();
        Instance i = run(recorder(log), XOR, Map.of("x", 20));
        assertEquals(List.of("ha"), log);
        assertEquals(Status.COMPLETED, i.status());
        log.clear();
        run(recorder(log), XOR, Map.of("x", 7));
        assertEquals(List.of("hb"), log);
    }

    /** @id TEST-GATEWAYS-007 @verifies REQ-GATEWAYS-007 */
    @Test void test_gateways_007_default_and_no_match() {
        List<String> log = new ArrayList<>();
        run(recorder(log), XOR, Map.of("x", 1));
        assertEquals(List.of("hc"), log);
        String noDefault = "process p\nstart s\nxor g\nend e\nend f\nflow s -> g\nflow g -> e when x > 1\nflow g -> f when x > 2\n";
        Instance i = run(new Engine(), noDefault, Map.of("x", 0));
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("NO_MATCH")));
    }

    /** @id TEST-GATEWAYS-008 @verifies REQ-GATEWAYS-008 */
    @Test void test_gateways_008_expr_error() {
        Instance i = run(new Engine(), XOR, Map.of());
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.type().equals("FAIL") && e.detail().startsWith("EXPR_ERROR") && e.detail().contains("UNDEFINED")));
    }

    static final String FORK_JOIN = "process p\nstart s\nand f\ntask a handler=h1\ntask b handler=h2\ntask c handler=h2\nand j\nend e\n"
        + "flow s -> f\nflow f -> a\nflow f -> b\nflow f -> c\nflow a -> j\nflow b -> j\nflow c -> j\nflow j -> e\n";

    /** @id TEST-GATEWAYS-009 @verifies REQ-GATEWAYS-009 */
    @Test void test_gateways_009_and_split() {
        List<String> log = new ArrayList<>();
        Instance i = run(recorder(log), FORK_JOIN, Map.of());
        assertEquals(List.of("h1", "h2", "h2"), log);
        List<String> forks = i.history().stream().filter(e -> e.type().equals("FORK")).map(Event::detail).toList();
        assertEquals(1, forks.size());
        assertEquals("t2,t3,t4", forks.get(0));
        assertEquals(TokenState.CONSUMED, i.tokens().get(0).state());
    }

    /** @id TEST-GATEWAYS-010 @verifies REQ-GATEWAYS-010 */
    @Test void test_gateways_010_and_join_once() {
        List<String> log = new ArrayList<>();
        Instance i = run(recorder(log), FORK_JOIN, Map.of());
        assertEquals(Status.COMPLETED, i.status());
        assertEquals(1, i.history().stream().filter(e -> e.type().equals("JOIN")).count());
        long atEnd = i.history().stream().filter(e -> e.type().equals("END")).count();
        assertEquals(1, atEnd);
        assertTrue(i.history().stream().filter(e -> e.type().equals("BLOCK")).count() >= 2);
        String twoFlows = "process p\nstart s\nand f\nand j\nend e\nflow s -> f\nflow f -> j\nflow f -> j\nflow j -> e\n";
        assertEquals(Status.COMPLETED, run(new Engine(), twoFlows, Map.of()).status());
    }

    /** @id TEST-GATEWAYS-011 @verifies REQ-GATEWAYS-011 */
    @Test void test_gateways_011_join_rearms_in_loop() {
        String loop = "process p\nstart s\nxor top\nand f\ntask a\ntask b handler=count\nand j\nxor chk\nend e\n"
            + "flow s -> top\nflow top -> f\nflow f -> a\nflow f -> b\nflow a -> j\nflow b -> j\nflow j -> chk\n"
            + "flow chk -> top when n < 3\nflow chk -> e default\n";
        Engine en = new Engine().register("count", (node, v) -> v.merge("n", 1, (x, y) -> (Integer) x + (Integer) y));
        Instance i = en.start(ProcessParser.parse(loop), Map.of("n", 0));
        assertEquals(Status.COMPLETED, i.status());
        assertEquals(3, i.variables().get("n"));
        assertEquals(3, i.history().stream().filter(e -> e.type().equals("JOIN")).count());
    }

    /** @id TEST-GATEWAYS-012 @verifies REQ-GATEWAYS-012 */
    @Test void test_gateways_012_deadlock() {
        String dead = "process p\nstart s\nxor g\ntask a\ntask b\nand j\nend e\n"
            + "flow s -> g\nflow g -> a when go\nflow g -> b default\nflow a -> j\nflow b -> j\nflow j -> e\n";
        Instance i = run(new Engine(), dead, Map.of("go", true));
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.type().equals("FAIL") && e.detail().equals("DEADLOCK: j")));
        assertTrue(i.liveTokens().isEmpty());
    }

    /** @id TEST-GATEWAYS-013 @verifies REQ-GATEWAYS-013 */
    @Test void test_gateways_013_xor_merge_passes_through() {
        List<String> log = new ArrayList<>();
        Instance i = run(recorder(log), XOR, Map.of("x", 20));
        assertEquals(1, i.history().stream().filter(e -> e.type().equals("END")).count());
        assertTrue(i.history().stream().noneMatch(e -> e.type().equals("BLOCK")));
    }

    /** @id TEST-GATEWAYS-014 @verifies REQ-GATEWAYS-014 */
    @Test void test_gateways_014_join_waits_for_external_branch() {
        String src = "process p\nstart s\nand f\ntask a wait=true\ntask b\nand j\nend e\n"
            + "flow s -> f\nflow f -> a\nflow f -> b\nflow a -> j\nflow b -> j\nflow j -> e\n";
        Engine en = new Engine();
        Instance i = run(en, src, Map.of());
        assertEquals(Status.RUNNING, i.status());
        assertEquals(List.of(TokenState.WAITING, TokenState.BLOCKED), i.liveTokens().stream().map(Token::state).toList());
        String waiting = i.liveTokens().get(0).id();
        en.complete(i, waiting, Map.of());
        assertEquals(Status.COMPLETED, i.status());
    }

    /** @id TEST-GATEWAYS-015 @verifies REQ-GATEWAYS-015 */
    @Test void test_gateways_015_malformed_number_is_syntax_error() {
        ExprException a = assertThrows(ExprException.class, () -> Expr.parse("x > 1.2.3"));
        assertEquals("SYNTAX", a.code());
        assertEquals(4, a.pos());
        assertEquals("SYNTAX", assertThrows(ExprException.class, () -> Expr.parse("1. < 2")).code());
        String src = "process p\nstart s\nxor g\nend e\nend f\nflow s -> g\nflow g -> e when x > 1.2.3\nflow g -> f default\n";
        Instance i = run(new Engine(), src, Map.of("x", 5));
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("EXPR_ERROR: SYNTAX")));
    }
}
