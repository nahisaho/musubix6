package bpmn.engine;

import bpmn.model.ProcessParser;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class TokensTest {
    static final String LINEAR = "process p\nstart s\ntask a\ntask b\nend e\nflow s -> a\nflow a -> b\nflow b -> e\n";

    static Instance run(Engine en, String src) { return en.start(ProcessParser.parse(src), Map.of()); }

    /** @id TEST-TOKENS-001 @verifies REQ-TOKENS-001 */
    @Test void test_tokens_001_linear_completes() {
        Instance i = run(new Engine(), LINEAR);
        assertEquals(Status.COMPLETED, i.status());
        assertEquals(1, i.tokens().size());
        assertEquals(TokenState.CONSUMED, i.tokens().get(0).state());
        assertEquals("e", i.tokens().get(0).nodeId());
    }

    /** @id TEST-TOKENS-002 @verifies REQ-TOKENS-002 */
    @Test void test_tokens_002_invalid_model_rejected() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
            () -> run(new Engine(), "process p\nstart s\ntask a\nflow s -> a\n"));
        assertTrue(ex.getMessage().contains("NO_END"));
    }

    /** @id TEST-TOKENS-003 @verifies REQ-TOKENS-003 */
    @Test void test_tokens_003_ids_and_seq() {
        Instance i = run(new Engine(), LINEAR);
        assertEquals("t1", i.tokens().get(0).id());
        List<Event> h = i.history();
        assertFalse(h.isEmpty());
        assertEquals(1, h.get(0).seq());
        for (int k = 1; k < h.size(); k++) assertEquals(h.get(k - 1).seq() + 1, h.get(k).seq());
    }

    /** @id TEST-TOKENS-004 @verifies REQ-TOKENS-004 */
    @Test void test_tokens_004_handler_invoked_once() {
        List<String> calls = new ArrayList<>();
        Engine en = new Engine().register("count", (node, vars) -> {
            calls.add(node.id());
            vars.merge("n", 1, (a, b) -> (Integer) a + (Integer) b);
        });
        Instance i = en.start(ProcessParser.parse("process p\nstart s\ntask a handler=count\ntask b handler=count\nend e\nflow s -> a\nflow a -> b\nflow b -> e\n"), Map.of());
        assertEquals(List.of("a", "b"), calls);
        assertEquals(2, i.variables().get("n"));
    }

    /** @id TEST-TOKENS-005 @verifies REQ-TOKENS-005 */
    @Test void test_tokens_005_wait_and_complete() {
        Engine en = new Engine();
        Instance i = run(en, "process p\nstart s\ntask a wait=true\nend e\nflow s -> a\nflow a -> e\n");
        assertEquals(Status.RUNNING, i.status());
        assertEquals(TokenState.WAITING, i.tokens().get(0).state());
        en.complete(i, "t1", Map.of("ok", true));
        assertEquals(Status.COMPLETED, i.status());
        assertEquals(true, i.variables().get("ok"));
    }

    /** @id TEST-TOKENS-006 @verifies REQ-TOKENS-006 */
    @Test void test_tokens_006_complete_illegal() {
        Engine en = new Engine();
        Instance i = run(en, "process p\nstart s\ntask a wait=true\nend e\nflow s -> a\nflow a -> e\n");
        assertThrows(IllegalStateException.class, () -> en.complete(i, "nope", Map.of()));
        en.complete(i, "t1", Map.of());
        assertThrows(IllegalStateException.class, () -> en.complete(i, "t1", Map.of("x", 1)));
        assertFalse(i.variables().containsKey("x"));
        Instance done = run(en, LINEAR);
        assertThrows(IllegalStateException.class, () -> en.complete(done, "t1", Map.of()));
    }

    /** @id TEST-TOKENS-007 @verifies REQ-TOKENS-007 */
    @Test void test_tokens_007_handler_failure() {
        Engine en = new Engine().register("boom", (n, v) -> { throw new IllegalStateException("kaboom"); });
        Instance i = run(en, "process p\nstart s\ntask a handler=boom\ntask b\nend e\nflow s -> a\nflow a -> b\nflow b -> e\n");
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.type().equals("FAIL") && e.detail().contains("kaboom")));
        assertTrue(i.history().stream().noneMatch(e -> "b".equals(e.nodeId())));
        assertTrue(i.liveTokens().isEmpty());
    }

    /** @id TEST-TOKENS-008 @verifies REQ-TOKENS-008 */
    @Test void test_tokens_008_missing_handler() {
        assertEquals(Status.COMPLETED, run(new Engine(), LINEAR).status());
        Instance i = run(new Engine(), "process p\nstart s\ntask a handler=ghost\nend e\nflow s -> a\nflow a -> e\n");
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.type().equals("FAIL") && e.detail().startsWith("NO_HANDLER")));
    }

    /** @id TEST-TOKENS-009 @verifies REQ-TOKENS-009 */
    @Test void test_tokens_009_no_route() {
        Instance i = run(new Engine(), "process p\nstart s\ntask a\ntask b\ntask c\nend e\nflow s -> a\nflow a -> b\nflow a -> c\nflow b -> e\nflow c -> e\n");
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("NO_ROUTE")));
    }

    /** @id TEST-TOKENS-010 @verifies REQ-TOKENS-010 */
    @Test void test_tokens_010_step_limit() {
        StringBuilder sb = new StringBuilder("process p\nstart s0\n");
        for (int k = 1; k <= 20; k++) sb.append("task a").append(k).append("\nflow ").append(k == 1 ? "s0" : "a" + (k - 1)).append(" -> a").append(k).append("\n");
        sb.append("end e\nflow a20 -> e\n");
        String loop = sb.toString();
        Instance i = run(new Engine().maxSteps(10), loop);
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("STEP_LIMIT")));
        assertEquals(Status.COMPLETED, run(new Engine().maxSteps(5), "process p\nstart s\nend e\nflow s -> e\n").status());
    }

    /** @id TEST-TOKENS-011 @verifies REQ-TOKENS-011 */
    @Test void test_tokens_011_terminate() {
        Engine en = new Engine();
        Instance i = run(en, "process p\nstart s\ntask a wait=true\nend e\nflow s -> a\nflow a -> e\n");
        assertTrue(en.terminate(i));
        assertEquals(Status.TERMINATED, i.status());
        assertTrue(i.liveTokens().isEmpty());
        assertFalse(en.terminate(i));
        assertFalse(en.terminate(run(en, LINEAR)));
    }

    /** @id TEST-TOKENS-012 @verifies REQ-TOKENS-012 */
    @Test void test_tokens_012_snapshots_unmodifiable() {
        Instance i = run(new Engine(), "process p\nstart s\ntask a wait=true\nend e\nflow s -> a\nflow a -> e\n");
        assertThrows(UnsupportedOperationException.class, () -> i.variables().put("k", 1));
        assertThrows(UnsupportedOperationException.class, () -> i.tokens().clear());
        assertThrows(UnsupportedOperationException.class, () -> i.history().clear());
        assertEquals(Status.RUNNING, i.status());
        assertEquals(1, i.liveTokens().size());
    }

    /** @id TEST-TOKENS-013 @verifies REQ-TOKENS-013 */
    @Test void test_tokens_013_done_event_per_task() {
        Engine en = new Engine().register("h", (n, v) -> { });
        Instance i = run(en, "process p\nstart s\ntask a\ntask b handler=h\ntask c wait=true\nend e\nflow s -> a\nflow a -> b\nflow b -> c\nflow c -> e\n");
        assertEquals(List.of("a", "b"), i.history().stream().filter(e -> e.type().equals("DONE")).map(Event::nodeId).toList());
        en.complete(i, "t1", Map.of());
        assertEquals(List.of("a", "b", "c"), i.history().stream().filter(e -> e.type().equals("DONE")).map(Event::nodeId).toList());
        int doneC = 0, enterNext = 0;
        for (Event e : i.history()) {
            if (e.type().equals("DONE") && "c".equals(e.nodeId())) doneC = e.seq();
            if (e.type().equals("ENTER") && "e".equals(e.nodeId())) enterNext = e.seq();
        }
        assertTrue(doneC > 0 && doneC < enterNext);
    }
}
