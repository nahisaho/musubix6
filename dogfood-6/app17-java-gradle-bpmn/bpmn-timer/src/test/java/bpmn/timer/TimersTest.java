package bpmn.timer;

import bpmn.engine.Engine;
import bpmn.engine.Instance;
import bpmn.engine.Status;
import bpmn.engine.TokenState;
import bpmn.model.ProcessParser;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class TimersTest {
    static Engine engine(ManualClock c, List<Long> marks) {
        return new Engine().register("mark", (n, v) -> marks.add(c.nowMillis()))
            .register("boom", (n, v) -> { throw new IllegalStateException("boom"); });
    }

    /** @id TEST-TIMERS-001 @verifies REQ-TIMERS-001 */
    @Test void test_timers_001_manual_clock() {
        ManualClock c = new ManualClock(1000);
        assertEquals(1000, c.nowMillis());
        c.advance(250);
        assertEquals(1250, c.nowMillis());
        c.advance(0);
        c.set(1250);
        assertThrows(IllegalArgumentException.class, () -> c.set(1249));
        assertThrows(IllegalArgumentException.class, () -> c.advance(-1));
        assertEquals(1250, c.nowMillis());
    }

    /** @id TEST-TIMERS-002 @verifies REQ-TIMERS-002 */
    @Test void test_timers_002_parse_valid() {
        assertEquals(5000, Durations.parse("PT5S"));
        assertEquals(60000, Durations.parse("PT1M"));
        assertEquals(3600000, Durations.parse("PT1H"));
        assertEquals(86400000, Durations.parse("P1D"));
        assertEquals(93784000L, Durations.parse("P1DT2H3M4S"));
        assertEquals(0, Durations.parse("PT0S"));
        assertEquals(90000, Durations.parse("PT1M30S"));
    }

    /** @id TEST-TIMERS-003 @verifies REQ-TIMERS-003 */
    @Test void test_timers_003_parse_invalid() {
        for (String bad : List.of("", "P", "PT", "5S", "PT5", "PT-5S", "PT1S1M", "PT1M1M", "P1H", "P1DT", "PT1.5M", "PT.5S", "p1d", "PT1S ", "P1D1D", "T5S"))
            assertThrows(IllegalArgumentException.class, () -> Durations.parse(bad), "should reject '" + bad + "'");
    }

    /** @id TEST-TIMERS-004 @verifies REQ-TIMERS-004 */
    @Test void test_timers_004_fraction_and_overflow() {
        assertEquals(1500, Durations.parse("PT1.5S"));
        assertEquals(1, Durations.parse("PT0.001S"));
        assertEquals(1250, Durations.parse("PT1.25S"));
        assertEquals(500, Durations.parse("PT0.5S"));
        assertThrows(IllegalArgumentException.class, () -> Durations.parse("PT1.2345S"));
        assertThrows(IllegalArgumentException.class, () -> Durations.parse("P999999999999999D"));
        assertThrows(IllegalArgumentException.class, () -> Durations.parse("PT9223372036854775807S"));
    }

    /** @id TEST-TIMERS-005 @verifies REQ-TIMERS-005 */
    @Test void test_timers_005_order_by_due_then_seq() {
        TimerQueue q = new TimerQueue();
        q.schedule("c", 30);
        q.schedule("a", 10);
        q.schedule("b2", 20);
        q.schedule("b1", 20);
        q.schedule("z", 5);
        assertEquals(List.of("z", "a", "b2", "b1", "c"), q.pollDue(100).stream().map(TimerQueue.Entry::id).toList());
        assertEquals(0, q.size());
    }

    /** @id TEST-TIMERS-006 @verifies REQ-TIMERS-006 */
    @Test void test_timers_006_cancel_and_duplicates() {
        TimerQueue q = new TimerQueue();
        q.schedule("a", 10);
        q.schedule("b", 20);
        assertThrows(IllegalArgumentException.class, () -> q.schedule("a", 99));
        assertTrue(q.cancel("a"));
        assertFalse(q.cancel("a"));
        assertFalse(q.cancel("nope"));
        assertEquals(1, q.size());
        q.schedule("a", 5);
        assertEquals(List.of("a", "b"), q.pollDue(50).stream().map(TimerQueue.Entry::id).toList());
    }

    /** @id TEST-TIMERS-007 @verifies REQ-TIMERS-007 */
    @Test void test_timers_007_poll_due_boundary() {
        TimerQueue q = new TimerQueue();
        q.schedule("a", 10);
        q.schedule("b", 11);
        assertEquals(List.of(), q.pollDue(9));
        assertEquals(List.of("a"), q.pollDue(10).stream().map(TimerQueue.Entry::id).toList());
        assertEquals(11L, q.nextDue());
        assertEquals(1, q.size());
        assertEquals(List.of("b"), q.pollDue(Long.MAX_VALUE).stream().map(TimerQueue.Entry::id).toList());
        assertNull(q.nextDue());
    }

    /** @id TEST-TIMERS-008 @verifies REQ-TIMERS-008 */
    @Test void test_timers_008_matches_reference_model() {
        Random r = new Random(42);
        TimerQueue q = new TimerQueue();
        List<long[]> model = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        long seq = 0, now = 0;
        for (int step = 0; step < 4000; step++) {
            int op = r.nextInt(10);
            String id = "k" + r.nextInt(60);
            if (op < 5) {
                boolean present = ids.contains(id);
                if (present) assertThrows(IllegalArgumentException.class, () -> q.schedule(id, 1));
                else {
                    long due = now + r.nextInt(40);
                    q.schedule(id, due);
                    ids.add(id);
                    model.add(new long[] {due, seq++, Long.parseLong(id.substring(1))});
                }
            } else if (op < 8) {
                boolean had = ids.remove(id);
                assertEquals(had, q.cancel(id));
                if (had) model.removeIf(m -> m[2] == Long.parseLong(id.substring(1)));
            } else {
                now += r.nextInt(8);
                final long nw = now;
                List<long[]> due = model.stream().filter(m -> m[0] <= nw).sorted((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1])).toList();
                List<String> got = q.pollDue(now).stream().map(TimerQueue.Entry::id).toList();
                assertEquals(due.stream().map(m -> "k" + m[2]).toList(), got);
                model.removeAll(due);
                for (String g : got) ids.remove(g);
            }
            assertEquals(model.size(), q.size());
        }
    }

    static final String CHAIN = "process p\nstart s\ntimer t1 duration=PT3S\ntask m1 handler=mark\ntimer t2 duration=PT5S\ntask m2 handler=mark\nend e\n"
        + "flow s -> t1\nflow t1 -> m1\nflow m1 -> t2\nflow t2 -> m2\nflow m2 -> e\n";

    /** @id TEST-TIMERS-009 @verifies REQ-TIMERS-009 */
    @Test void test_timers_009_timer_node_schedules() {
        ManualClock c = new ManualClock(1000);
        TimerService svc = new TimerService(engine(c, new ArrayList<>()), c);
        Instance i = svc.start(ProcessParser.parse(CHAIN), Map.of());
        assertEquals(Status.RUNNING, i.status());
        assertEquals(TokenState.WAITING, i.liveTokens().get(0).state());
        assertEquals(1, svc.pending());
        assertEquals(4000L, svc.nextDue());
    }

    /** @id TEST-TIMERS-010 @verifies REQ-TIMERS-010 */
    @Test void test_timers_010_advance_fires_in_order_and_chains() {
        ManualClock c = new ManualClock(0);
        List<Long> marks = new ArrayList<>();
        TimerService svc = new TimerService(engine(c, marks), c);
        Instance i = svc.start(ProcessParser.parse(CHAIN), Map.of());
        svc.advanceTo(2999);
        assertEquals(List.of(), marks);
        assertEquals(2999, c.nowMillis());
        svc.advanceTo(20000);
        assertEquals(List.of(3000L, 8000L), marks);
        assertEquals(20000, c.nowMillis());
        assertEquals(Status.COMPLETED, i.status());
        assertThrows(IllegalArgumentException.class, () -> svc.advanceTo(10));
    }

    /** @id TEST-TIMERS-011 @verifies REQ-TIMERS-011 */
    @Test void test_timers_011_terminate_and_stale() {
        ManualClock c = new ManualClock(0);
        TimerService svc = new TimerService(engine(c, new ArrayList<>()), c);
        Instance i = svc.start(ProcessParser.parse(CHAIN), Map.of());
        assertTrue(svc.terminate(i));
        assertEquals(0, svc.pending());
        svc.advanceTo(100000);
        assertEquals(Status.TERMINATED, i.status());
        String src = "process p\nstart s\nand f\ntimer ta duration=PT5S\ntask x handler=boom\nend e1\ntimer tb duration=PT8S\nend e2\n"
            + "flow s -> f\nflow f -> ta\nflow ta -> x\nflow x -> e1\nflow f -> tb\nflow tb -> e2\n";
        Instance j = svc.start(ProcessParser.parse(src), Map.of());
        assertEquals(2, svc.pending());
        svc.advanceTo(200000);
        assertEquals(Status.FAILED, j.status());
        assertEquals(0, svc.pending());
        assertTrue(j.history().stream().noneMatch(e -> e.type().equals("END")));
    }

    /** @id TEST-TIMERS-012 @verifies REQ-TIMERS-012 */
    @Test void test_timers_012_bad_duration() {
        ManualClock c = new ManualClock(0);
        TimerService svc = new TimerService(engine(c, new ArrayList<>()), c);
        for (String attr : List.of("duration=bogus", "", "duration=PT")) {
            Instance i = svc.start(ProcessParser.parse("process p\nstart s\ntimer t " + attr + "\nend e\nflow s -> t\nflow t -> e\n"), Map.of());
            assertEquals(Status.FAILED, i.status(), attr);
            assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("BAD_TIMER")));
        }
        assertEquals(0, svc.pending());
    }

    /** @id TEST-TIMERS-013 @verifies REQ-TIMERS-013 */
    @Test void test_timers_013_join_waits_for_timer() {
        ManualClock c = new ManualClock(0);
        TimerService svc = new TimerService(engine(c, new ArrayList<>()), c);
        String src = "process p\nstart s\nand f\ntimer ta duration=PT5S\ntask b\nand j\nend e\n"
            + "flow s -> f\nflow f -> ta\nflow f -> b\nflow ta -> j\nflow b -> j\nflow j -> e\n";
        Instance i = svc.start(ProcessParser.parse(src), Map.of());
        assertEquals(Status.RUNNING, i.status());
        svc.advanceTo(4999);
        assertEquals(Status.RUNNING, i.status());
        svc.advanceTo(5000);
        assertEquals(Status.COMPLETED, i.status());
    }

    /** @id TEST-TIMERS-014 @verifies REQ-TIMERS-014 */
    @Test void test_timers_014_clock_overflow() {
        ManualClock c = new ManualClock(Long.MAX_VALUE - 5);
        assertThrows(IllegalArgumentException.class, () -> c.advance(10));
        assertEquals(Long.MAX_VALUE - 5, c.nowMillis());
        c.advance(5);
        assertEquals(Long.MAX_VALUE, c.nowMillis());
        ManualClock late = new ManualClock(Long.MAX_VALUE - 1000);
        TimerService svc = new TimerService(engine(late, new ArrayList<>()), late);
        Instance i = svc.start(ProcessParser.parse("process p\nstart s\ntimer t duration=PT5S\nend e\nflow s -> t\nflow t -> e\n"), Map.of());
        assertEquals(Status.FAILED, i.status());
        assertTrue(i.history().stream().anyMatch(e -> e.detail().startsWith("BAD_TIMER")));
    }
}
