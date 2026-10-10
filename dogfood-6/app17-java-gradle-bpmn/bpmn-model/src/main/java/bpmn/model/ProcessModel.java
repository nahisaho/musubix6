package bpmn.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** @id CODE-MODEL-001 @implements REQ-MODEL-001 */
public class ProcessModel {
    private final String id;
    private final List<Node> nodes;
    private final List<Flow> flows;
    private final Map<String, Node> byId = new HashMap<>();
    private final Map<String, List<Flow>> out = new HashMap<>();
    private final Map<String, List<Flow>> in = new HashMap<>();

    public ProcessModel(String id, List<Node> nodes, List<Flow> flows) {
        this.id = id;
        this.nodes = List.copyOf(nodes);
        this.flows = List.copyOf(flows);
        for (Node n : this.nodes) byId.putIfAbsent(n.id(), n);
        for (Flow f : this.flows) {
            out.computeIfAbsent(f.from(), k -> new ArrayList<>()).add(f);
            in.computeIfAbsent(f.to(), k -> new ArrayList<>()).add(f);
        }
    }

    public String id() { return id; }
    public List<Node> nodes() { return nodes; }
    public List<Flow> flows() { return flows; }
    public Node node(String id) { return byId.get(id); }
    public List<Flow> outgoing(String id) { return out.getOrDefault(id, List.of()); }
    public List<Flow> incoming(String id) { return in.getOrDefault(id, List.of()); }

    /** Position of this exact flow instance in {@link #flows()}, or -1. */
    public int indexOf(Flow f) {
        for (int k = 0; k < flows.size(); k++) if (flows.get(k) == f) return k;
        return -1;
    }

    public List<Integer> incomingIndexes(String id) {
        List<Integer> r = new ArrayList<>();
        for (int k = 0; k < flows.size(); k++) if (flows.get(k).to().equals(id)) r.add(k);
        return r;
    }
}
