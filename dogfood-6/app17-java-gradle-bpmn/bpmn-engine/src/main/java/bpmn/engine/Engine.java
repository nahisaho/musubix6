package bpmn.engine;

import bpmn.model.Flow;
import bpmn.model.ModelValidator;
import bpmn.model.Node;
import bpmn.model.NodeType;
import bpmn.model.ProcessModel;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Engine {
    private final Map<String, TaskHandler> handlers = new HashMap<>();
    private int maxSteps = 1000;
    private int nextInstance = 1;
    private TimerHook timerHook;

    public Engine register(String name, TaskHandler h) { handlers.put(name, h); return this; }

    public Engine maxSteps(int n) { maxSteps = n; return this; }

    public Engine onTimer(TimerHook h) { timerHook = h; return this; }

    /** @id CODE-TOKENS-002 @implements REQ-TOKENS-001 REQ-TOKENS-002 */
    public Instance start(ProcessModel m, Map<String, Object> vars) {
        var issues = ModelValidator.validate(m);
        if (!issues.isEmpty())
            throw new IllegalArgumentException("invalid model: " + issues.stream().map(i -> i.code()).distinct().collect(Collectors.joining(",")));
        Instance i = new Instance("i" + nextInstance++, m, vars);
        Node start = m.nodes().stream().filter(n -> n.type() == NodeType.START).findFirst().orElseThrow();
        Token t = i.newToken(start.id());
        i.log("START", start.id(), t.id(), "");
        i.queue.add(t.id());
        run(i);
        return i;
    }

    /** @id CODE-TOKENS-003 @implements REQ-TOKENS-005 REQ-TOKENS-006 */
    public void complete(Instance i, String tokenId, Map<String, Object> vars) {
        Token t = i.token(tokenId);
        if (i.status() != Status.RUNNING) throw new IllegalStateException("instance is " + i.status());
        if (t == null || t.state() != TokenState.WAITING) throw new IllegalStateException("token not waiting: " + tokenId);
        i.mutableVars().putAll(vars);
        i.log("RESUME", t.nodeId(), t.id(), "");
        if (i.model().node(t.nodeId()).type() == NodeType.TASK) i.log("DONE", t.nodeId(), t.id(), "resumed");
        Token active = new Token(t.id(), t.nodeId(), TokenState.ACTIVE);
        i.put(active);
        move(i, active);
        run(i);
    }

    /** @id CODE-TOKENS-004 @implements REQ-TOKENS-011 */
    public boolean terminate(Instance i) {
        if (i.status() != Status.RUNNING) return false;
        consumeAll(i);
        i.setStatus(Status.TERMINATED);
        i.log("TERMINATE", null, null, "");
        return true;
    }

    /** @id CODE-TOKENS-006 @implements REQ-TOKENS-010 REQ-GATEWAYS-012 */
    private void run(Instance i) {
        while (i.status() == Status.RUNNING && !i.queue.isEmpty()) {
            Token t = i.token(i.queue.poll());
            if (t.state() != TokenState.ACTIVE) continue;
            if (++i.steps > maxSteps) { fail(i, t, "STEP_LIMIT: exceeded " + maxSteps + " steps"); break; }
            step(i, t);
        }
        if (i.status() == Status.RUNNING && !i.liveTokens().isEmpty() && i.liveTokens().stream().allMatch(x -> x.state() == TokenState.BLOCKED)) {
            String joins = i.liveTokens().stream().map(Token::nodeId).distinct().sorted().collect(Collectors.joining(","));
            fail(i, i.liveTokens().get(0), "DEADLOCK: " + joins);
        }
        if (i.status() == Status.RUNNING && i.liveTokens().isEmpty()) {
            i.setStatus(Status.COMPLETED);
            i.log("COMPLETE", null, null, "");
        }
    }

    /** @id CODE-TOKENS-005 @implements REQ-TOKENS-013 REQ-TOKENS-004 REQ-TOKENS-007 REQ-TOKENS-008 REQ-TOKENS-009 REQ-TOKENS-005 */
    /** @id CODE-TIMERS-006 @implements REQ-TIMERS-009 REQ-TIMERS-012 */
    private void step(Instance i, Token t) {
        Node n = i.model().node(t.nodeId());
        if (n.type() == NodeType.END) {
            i.put(new Token(t.id(), t.nodeId(), TokenState.CONSUMED));
            i.log("END", n.id(), t.id(), "");
            return;
        }
        if (n.type() == NodeType.TIMER) {
            try {
                if (timerHook != null) timerHook.arm(i, t, n);
            } catch (RuntimeException e) {
                fail(i, t, "BAD_TIMER: " + e.getMessage());
                return;
            }
            i.put(new Token(t.id(), t.nodeId(), TokenState.WAITING));
            i.log("WAIT", n.id(), t.id(), "TIMER");
            return;
        }
        if (join(i, t, n)) return;
        if (n.type() == NodeType.TASK) {
            String h = n.attrs().get("handler");
            if (h != null) {
                TaskHandler th = handlers.get(h);
                if (th == null) { fail(i, t, "NO_HANDLER: " + h); return; }
                try {
                    th.execute(n, i.mutableVars());
                } catch (Exception e) {
                    fail(i, t, String.valueOf(e.getMessage()));
                    return;
                }
            }
            if ("true".equals(n.attrs().get("wait"))) {
                i.put(new Token(t.id(), t.nodeId(), TokenState.WAITING));
                i.log("WAIT", n.id(), t.id(), "");
                return;
            }
            i.log("DONE", n.id(), t.id(), h == null ? "" : h);
        }
        move(i, t);
    }

    /** @id CODE-GATEWAYS-005 @implements REQ-GATEWAYS-006 REQ-GATEWAYS-007 REQ-GATEWAYS-008 REQ-GATEWAYS-009 REQ-GATEWAYS-013 */
    private void move(Instance i, Token t) {
        Node n = i.model().node(t.nodeId());
        List<Flow> out = i.model().outgoing(n.id());
        if (n.type() == NodeType.XOR && out.size() > 1) {
            Flow f = choose(i, t, out);
            if (f != null) advance(i, t, f);
        } else if (n.type() == NodeType.AND && out.size() > 1) {
            i.put(new Token(t.id(), t.nodeId(), TokenState.CONSUMED));
            List<String> ids = new java.util.ArrayList<>();
            for (Flow f : out) ids.add(advance(i, null, f).id());
            i.log("FORK", n.id(), t.id(), String.join(",", ids));
        } else if (out.size() != 1) {
            fail(i, t, "NO_ROUTE: " + t.nodeId() + " has " + out.size() + " outgoing flows");
        } else {
            advance(i, t, out.get(0));
        }
    }

    private Flow choose(Instance i, Token t, List<Flow> out) {
        Flow dflt = null;
        for (Flow f : out) {
            if (f.isDefault()) { dflt = f; continue; }
            if (f.condition() == null) continue;
            try {
                if (Boolean.TRUE.equals(Expr.parse(f.condition()).eval(i.mutableVars()))) return f;
            } catch (ExprException e) {
                fail(i, t, "EXPR_ERROR: " + e.code() + " " + e.getMessage());
                return null;
            }
        }
        if (dflt == null) fail(i, t, "NO_MATCH: " + t.nodeId());
        return dflt;
    }

    private Token advance(Instance i, Token t, Flow f) {
        Token moved = t == null ? i.newToken(f.to()) : new Token(t.id(), f.to(), TokenState.ACTIVE);
        i.put(moved);
        i.via.put(moved.id(), i.model().indexOf(f));
        i.log("ENTER", moved.nodeId(), moved.id(), "");
        i.queue.add(moved.id());
        return moved;
    }

    /** @id CODE-GATEWAYS-006 @implements REQ-GATEWAYS-010 REQ-GATEWAYS-011 REQ-GATEWAYS-014 */
    private boolean join(Instance i, Token t, Node n) {
        List<Flow> in = i.model().incoming(n.id());
        if (n.type() != NodeType.AND || in.size() < 2) return false;
        var arr = i.arrivals.computeIfAbsent(n.id(), k -> new java.util.LinkedHashMap<>());
        arr.computeIfAbsent(i.via.get(t.id()), k -> new java.util.ArrayDeque<>()).add(t.id());
        List<Integer> need = i.model().incomingIndexes(n.id());
        if (!need.stream().allMatch(k -> arr.containsKey(k) && !arr.get(k).isEmpty())) {
            i.put(new Token(t.id(), t.nodeId(), TokenState.BLOCKED));
            i.log("BLOCK", n.id(), t.id(), "");
            return true;
        }
        for (int k : need) {
            String id = arr.get(k).poll();
            Token w = i.token(id);
            i.put(new Token(w.id(), w.nodeId(), TokenState.CONSUMED));
        }
        Token fresh = i.newToken(n.id());
        i.log("JOIN", n.id(), fresh.id(), "");
        move(i, fresh);
        return true;
    }

    private void fail(Instance i, Token t, String detail) {
        i.log("FAIL", t.nodeId(), t.id(), detail);
        consumeAll(i);
        i.setStatus(Status.FAILED);
    }

    private void consumeAll(Instance i) {
        for (Token t : i.liveTokens()) i.put(new Token(t.id(), t.nodeId(), TokenState.CONSUMED));
        i.queue.clear();
        i.arrivals.clear();
    }
}
