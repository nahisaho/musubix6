package bpmn.comp;

import bpmn.engine.Engine;
import bpmn.engine.Instance;
import bpmn.engine.Status;
import bpmn.model.ProcessParser;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class CompTest {
    final List<String> forward = new ArrayList<>();
    final List<String> undone = new ArrayList<>();

    Engine engine() {
        Engine en = new Engine();
        for (String n : List.of("fa", "fb", "fc")) en.register(n, (node, v) -> forward.add(node.id()));
        en.register("boom", (n, v) -> { throw new IllegalStateException("forward failed"); });
        en.register("incr", (n, v) -> { forward.add(n.id()); v.merge("n", 1, (x, y) -> (Integer) x + (Integer) y); });
        return en;
    }

    CompensationService svc(Engine en) {
        CompensationService s = new CompensationService(en);
        for (String n : List.of("undoA", "undoB", "undoC")) s.register(n, (node, v) -> undone.add(node.id()));
        return s;
    }

    static final String SEQ3 = "process p\nstart s\ntask a handler=fa compensate=undoA\ntask b handler=fb compensate=undoB\ntask c handler=fc compensate=undoC\nend e\n"
        + "flow s -> a\nflow a -> b\nflow b -> c\nflow c -> e\n";

    static Instance go(CompensationService s, String src, Map<String, Object> vars) { return s.start(ProcessParser.parse(src), vars); }

    /** @id TEST-COMP-001 @verifies REQ-COMP-001 */
    @Test void test_comp_001_log_entry_recorded() {
        CompensationService s = svc(engine());
        Instance i = go(s, SEQ3, Map.of());
        List<LogEntry> log = s.log(i);
        assertEquals(List.of("a", "b", "c"), log.stream().map(LogEntry::taskId).toList());
        assertEquals(EntryState.PENDING, log.get(0).state());
        int seqA = i.history().stream().filter(e -> e.type().equals("DONE") && e.nodeId().equals("a")).findFirst().orElseThrow().seq();
        assertEquals(seqA, log.get(0).seq());
        assertEquals("t1", log.get(0).tokenId());
        assertTrue(log.get(0).seq() < log.get(1).seq() && log.get(1).seq() < log.get(2).seq());
    }

    /** @id TEST-COMP-002 @verifies REQ-COMP-002 */
    @Test void test_comp_002_reverse_order_once() {
        CompensationService s = svc(engine());
        Instance i = go(s, SEQ3, Map.of());
        CompensationResult r = s.compensate(i);
        assertEquals(List.of("c", "b", "a"), undone);
        assertEquals(3, r.outcomes().size());
        assertEquals(List.of("c", "b", "a"), r.outcomes().stream().map(Outcome::taskId).toList());
        assertTrue(r.allCompensated());
        assertEquals(Status.COMPLETED, i.status());
    }

    /** @id TEST-COMP-003 @verifies REQ-COMP-003 */
    @Test void test_comp_003_only_annotated_tasks() {
        CompensationService s = svc(engine());
        Instance i = go(s, "process p\nstart s\ntask a handler=fa compensate=undoA\ntask plain handler=fb\ntask other\nend e\nflow s -> a\nflow a -> plain\nflow plain -> other\nflow other -> e\n", Map.of());
        assertEquals(1, s.log(i).size());
        s.compensate(i);
        assertEquals(List.of("a"), undone);
    }

    /** @id TEST-COMP-004 @verifies REQ-COMP-004 */
    @Test void test_comp_004_missing_handler() {
        CompensationService s = new CompensationService(engine());
        s.register("undoA", (n, v) -> undone.add(n.id()));
        s.register("undoC", (n, v) -> undone.add(n.id()));
        Instance i = go(s, SEQ3, Map.of());
        CompensationResult r = s.compensate(i);
        assertEquals(List.of("c", "a"), undone);
        assertEquals(EntryState.MISSING_HANDLER, r.outcomes().get(1).state());
        assertTrue(r.outcomes().get(1).detail().contains("undoB"));
        assertFalse(r.allCompensated());
    }

    /** @id TEST-COMP-005 @verifies REQ-COMP-005 */
    @Test void test_comp_005_handler_failure_continues() {
        CompensationService s = svc(engine());
        s.register("undoB", (n, v) -> { throw new IllegalStateException("cannot undo b"); });
        Instance i = go(s, SEQ3, Map.of());
        CompensationResult r = s.compensate(i);
        assertEquals(List.of("c", "a"), undone);
        assertEquals(EntryState.FAILED, r.outcomes().get(1).state());
        assertEquals("cannot undo b", r.outcomes().get(1).detail());
        assertFalse(r.allCompensated());
    }

    /** @id TEST-COMP-006 @verifies REQ-COMP-006 */
    @Test void test_comp_006_retry_only_failed() {
        CompensationService s = svc(engine());
        s.register("undoB", (n, v) -> { throw new IllegalStateException("down"); });
        Instance i = go(s, SEQ3, Map.of());
        s.compensate(i);
        undone.clear();
        s.register("undoB", (n, v) -> undone.add(n.id()));
        CompensationResult r2 = s.compensate(i);
        assertEquals(List.of("b"), undone);
        assertEquals(1, r2.outcomes().size());
        assertTrue(r2.allCompensated());
        undone.clear();
        assertEquals(0, s.compensate(i).outcomes().size());
        assertEquals(List.of(), undone);
        assertTrue(s.log(i).stream().allMatch(e -> e.state() == EntryState.COMPENSATED));
    }

    /** @id TEST-COMP-007 @verifies REQ-COMP-007 */
    @Test void test_comp_007_parallel_global_order() {
        String src = "process p\nstart s\nand f\ntask a wait=true compensate=undoA\ntask b handler=fb compensate=undoB\nand j\ntask c handler=fc compensate=undoC\nend e\n"
            + "flow s -> f\nflow f -> a\nflow f -> b\nflow a -> j\nflow b -> j\nflow j -> c\nflow c -> e\n";
        Engine en = engine();
        CompensationService s = svc(en);
        Instance i = go(s, src, Map.of());
        en.complete(i, "t2", Map.of());
        assertEquals(Status.COMPLETED, i.status());
        s.compensate(i);
        assertEquals(List.of("c", "a", "b"), undone);
    }

    /** @id TEST-COMP-008 @verifies REQ-COMP-008 */
    @Test void test_comp_008_loop_each_completion() {
        String src = "process p\nstart s\nxor top\ntask a handler=incr compensate=undoA\nxor chk\nend e\n"
            + "flow s -> top\nflow top -> a\nflow a -> chk\nflow chk -> top when n < 3\nflow chk -> e default\n";
        CompensationService s = svc(engine());
        Instance i = go(s, src, Map.of("n", 0));
        assertEquals(3, s.log(i).size());
        s.compensate(i);
        assertEquals(List.of("a", "a", "a"), undone);
        List<Integer> seqs = s.log(i).stream().map(LogEntry::seq).toList();
        assertEquals(3, seqs.stream().distinct().count());
    }

    /** @id TEST-COMP-009 @verifies REQ-COMP-009 */
    @Test void test_comp_009_cancel_and_failed() {
        Engine en = engine();
        CompensationService s = svc(en);
        String waitSrc = "process p\nstart s\ntask a handler=fa compensate=undoA\ntask w wait=true compensate=undoB\nend e\nflow s -> a\nflow a -> w\nflow w -> e\n";
        Instance i = go(s, waitSrc, Map.of());
        assertEquals(Status.RUNNING, i.status());
        CompensationResult r = s.cancel(i);
        assertEquals(Status.TERMINATED, i.status());
        assertEquals(List.of("a"), undone);
        assertTrue(r.allCompensated());
        undone.clear();
        String failSrc = "process p\nstart s\ntask a handler=fa compensate=undoA\ntask x handler=boom\nend e\nflow s -> a\nflow a -> x\nflow x -> e\n";
        Instance j = go(s, failSrc, Map.of());
        assertEquals(Status.FAILED, j.status());
        s.compensate(j);
        assertEquals(List.of("a"), undone);
    }

    /** @id TEST-COMP-010 @verifies REQ-COMP-010 */
    @Test void test_comp_010_compensate_running_rejected() {
        CompensationService s = svc(engine());
        Instance i = go(s, "process p\nstart s\ntask a handler=fa compensate=undoA\ntask w wait=true\nend e\nflow s -> a\nflow a -> w\nflow w -> e\n", Map.of());
        assertThrows(IllegalStateException.class, () -> s.compensate(i));
        assertEquals(List.of(), undone);
        assertEquals(Status.RUNNING, i.status());
    }

    /** @id TEST-COMP-011 @verifies REQ-COMP-011 */
    @Test void test_comp_011_failed_and_waiting_not_logged() {
        Engine en = engine();
        CompensationService s = svc(en);
        Instance f = go(s, "process p\nstart s\ntask a handler=boom compensate=undoA\nend e\nflow s -> a\nflow a -> e\n", Map.of());
        assertEquals(Status.FAILED, f.status());
        assertEquals(0, s.log(f).size());
        Instance w = go(s, "process p\nstart s\ntask a wait=true compensate=undoA\nend e\nflow s -> a\nflow a -> e\n", Map.of());
        assertEquals(0, s.log(w).size());
        en.complete(w, "t1", Map.of());
        assertEquals(1, s.log(w).size());
        assertEquals("a", s.log(w).get(0).taskId());
    }

    /** @id TEST-COMP-012 @verifies REQ-COMP-012 */
    @Test void test_comp_012_handler_sees_current_vars() {
        Engine en = new Engine().register("set", (n, v) -> v.put("order", 42));
        CompensationService s = new CompensationService(en);
        List<Object> seen = new ArrayList<>();
        s.register("undo", (n, v) -> seen.add(v.get("order")));
        Instance i = go(s, "process p\nstart s\ntask a handler=set compensate=undo\nend e\nflow s -> a\nflow a -> e\n", Map.of());
        s.compensate(i);
        assertEquals(List.of(42), seen);
    }
}
