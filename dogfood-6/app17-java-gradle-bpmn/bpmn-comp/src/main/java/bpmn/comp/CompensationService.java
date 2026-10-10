package bpmn.comp;

import bpmn.engine.Engine;
import bpmn.engine.Event;
import bpmn.engine.Instance;
import bpmn.engine.Status;
import bpmn.model.Node;
import bpmn.model.ProcessModel;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

public class CompensationService {
    private static final class Entry {
        final String taskId, tokenId;
        final int seq;
        EntryState state = EntryState.PENDING;
        String detail = "";

        Entry(String taskId, String tokenId, int seq) { this.taskId = taskId; this.tokenId = tokenId; this.seq = seq; }

        LogEntry view() { return new LogEntry(taskId, tokenId, seq, state, detail); }
    }

    private final Engine engine;
    private final Map<String, CompensationHandler> handlers = new HashMap<>();
    private final Map<Instance, List<Entry>> logs = new IdentityHashMap<>();

    public CompensationService(Engine engine) { this.engine = engine; }

    public CompensationService register(String name, CompensationHandler h) { handlers.put(name, h); return this; }

    public Instance start(ProcessModel m, Map<String, Object> vars) { return engine.start(m, vars); }

    /** @id CODE-COMP-001 @implements REQ-COMP-001 REQ-COMP-003 REQ-COMP-008 REQ-COMP-011 */
    private List<Entry> sync(Instance i) {
        List<Entry> log = logs.computeIfAbsent(i, k -> new ArrayList<>());
        int last = log.isEmpty() ? 0 : log.get(log.size() - 1).seq;
        for (Event e : i.history()) {
            if (!e.type().equals("DONE") || e.seq() <= last) continue;
            Node n = i.model().node(e.nodeId());
            if (n.attrs().containsKey("compensate")) log.add(new Entry(n.id(), e.tokenId(), e.seq()));
        }
        return log;
    }

    public List<LogEntry> log(Instance i) { return sync(i).stream().map(Entry::view).toList(); }

    /** @id CODE-COMP-002 @implements REQ-COMP-002 REQ-COMP-004 REQ-COMP-005 REQ-COMP-006 REQ-COMP-007 REQ-COMP-010 REQ-COMP-012 */
    public CompensationResult compensate(Instance i) {
        if (i.status() == Status.RUNNING) throw new IllegalStateException("instance " + i.id() + " is still RUNNING; cancel it first");
        List<Entry> log = sync(i);
        List<Outcome> out = new ArrayList<>();
        for (int k = log.size() - 1; k >= 0; k--) {
            Entry e = log.get(k);
            if (e.state == EntryState.COMPENSATED) continue;
            Node n = i.model().node(e.taskId);
            String name = n.attrs().get("compensate");
            CompensationHandler h = handlers.get(name);
            if (h == null) {
                e.state = EntryState.MISSING_HANDLER;
                e.detail = "no handler registered: " + name;
            } else {
                try {
                    h.compensate(n, i.variables());
                    e.state = EntryState.COMPENSATED;
                    e.detail = "";
                } catch (Exception ex) {
                    e.state = EntryState.FAILED;
                    e.detail = String.valueOf(ex.getMessage());
                }
            }
            out.add(new Outcome(e.taskId, e.tokenId, e.seq, e.state, e.detail));
        }
        return new CompensationResult(List.copyOf(out));
    }

    /** @id CODE-COMP-003 @implements REQ-COMP-009 */
    public CompensationResult cancel(Instance i) {
        engine.terminate(i);
        return compensate(i);
    }
}
