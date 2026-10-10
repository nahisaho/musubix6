package bpmn.engine;

import bpmn.model.ProcessModel;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** @id CODE-TOKENS-001 @implements REQ-TOKENS-012 REQ-TOKENS-003 */
public class Instance {
    private final String id;
    private final ProcessModel model;
    private final Map<String, Token> tokens = new LinkedHashMap<>();
    private final Map<String, Object> vars = new LinkedHashMap<>();
    private final java.util.ArrayList<Event> history = new java.util.ArrayList<>();
    final Deque<String> queue = new ArrayDeque<>();
    private Status status = Status.RUNNING;
    private int nextToken = 1;
    int steps;
    final Map<String, Integer> via = new LinkedHashMap<>();
    final Map<String, Map<Integer, Deque<String>>> arrivals = new LinkedHashMap<>();

    Instance(String id, ProcessModel model, Map<String, Object> vars) {
        this.id = id;
        this.model = model;
        this.vars.putAll(vars);
    }

    public String id() { return id; }
    public ProcessModel model() { return model; }
    public Status status() { return status; }
    public List<Token> tokens() { return List.copyOf(tokens.values()); }
    public List<Token> liveTokens() { return tokens.values().stream().filter(t -> t.state() != TokenState.CONSUMED).toList(); }
    public Map<String, Object> variables() { return Collections.unmodifiableMap(new LinkedHashMap<>(vars)); }
    public List<Event> history() { return List.copyOf(history); }

    Map<String, Object> mutableVars() { return vars; }
    void setStatus(Status s) { status = s; }
    Token token(String id) { return tokens.get(id); }

    Token newToken(String nodeId) {
        Token t = new Token("t" + nextToken++, nodeId, TokenState.ACTIVE);
        tokens.put(t.id(), t);
        return t;
    }

    void put(Token t) { tokens.put(t.id(), t); }

    Event log(String type, String nodeId, String tokenId, String detail) {
        Event e = new Event(history.size() + 1, type, nodeId, tokenId, detail);
        history.add(e);
        return e;
    }
}
