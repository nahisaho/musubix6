package bpmn.timer;

import bpmn.engine.Engine;
import bpmn.engine.Instance;
import bpmn.engine.Status;
import bpmn.engine.Token;
import bpmn.engine.TokenState;
import bpmn.model.Node;
import bpmn.model.ProcessModel;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class TimerService {
    private final Engine engine;
    private final Clock clock;
    private final ManualClockAccess access;
    private final TimerQueue queue = new TimerQueue();
    private final Map<String, Instance> instances = new HashMap<>();
    private final Map<String, Set<String>> keysByInstance = new HashMap<>();

    private interface ManualClockAccess { void set(long t); }

    /** @id CODE-TIMERS-005 @implements REQ-TIMERS-009 */
    public TimerService(Engine engine, Clock clock) {
        this.engine = engine;
        this.clock = clock;
        this.access = clock instanceof ManualClock m ? m::set : t -> { throw new IllegalArgumentException("clock is not settable"); };
        engine.onTimer(this::arm);
    }

    public Instance start(ProcessModel m, Map<String, Object> vars) { return engine.start(m, vars); }

    private void arm(Instance i, Token t, Node n) {
        String d = n.attrs().get("duration");
        if (d == null) throw new IllegalArgumentException("timer " + n.id() + " has no duration");
        long due = Math.addExact(clock.nowMillis(), Durations.parse(d));
        String key = i.id() + "/" + t.id();
        queue.schedule(key, due);
        instances.put(i.id(), i);
        keysByInstance.computeIfAbsent(i.id(), k -> new HashSet<>()).add(key);
    }

    /** @id CODE-TIMERS-007 @implements REQ-TIMERS-010 REQ-TIMERS-013 */
    public void advanceTo(long target) {
        if (target < clock.nowMillis()) throw new IllegalArgumentException("cannot advance backwards to " + target);
        Long next;
        while ((next = queue.nextDue()) != null && next <= target) {
            access.set(Math.max(next, clock.nowMillis()));
            for (TimerQueue.Entry e : queue.pollDue(clock.nowMillis())) fire(e.id());
        }
        access.set(target);
    }

    private void fire(String key) {
        int slash = key.indexOf('/');
        String iid = key.substring(0, slash), tid = key.substring(slash + 1);
        Set<String> keys = keysByInstance.get(iid);
        if (keys != null) keys.remove(key);
        Instance i = instances.get(iid);
        if (i == null || i.status() != Status.RUNNING) return;
        boolean waiting = i.liveTokens().stream().anyMatch(t -> t.id().equals(tid) && t.state() == TokenState.WAITING);
        if (waiting) engine.complete(i, tid, Map.of());
    }

    /** @id CODE-TIMERS-008 @implements REQ-TIMERS-011 */
    public boolean terminate(Instance i) {
        boolean r = engine.terminate(i);
        for (String k : keysByInstance.getOrDefault(i.id(), Set.of())) queue.cancel(k);
        keysByInstance.remove(i.id());
        return r;
    }

    public int pending() { return queue.size(); }

    public Long nextDue() { return queue.nextDue(); }
}
